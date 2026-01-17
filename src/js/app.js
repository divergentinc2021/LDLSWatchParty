// ============================================
// Watch Party - Main Application (v2 Simplified)
// ============================================

import * as webrtc from './webrtc.js';

// ============================================
// Configuration
// ============================================

const APP_URL = window.location.origin;

// ============================================
// State
// ============================================

let currentRoom = null;
let currentUser = null;
let isHost = false;
let canShareScreen = false;
let participants = new Map(); // odId -> { name, isHost, canShare }
let chatMessages = [];

// ============================================
// DOM Elements
// ============================================

const views = {
  landing: document.getElementById('view-landing'),
  room: document.getElementById('view-room')
};

// Landing
const createForm = document.getElementById('create-form');
const createName = document.getElementById('create-name');
const joinForm = document.getElementById('join-form');
const inputCode = document.getElementById('input-code');
const joinName = document.getElementById('join-name');

// Room
const headerRoomCode = document.getElementById('header-room-code');
const hostBadge = document.getElementById('host-badge');
const btnCopyRoom = document.getElementById('btn-copy-room');
const btnLeave = document.getElementById('btn-leave');
const participantCount = document.getElementById('participant-count');
const screenVideo = document.getElementById('screen-video');
const screenPlaceholder = document.getElementById('screen-placeholder');
const screenPlaceholderText = document.getElementById('screen-placeholder-text');
const localVideo = document.getElementById('local-video');
const webcamGrid = document.getElementById('webcam-grid');
const participantsList = document.getElementById('participants-list');
const chatMessagesEl = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const btnMic = document.getElementById('btn-mic');
const btnCam = document.getElementById('btn-cam');
const btnScreen = document.getElementById('btn-screen');
const shareUrl = document.getElementById('share-url');
const btnCopyLink = document.getElementById('btn-copy-link');

// Toast
const toastContainer = document.getElementById('toast-container');

// ============================================
// Utility Functions
// ============================================

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateUserId() {
  return Math.random().toString(36).substring(2, 10);
}

