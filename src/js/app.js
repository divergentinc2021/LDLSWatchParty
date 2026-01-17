// ============================================
// Watch Party - Main Application
// ============================================

import * as api from './api.js';
import * as webrtc from './webrtc.js';
import { APP_URL } from './config.js';

// ============================================
// State
// ============================================

let currentRoom = null;
let currentToken = null;
let currentUser = null;
let isHost = false;
let canShareScreen = false;
let participants = new Map();
let bannedUsers = new Set();
let chatMessages = [];

// ============================================
// DOM Elements
// ============================================

const views = {
  landing: document.getElementById('view-landing'),
  pending: document.getElementById('view-pending'),
  room: document.getElementById('view-room'),
  kicked: document.getElementById('view-kicked')
};

// Landing
const createForm = document.getElementById('create-form');
const createName = document.getElementById('create-name');
const createEmail = document.getElementById('create-email');
const createPassword = document.getElementById('create-password');
const joinForm = document.getElementById('join-form');
const inputCode = document.getElementById('input-code');
const joinName = document.getElementById('join-name');
const joinEmail = document.getElementById('join-email');
const joinPassword = document.getElementById('join-password');

// Pending
const pendingEmail = document.getElementById('pending-email');
const pendingCode = document.getElementById('pending-code');
const btnBackLanding = document.getElementById('btn-back-landing');

// Room
const headerRoomCode = document.getElementById('header-room-code');
const hostBadge = document.getElementById('host-badge');
const passwordBadge = document.getElementById('password-badge');
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

// Kicked
const btnBackHome = document.getElementById('btn-back-home');

// Toast
const toastContainer = document.getElementById('toast-container');

// ============================================
// Utility Functions
// ============================================

function generateUserId() {
  return Math.random().toString(36).substring(2, 10);
}

