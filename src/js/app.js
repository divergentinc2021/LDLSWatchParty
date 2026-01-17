// ============================================
// Watch Party - Main Application (v2 with Security)
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
let currentToken = null;
let currentPassword = null;
let currentUser = null;
let isHost = false;
let canShareScreen = false;
let participants = new Map(); // odId -> { name, isHost, canShare, peerId }
let bannedUsers = new Set(); // odIds that have been kicked
let chatMessages = [];

// ============================================
// DOM Elements
// ============================================

const views = {
  landing: document.getElementById('view-landing'),
  room: document.getElementById('view-room'),
  kicked: document.getElementById('view-kicked')
};

// Landing
const createForm = document.getElementById('create-form');
const createName = document.getElementById('create-name');
const createPassword = document.getElementById('create-password');
const joinForm = document.getElementById('join-form');
const inputCode = document.getElementById('input-code');
const joinName = document.getElementById('join-name');
const joinPassword = document.getElementById('join-password');

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

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateToken() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 10; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function generateUserId() {
  return Math.random().toString(36).substring(2, 10);
}

// Hash password for comparison (simple hash, not for production security)
function hashPassword(password) {
  if (!password) return null;
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function showView(viewName) {
  Object.keys(views).forEach(key => {
    views[key].classList.toggle('active', key === viewName);
  });
  
  // Update URL
  if (viewName === 'room' && currentRoom && currentToken) {
    window.history.pushState({ room: currentRoom }, '', `/${currentRoom}-${currentToken}`);
  } else if (viewName === 'landing' || viewName === 'kicked') {
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

function getShareableUrl() {
  return `${APP_URL}/${currentRoom}-${currentToken}`;
}

// ============================================
// Room Management
// ============================================

async function createRoom(userName, password) {
  const roomCode = generateRoomCode();
  const token = generateToken();
  const odId = generateUserId();
  const passwordHash = hashPassword(password);
  
  currentRoom = roomCode;
  currentToken = token;
  currentPassword = passwordHash;
  currentUser = { id: odId, name: userName };
  isHost = true;
  canShareScreen = true;
  
  // Store session
  sessionStorage.setItem('wp_session', JSON.stringify({
    odId,
    room: roomCode,
    token: token,
    passwordHash: passwordHash,
    name: userName,
    isHost: true
  }));
  
  await enterRoom(roomCode, token, odId, userName, true, passwordHash);
}

async function joinRoom(roomCode, userName, password) {
  const normalizedCode = roomCode.toUpperCase().trim();
  const odId = generateUserId();
  const passwordHash = hashPassword(password);
  
  currentRoom = normalizedCode;
  currentUser = { id: odId, name: userName };
  isHost = false;
  canShareScreen = false;
  
  // Token will be received from host via WebRTC
  // For now, we need to connect and validate
  
  // Store partial session (token comes from URL or host)
  sessionStorage.setItem('wp_session', JSON.stringify({
    odId,
    room: normalizedCode,
    token: currentToken, // May be null if joining via code
    passwordHash: passwordHash,
    name: userName,
    isHost: false
  }));
  
  await enterRoom(normalizedCode, currentToken, odId, userName, false, passwordHash);
}

async function enterRoom(roomCode, token, odId, userName, hostStatus, passwordHash) {
  console.log('Entering room:', roomCode, 'as', userName, 'host:', hostStatus);
  
  isHost = hostStatus;
  canShareScreen = hostStatus;
  currentToken = token;
  currentPassword = passwordHash;
  
  // Update UI
  headerRoomCode.textContent = roomCode;
  hostBadge.classList.toggle('hidden', !isHost);
  passwordBadge.classList.toggle('hidden', !passwordHash);
  btnScreen.disabled = !canShareScreen;
  
  if (token) {
    shareUrl.textContent = `${APP_URL}/${roomCode}-${token}`;
  } else {
    shareUrl.textContent = `Code: ${roomCode}`;
  }
  
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
    
    await webrtc.initPeer(roomCode, odId, {
      name: userName,
      odId: odId,
      isHost: hostStatus,
      canShare: canShareScreen,
      passwordHash: passwordHash,
      token: token
    });
    
    showView('room');
    showToast(`Welcome to room ${roomCode}!`, 'success');
    
  } catch (err) {
    console.error('Failed to enter room:', err);
    showToast('Failed to join room. Please try again.', 'error');
    showView('landing');
  }
}

function handlePeerConnection(peerId, peerData) {
  if (!peerData) return;
  
  const incomingOdId = peerData.odId || peerId;
  
  // Host validates incoming connections
  if (isHost) {
    // Check if banned
    if (bannedUsers.has(incomingOdId)) {
      console.log('Rejecting banned user:', incomingOdId);
      webrtc.sendControlMessage({ type: 'kicked', targetOdId: incomingOdId, reason: 'You have been banned from this room' });
      return;
    }
    
    // Check password if room has one
    if (currentPassword && peerData.passwordHash !== currentPassword) {
      console.log('Rejecting user with wrong password:', incomingOdId);
      webrtc.sendControlMessage({ type: 'kicked', targetOdId: incomingOdId, reason: 'Incorrect password' });
      return;
    }
    
    // Send room info to new participant
    webrtc.sendControlMessage({
      type: 'roomInfo',
      targetOdId: incomingOdId,
      token: currentToken,
      hasPassword: !!currentPassword
    });
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
  currentPassword = null;
  currentUser = null;
  isHost = false;
  canShareScreen = false;
  participants.clear();
  bannedUsers.clear();
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
    
    let actionsHtml = '';
    if (isHost && !data.isHost && !isSelf) {
      actionsHtml = `
        <div class="participant-actions">
          <button class="btn-grant-screen" data-od-id="${odId}" title="${data.canShare ? 'Revoke screen share' : 'Grant screen share'}">
            ${data.canShare ? 'Revoke' : 'Screen'}
          </button>
          <button class="btn-kick" data-od-id="${odId}" title="Remove from room">
            Kick
          </button>
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
  
  // Grant/Revoke screen share
  participantsList.querySelectorAll('.btn-grant-screen').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetOdId = btn.dataset.odId;
      const participant = participants.get(targetOdId);
      if (participant) {
        const newCanShare = !participant.canShare;
        participant.canShare = newCanShare;
        updateParticipantsList();
        
        webrtc.sendControlMessage({
          type: 'screenPermission',
          targetOdId: targetOdId,
          canShare: newCanShare
        });
        
        showToast(`${newCanShare ? 'Granted' : 'Revoked'} screen share for ${participant.name}`, 'success');
      }
    });
  });
  
  // Kick button
  participantsList.querySelectorAll('.btn-kick').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetOdId = btn.dataset.odId;
      kickParticipant(targetOdId);
    });
  });
}

function kickParticipant(targetOdId) {
  const participant = participants.get(targetOdId);
  if (!participant || !isHost) return;
  
  // Add to ban list
  bannedUsers.add(targetOdId);
  
  // Send kick message
  webrtc.sendControlMessage({
    type: 'kicked',
    targetOdId: targetOdId,
    reason: 'You have been removed by the host'
  });
  
  // Remove from local participants
  addSystemMessage(`${participant.name} was removed`);
  participants.delete(targetOdId);
  
  // Close connection
  if (participant.peerId) {
    removeRemoteVideo(participant.peerId);
  }
  
  updateParticipantsList();
  showToast(`Removed ${participant.name}`, 'success');
}

function handleControlMessage(peerId, data) {
  console.log('Control message:', data);
  
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
      
    case 'roomInfo':
      if (data.targetOdId === currentUser?.id) {
        // Received room info from host
        if (data.token && !currentToken) {
          currentToken = data.token;
          shareUrl.textContent = getShareableUrl();
          
          // Update session
          const session = JSON.parse(sessionStorage.getItem('wp_session') || '{}');
          session.token = data.token;
          sessionStorage.setItem('wp_session', JSON.stringify(session));
        }
        passwordBadge.classList.toggle('hidden', !data.hasPassword);
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

// Create room
createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = createName.value.trim();
  const password = createPassword.value;
  
  if (!name) return;
  
  createForm.querySelector('button').disabled = true;
  await createRoom(name, password);
  createForm.querySelector('button').disabled = false;
});

// Join room
joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = inputCode.value.trim();
  const name = joinName.value.trim();
  const password = joinPassword.value;
  
  if (!code || code.length !== 5 || !name) {
    showToast('Please enter a valid 5-character code and your name', 'error');
    return;
  }
  
  joinForm.querySelector('button').disabled = true;
  await joinRoom(code, name, password);
  joinForm.querySelector('button').disabled = false;
});

// Auto-uppercase room code
inputCode.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
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
  const url = currentToken ? getShareableUrl() : `Room Code: ${currentRoom}`;
  navigator.clipboard.writeText(currentToken ? getShareableUrl() : currentRoom);
  showToast('Copied!', 'success');
});

btnCopyLink.addEventListener('click', () => {
  if (currentToken) {
    navigator.clipboard.writeText(getShareableUrl());
    showToast('Link copied!', 'success');
  } else {
    navigator.clipboard.writeText(currentRoom);
    showToast('Code copied!', 'success');
  }
});

// Leave room
btnLeave.addEventListener('click', leaveRoom);

// Back home from kicked
btnBackHome.addEventListener('click', () => {
  showView('landing');
});

// Handle browser back/forward
window.addEventListener('popstate', (e) => {
  if (e.state?.room && !currentRoom) {
    checkUrlAndSession();
  } else if (!e.state?.room && currentRoom) {
    leaveRoom();
  }
});

// ============================================
// Initialization
// ============================================

async function checkUrlAndSession() {
  const path = window.location.pathname;
  
  // Match /XXXXX-xxxxxxxxxx (code-token) or /XXXXX (code only)
  const fullMatch = path.match(/^\/([A-Z0-9]{5})-([a-z0-9]{10})$/i);
  const codeMatch = path.match(/^\/([A-Z0-9]{5})$/i);
  
  if (fullMatch) {
    // URL has both code and token
    const roomCode = fullMatch[1].toUpperCase();
    const token = fullMatch[2].toLowerCase();
    
    currentToken = token;
    
    // Check for existing session
    const sessionData = sessionStorage.getItem('wp_session');
    if (sessionData) {
      try {
        const session = JSON.parse(sessionData);
        if (session.room === roomCode && session.token === token) {
          // Rejoin with existing session
          await enterRoom(session.room, session.token, session.odId, session.name, session.isHost, session.passwordHash);
          return true;
        }
      } catch (e) {
        sessionStorage.removeItem('wp_session');
      }
    }
    
    // New join via link - show join form with code pre-filled
    inputCode.value = roomCode;
    joinName.focus();
    showView('landing');
    return true;
    
  } else if (codeMatch) {
    // URL has code only (someone typed it manually)
    const roomCode = codeMatch[1].toUpperCase();
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