function showView(viewName) {
  Object.keys(views).forEach(key => {
    views[key].classList.toggle('active', key === viewName);
  });
  
  // Update URL
  if (viewName === 'room' && currentRoom) {
    window.history.pushState({ room: currentRoom }, '', `/${currentRoom}`);
  } else if (viewName === 'landing') {
    window.history.pushState({}, '', '/');
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================
// Room Management
// ============================================

async function createRoom(userName) {
  const roomCode = generateRoomCode();
  const odId = generateUserId();
  
  currentRoom = roomCode;
  currentUser = { id: odId, name: userName };
  isHost = true;
  canShareScreen = true;
  
  // Store session
  sessionStorage.setItem('wp_session', JSON.stringify({
    odId,
    room: roomCode,
    name: userName,
    isHost: true
  }));
  
  await enterRoom(roomCode, odId, userName, true);
}

async function joinRoom(roomCode, userName) {
  const normalizedCode = roomCode.toUpperCase().trim();
  const odId = generateUserId();
  
  currentRoom = normalizedCode;
  currentUser = { id: odId, name: userName };
  isHost = false;
  canShareScreen = false;
  
  // Store session
  sessionStorage.setItem('wp_session', JSON.stringify({
    odId,
    room: normalizedCode,
    name: userName,
    isHost: false
  }));
  
  await enterRoom(normalizedCode, odId, userName, false);
}

async function enterRoom(roomCode, odId, userName, hostStatus) {
  console.log('Entering room:', roomCode, 'as', userName, 'host:', hostStatus);
  
  isHost = hostStatus;
  canShareScreen = hostStatus;
  
  // Update UI
  headerRoomCode.textContent = roomCode;
  shareUrl.textContent = `${APP_URL}/${roomCode}`;
  hostBadge.classList.toggle('hidden', !isHost);
  btnScreen.disabled = !canShareScreen;
  
  if (isHost) {
    screenPlaceholderText.textContent = 'Click "Screen" to share your screen';
  } else {
    screenPlaceholderText.textContent = 'Waiting for host to share screen';
  }
  
  // Add self to participants
  participants.set(odId, { name: userName, isHost: hostStatus, canShare: hostStatus });
  updateParticipantsList();
  
  try {
    // Initialize WebRTC
    webrtc.setCallbacks({
      onPeerOpen: (id) => {
        console.log('Peer ready:', id);
        addSystemMessage('You joined the party');
      },
      onPeerError: (err) => {
        console.error('Peer error:', err);
        showToast('Connection error. Please refresh.', 'error');
      },
      onConnection: (peerId, peerData) => {
        console.log('Peer connected:', peerId, peerData);
        if (peerData) {
          participants.set(peerData.odId || peerId, {
            name: peerData.name || 'Guest',
            isHost: peerData.isHost || false,
            canShare: peerData.canShare || false,
            peerId: peerId
          });
          updateParticipantsList();
          addSystemMessage(`${peerData.name || 'Guest'} joined`);
        }
      },
      onDisconnection: (peerId) => {
        // Find and remove participant by peerId
        for (const [id, data] of participants) {
          if (data.peerId === peerId) {
            addSystemMessage(`${data.name} left`);
            participants.delete(id);
            break;
          }
        }
        removeRemoteVideo(peerId);
        updateParticipantsList();
      },
      onRemoteStream: (peerId, stream) => {
        addRemoteVideo(peerId, stream);
      },
      onScreenStream: (peerId, stream) => {
        screenVideo.srcObject = stream;
        screenVideo.classList.add('has-stream');
        screenPlaceholder.classList.add('hidden');
        
        // When remote screen share ends
        stream.getVideoTracks()[0].onended = () => {
          screenVideo.srcObject = null;
          screenVideo.classList.remove('has-stream');
          screenPlaceholder.classList.remove('hidden');
        };
      },
      onChatMessage: (peerId, data) => {
        addChatMessage(data.displayName, data.text, data.timestamp);
      },
      onControlMessage: (peerId, data) => {
        handleControlMessage(data);
      }
    });
    
    await webrtc.initPeer(roomCode, odId, {
      name: userName,
      isHost: hostStatus,
      canShare: canShareScreen
    });
    
    showView('room');
    showToast(`Welcome to room ${roomCode}!`, 'success');
    
  } catch (err) {
    console.error('Failed to enter room:', err);
    showToast('Failed to join room. Please try again.', 'error');
    showView('landing');
  }
}

function leaveRoom() {
  webrtc.disconnect();
  
  currentRoom = null;
  currentUser = null;
  isHost = false;
  canShareScreen = false;
  participants.clear();
  chatMessages = [];
  
  sessionStorage.removeItem('wp_session');
  
  // Reset UI
  btnMic.dataset.active = 'false';
  btnCam.dataset.active = 'false';
  btnScreen.dataset.active = 'false';
  btnScreen.disabled = true;
  localVideo.srcObject = null;
  screenVideo.srcObject = null;
  screenVideo.classList.remove('has-stream');
  screenPlaceholder.classList.remove('hidden');
  chatMessagesEl.innerHTML = '';
  participantsList.innerHTML = '';
  
  document.querySelectorAll('.webcam-tile.remote').forEach(el => el.remove());
  
  showView('landing');
}

// ============================================
// Participants Management
// ============================================

function updateParticipantsList() {
  const count = participants.size;
  participantCount.querySelector('span:last-child').textContent = count;
  
  participantsList.innerHTML = '';
  
  participants.forEach((data, odId) => {
    const item = document.createElement('div');
    item.className = 'participant-item';
    item.dataset.odId = odId;
    
    const isSelf = currentUser && currentUser.id === odId;
    
    item.innerHTML = `
      <div class="participant-info">
        <span class="participant-name">${escapeHtml(data.name)}${isSelf ? ' (You)' : ''}</span>
        ${data.isHost ? '<span class="participant-host-tag">Host</span>' : ''}
      </div>
      ${isHost && !data.isHost && !isSelf ? `
        <div class="participant-actions">
          <button class="btn-grant-screen" data-od-id="${odId}" title="Grant screen share">
            ${data.canShare ? 'Revoke Screen' : 'Grant Screen'}
          </button>
        </div>
      ` : ''}
    `;
    
    participantsList.appendChild(item);
  });
  
  // Add click handlers for grant/revoke buttons
  participantsList.querySelectorAll('.btn-grant-screen').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetOdId = btn.dataset.odId;
      const participant = participants.get(targetOdId);
      if (participant) {
        const newCanShare = !participant.canShare;
        participant.canShare = newCanShare;
        updateParticipantsList();
        
        // Send control message to peer
        webrtc.sendControlMessage({
          type: 'screenPermission',
          targetOdId: targetOdId,
          canShare: newCanShare
        });
        
        showToast(`${newCanShare ? 'Granted' : 'Revoked'} screen share for ${participant.name}`, 'success');
      }
    });
  });
}