function showView(viewName) {
  Object.keys(views).forEach(key => {
    views[key].classList.toggle('active', key === viewName);
  });
  
  if (viewName === 'room' && currentRoom && currentToken) {
    window.history.pushState({ room: currentRoom }, '', `/${currentRoom}-${currentToken}`);
  } else if (viewName === 'landing' || viewName === 'kicked' || viewName === 'pending') {
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

function setButtonLoading(btn, loading) {
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getShareableUrl() {
  return `${APP_URL}/${currentRoom}-${currentToken}`;
}

// ============================================
// Room Management
// ============================================

async function handleCreateRoom(e) {
  e.preventDefault();
  
  const name = createName.value.trim();
  const email = createEmail.value.trim();
  const password = createPassword.value;
  
  if (!name || !email) {
    showToast('Please enter your name and email', 'error');
    return;
  }
  
  const btn = createForm.querySelector('button');
  setButtonLoading(btn, true);
  
  try {
    const result = await api.createRoom(email, name, password);
    
    if (result.success) {
      // Show pending view
      pendingEmail.textContent = email;
      pendingCode.textContent = result.code;
      showView('pending');
      showToast('Check your email for the room link!', 'success');
    } else {
      showToast(result.error || 'Failed to create room', 'error');
    }
  } catch (err) {
    console.error('Create room error:', err);
    showToast('Failed to create room. Please try again.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleJoinRoom(e) {
  e.preventDefault();
  
  const code = inputCode.value.trim().toUpperCase();
  const name = joinName.value.trim();
  const email = joinEmail.value.trim();
  const password = joinPassword.value;
  
  if (!code || code.length !== 5) {
    showToast('Please enter a valid 5-character room code', 'error');
    return;
  }
  
  if (!name || !email) {
    showToast('Please enter your name and email', 'error');
    return;
  }
  
  const btn = joinForm.querySelector('button');
  setButtonLoading(btn, true);
  
  try {
    // First validate the room exists
    const validation = await api.validateRoom(code);
    
    if (!validation.valid) {
      showToast(validation.error || 'Room not found', 'error');
      setButtonLoading(btn, false);
      return;
    }
    
    // Join the room
    const result = await api.joinRoom(code, email, name, password);
    
    if (result.success) {
      pendingEmail.textContent = email;
      pendingCode.textContent = result.code;
      showView('pending');
      showToast('Check your email for the access link!', 'success');
    } else {
      showToast(result.error || 'Failed to join room', 'error');
    }
  } catch (err) {
    console.error('Join room error:', err);
    showToast('Failed to join room. Please try again.', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function enterRoom(roomCode, token, userName, email, hostStatus) {
  console.log('Entering room:', roomCode, 'as', userName, 'host:', hostStatus);
  
  currentRoom = roomCode;
  currentToken = token;
  currentUser = { id: generateUserId(), name: userName, email: email };
  isHost = hostStatus;
  canShareScreen = hostStatus;
  
  // Update UI
  headerRoomCode.textContent = roomCode;
  shareUrl.textContent = getShareableUrl();
  hostBadge.classList.toggle('hidden', !isHost);
  btnScreen.disabled = !canShareScreen;
  
  screenPlaceholderText.textContent = isHost 
    ? 'Click "Screen" to share your screen' 
    : 'Waiting for host to share screen';
  
  // Add self to participants
  participants.set(currentUser.id, { 
    name: userName, 
    isHost: hostStatus, 
    canShare: hostStatus 
  });
  updateParticipantsList();
  
  try {
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
        handlePeerConnection(peerId, peerData);
      },
      onDisconnection: (peerId) => {
        handlePeerDisconnection(peerId);
      },
      onRemoteStream: (peerId, stream) => {
        addRemoteVideo(peerId, stream);
      },
      onScreenStream: (peerId, stream) => {
        screenVideo.srcObject = stream;
        screenVideo.classList.add('has-stream');
        screenPlaceholder.classList.add('hidden');
        
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
        handleControlMessage(peerId, data);
      }
    });
    
    await webrtc.initPeer(roomCode, currentUser.id, {
      name: userName,
      odId: currentUser.id,
      isHost: hostStatus,
      canShare: canShareScreen
    });
    
    showView('room');
    showToast(`Welcome to room ${roomCode}!`, 'success');
    
  } catch (err) {
    console.error('Failed to enter room:', err);
    showToast('Failed to connect. Please try again.', 'error');
    showView('landing');
  }
}

function handlePeerConnection(peerId, peerData) {
  if (!peerData) return;
  
  const incomingOdId = peerData.odId || peerId;
  
  if (isHost && bannedUsers.has(incomingOdId)) {
    webrtc.sendControlMessage({ 
      type: 'kicked', 
      targetOdId: incomingOdId, 
      reason: 'You have been banned from this room' 
    });
    return;
  }
  
  participants.set(incomingOdId, {
    name: peerData.name || 'Guest',
    isHost: peerData.isHost || false,
    canShare: peerData.canShare || false,
    peerId: peerId
  });
  
  updateParticipantsList();
  addSystemMessage(`${peerData.name || 'Guest'} joined`);
}

function handlePeerDisconnection(peerId) {
  for (const [id, data] of participants) {
    if (data.peerId === peerId) {
      addSystemMessage(`${data.name} left`);
      participants.delete(id);
      break;
    }
  }
  removeRemoteVideo(peerId);
  updateParticipantsList();
}

function leaveRoom() {
  webrtc.disconnect();
  
  currentRoom = null;
  currentToken = null;
  currentUser = null;
  isHost = false;
  canShareScreen = false;
  participants.clear();
  bannedUsers.clear();
  chatMessages = [];
  
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
    
    const isSelf = currentUser && currentUser.id === odId;
    
    let actionsHtml = '';
    if (isHost && !data.isHost && !isSelf) {
      actionsHtml = `
        <div class="participant-actions">
          <button class="btn-grant-screen" data-od-id="${odId}">
            ${data.canShare ? 'Revoke' : 'Screen'}
          </button>
          <button class="btn-kick" data-od-id="${odId}">Kick</button>
        </div>
      `;
    }
    
    item.innerHTML = `
      <div class="participant-info">
        <span class="participant-name">${escapeHtml(data.name)}${isSelf ? ' (You)' : ''}</span>
        ${data.isHost ? '<span class="participant-host-tag">Host</span>' : ''}
      </div>
      ${actionsHtml}
    `;
    
    participantsList.appendChild(item);
  });
  
  // Grant/Revoke buttons
  participantsList.querySelectorAll('.btn-grant-screen').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetOdId = btn.dataset.odId;
      const participant = participants.get(targetOdId);
      if (participant) {
        participant.canShare = !participant.canShare;
        updateParticipantsList();
        webrtc.sendControlMessage({
          type: 'screenPermission',
          targetOdId: targetOdId,
          canShare: participant.canShare
        });
        showToast(`${participant.canShare ? 'Granted' : 'Revoked'} screen share for ${participant.name}`, 'success');
      }
    });
  });
  
  // Kick buttons
  participantsList.querySelectorAll('.btn-kick').forEach(btn => {
    btn.addEventListener('click', () => {
      kickParticipant(btn.dataset.odId);
    });
  });
}

function kickParticipant(targetOdId) {
  const participant = participants.get(targetOdId);
  if (!participant || !isHost) return;
  
  bannedUsers.add(targetOdId);
  
  webrtc.sendControlMessage({
    type: 'kicked',
    targetOdId: targetOdId,
    reason: 'You have been removed by the host'
  });
  
  addSystemMessage(`${participant.name} was removed`);
  participants.delete(targetOdId);
  
  if (participant.peerId) {
    removeRemoteVideo(participant.peerId);
  }
  
  updateParticipantsList();
  showToast(`Removed ${participant.name}`, 'success');
}

function handleControlMessage(peerId, data) {
  switch (data.type) {
    case 'screenPermission':
      if (data.targetOdId === currentUser?.id) {
        canShareScreen = data.canShare;
        btnScreen.disabled = !canShareScreen;
        showToast(canShareScreen ? 'You can now share your screen' : 'Screen share permission revoked', 'info');
      }
      break;
      
    case 'kicked':
      if (data.targetOdId === currentUser?.id) {
        webrtc.disconnect();
        showView('kicked');
      }
      break;
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

createForm.addEventListener('submit', handleCreateRoom);
joinForm.addEventListener('submit', handleJoinRoom);

inputCode.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !currentUser) return;
  
  chatInput.value = '';
  const message = webrtc.sendChatMessage(currentUser.name, text);
  addChatMessage(currentUser.name, text, message.timestamp);
});

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

btnCopyRoom.addEventListener('click', () => {
  navigator.clipboard.writeText(getShareableUrl());
  showToast('Link copied!', 'success');
});

btnCopyLink.addEventListener('click', () => {
  navigator.clipboard.writeText(getShareableUrl());
  showToast('Link copied!', 'success');
});

btnLeave.addEventListener('click', leaveRoom);

btnBackLanding.addEventListener('click', () => showView('landing'));
btnBackHome.addEventListener('click', () => showView('landing'));

window.addEventListener('popstate', (e) => {
  if (!e.state?.room && currentRoom) {
    leaveRoom();
  }
});

// ============================================
// Initialization
// ============================================

async function checkUrlAndSession() {
  const path = window.location.pathname;
  
  // Match /XXXXX-xxxxxxxxxx (code-token)
  const fullMatch = path.match(/^\/([A-Z0-9]{5})-([a-z0-9]{10})$/i);
  
  if (fullMatch) {
    const roomCode = fullMatch[1].toUpperCase();
    const token = fullMatch[2].toLowerCase();
    
    try {
      // Verify access via API
      const result = await api.verifyAccess(roomCode, token, '');
      
      if (result.success && result.hasAccess) {
        // Auto-enter room
        await enterRoom(roomCode, token, result.name, result.email, result.isHost);
        return true;
      } else {
        showToast(result.error || 'Invalid or expired link', 'error');
        inputCode.value = roomCode;
      }
    } catch (err) {
      console.error('Verify access error:', err);
      showToast('Could not verify access', 'error');
      inputCode.value = roomCode;
    }
  }
  
  // Match /XXXXX (code only)
  const codeMatch = path.match(/^\/([A-Z0-9]{5})$/i);
  if (codeMatch) {
    inputCode.value = codeMatch[1].toUpperCase();
  }
  
  return false;
}

async function init() {
  console.log('Watch Party initializing...');
  
  const hasRoom = await checkUrlAndSession();
  
  if (!hasRoom) {
    showView('landing');
  }
}

window.addEventListener('beforeunload', () => {
  if (currentRoom) {
    webrtc.disconnect();
  }
});

init().catch(err => {
  console.error('Init error:', err);
  showToast('Failed to initialize', 'error');
  showView('landing');
});