function handleControlMessage(data) {
  if (data.type === 'screenPermission' && data.targetOdId === currentUser?.id) {
    canShareScreen = data.canShare;
    btnScreen.disabled = !canShareScreen;
    showToast(canShareScreen ? 'You can now share your screen' : 'Screen share permission revoked', 'info');
  }
}

// ============================================
// Video Management
// ============================================

function addRemoteVideo(peerId, stream) {
  let tile = document.getElementById(`remote-${peerId}`);
  
  if (!tile) {
    tile = document.createElement('div');
    tile.id = `remote-${peerId}`;
    tile.className = 'webcam-tile remote';
    
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    
    const nameEl = document.createElement('span');
    nameEl.className = 'webcam-name';
    
    // Find participant name
    let peerName = 'Guest';
    for (const [id, data] of participants) {
      if (data.peerId === peerId) {
        peerName = data.name;
        break;
      }
    }
    nameEl.textContent = peerName;
    
    tile.appendChild(video);
    tile.appendChild(nameEl);
    webcamGrid.appendChild(tile);
  }
  
  tile.querySelector('video').srcObject = stream;
}

function removeRemoteVideo(peerId) {
  const tile = document.getElementById(`remote-${peerId}`);
  if (tile) tile.remove();
}

// ============================================
// Chat
// ============================================

function addChatMessage(sender, text, timestamp) {
  chatMessages.push({ sender, text, timestamp });
  renderChatMessages();
}

function addSystemMessage(text) {
  chatMessages.push({ type: 'system', text, timestamp: Date.now() });
  renderChatMessages();
}

function renderChatMessages() {
  chatMessagesEl.innerHTML = chatMessages.map(msg => {
    if (msg.type === 'system') {
      return `<div class="chat-message system"><span class="text">${escapeHtml(msg.text)}</span></div>`;
    }
    return `
      <div class="chat-message">
        <span class="sender">${escapeHtml(msg.sender)}</span>
        <span class="text">${escapeHtml(msg.text)}</span>
        <span class="time">${formatTime(msg.timestamp)}</span>
      </div>
    `;
  }).join('');
  
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// ============================================
// Event Listeners
// ============================================

// Create room
createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = createName.value.trim();
  if (!name) return;
  
  createForm.querySelector('button').disabled = true;
  await createRoom(name);
  createForm.querySelector('button').disabled = false;
});

// Join room
joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = inputCode.value.trim();
  const name = joinName.value.trim();
  
  if (!code || code.length !== 5 || !name) {
    showToast('Please enter a valid code and your name', 'error');
    return;
  }
  
  joinForm.querySelector('button').disabled = true;
  await joinRoom(code, name);
  joinForm.querySelector('button').disabled = false;
});

// Auto-uppercase room code
inputCode.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

// Chat
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !currentUser) return;
  
  chatInput.value = '';
  const message = webrtc.sendChatMessage(currentUser.name, text);
  addChatMessage(currentUser.name, text, message.timestamp);
});

// Media controls
btnMic.addEventListener('click', async () => {
  const isActive = btnMic.dataset.active === 'true';
  
  if (!isActive) {
    try {
      const stream = await webrtc.getLocalStream(true, btnCam.dataset.active === 'true');
      localVideo.srcObject = stream;
      btnMic.dataset.active = 'true';
    } catch (err) {
      showToast('Could not access microphone', 'error');
    }
  } else {
    webrtc.toggleMic(false);
    btnMic.dataset.active = 'false';
  }
});

btnCam.addEventListener('click', async () => {
  const isActive = btnCam.dataset.active === 'true';
  
  if (!isActive) {
    try {
      const stream = await webrtc.getLocalStream(btnMic.dataset.active === 'true', true);
      localVideo.srcObject = stream;
      btnCam.dataset.active = 'true';
    } catch (err) {
      showToast('Could not access camera', 'error');
    }
  } else {
    webrtc.toggleCamera(false);
    btnCam.dataset.active = 'false';
  }
});

btnScreen.addEventListener('click', async () => {
  if (!canShareScreen) {
    showToast('You don\'t have permission to share screen', 'error');
    return;
  }
  
  const isActive = btnScreen.dataset.active === 'true';
  
  if (!isActive) {
    try {
      const stream = await webrtc.startScreenShare();
      screenVideo.srcObject = stream;
      screenVideo.classList.add('has-stream');
      screenPlaceholder.classList.add('hidden');
      btnScreen.dataset.active = 'true';
      
      stream.getVideoTracks()[0].onended = () => {
        screenVideo.srcObject = null;
        screenVideo.classList.remove('has-stream');
        screenPlaceholder.classList.remove('hidden');
        btnScreen.dataset.active = 'false';
      };
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        showToast('Could not share screen', 'error');
      }
    }
  } else {
    webrtc.stopScreenShare();
    screenVideo.srcObject = null;
    screenVideo.classList.remove('has-stream');
    screenPlaceholder.classList.remove('hidden');
    btnScreen.dataset.active = 'false';
  }
});

// Copy link
btnCopyRoom.addEventListener('click', () => {
  navigator.clipboard.writeText(`${APP_URL}/${currentRoom}`);
  showToast('Link copied!', 'success');
});

btnCopyLink.addEventListener('click', () => {
  navigator.clipboard.writeText(`${APP_URL}/${currentRoom}`);
  showToast('Link copied!', 'success');
});

// Leave room
btnLeave.addEventListener('click', leaveRoom);

// Handle browser back/forward
window.addEventListener('popstate', (e) => {
  if (e.state?.room && !currentRoom) {
    // Try to rejoin
    checkUrlAndSession();
  } else if (!e.state?.room && currentRoom) {
    leaveRoom();
  }
});

// ============================================
// Initialization
// ============================================

async function checkUrlAndSession() {
  // Check URL for room code
  const path = window.location.pathname;
  const match = path.match(/^\/([A-Z0-9]{5})$/i);
  
  if (match) {
    const roomCode = match[1].toUpperCase();
    
    // Check for existing session
    const sessionData = sessionStorage.getItem('wp_session');
    if (sessionData) {
      try {
        const session = JSON.parse(sessionData);
        if (session.room === roomCode) {
          // Rejoin with existing session
          await enterRoom(session.room, session.odId, session.name, session.isHost);
          return true;
        }
      } catch (e) {
        sessionStorage.removeItem('wp_session');
      }
    }
    
    // New join - pre-fill code and show landing
    inputCode.value = roomCode;
    joinName.focus();
    showView('landing');
    return true;
  }
  
  return false;
}

async function init() {
  console.log('Watch Party v2 initializing...');
  
  const hasRoom = await checkUrlAndSession();
  
  if (!hasRoom) {
    showView('landing');
  }
}

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (currentRoom) {
    webrtc.disconnect();
  }
});

// Start
init().catch(err => {
  console.error('Init error:', err);
  showToast('Failed to initialize', 'error');
});
