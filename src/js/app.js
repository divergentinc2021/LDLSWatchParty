// ============================================
// Watch Party - Main Application
// ============================================

import * as api from './api.js';
import * as webrtc from './webrtc.js';

const APP_URL = window.location.origin;

// ============================================
// State
// ============================================

let currentRoom = null;
let currentToken = null;
let currentEmail = null;
let currentUser = null;
let isHost = false;
let canShareScreen = false;
let hasPassword = false;
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
const pendingRoomCode = document.getElementById('pending-room-code');
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
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setButtonLoading(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
}

function getShareableUrl() {
  if (currentToken) {
    return `${APP_URL}/${currentRoom}-${currentToken}`;
  }
  return `${APP_URL}/?code=${currentRoom}`;
}

// ============================================
// Room Creation (Step 1: API call, show pending)
// ============================================

async function handleCreateRoom(name, email, password) {
  console.log('Creating room for:', name, email);
  
  try {
    const result = await api.createRoom(email, name, password);
    console.log('Create room result:', result);
    
    if (result.success) {
      currentRoom = result.code;
      currentToken = result.token;
      pendingRoomCode.textContent = result.code;
      showView('pending');
      showToast('Room created! Check your email for the link.', 'success');
    } else {
      showToast(result.error || 'Failed to create room', 'error');
    }
  } catch (err) {
    console.error('Create room error:', err);
    showToast('Network error. Please check your connection.', 'error');
  }
}

async function handleJoinRoom(code, name, email, password) {
  console.log('Joining room:', code, 'as:', name);
  
  try {
    const result = await api.joinRoom(code, email, name, password);
    console.log('Join room result:', result);
    
    if (result.success) {
      currentRoom = result.code;
      currentToken = result.token;
      pendingRoomCode.textContent = result.code;
      showView('pending');
      showToast('Check your email for the room link!', 'success');
    } else {
      showToast(result.error || 'Failed to join room', 'error');
    }
  } catch (err) {
    console.error('Join room error:', err);
    showToast('Network error. Please check your connection.', 'error');
  }
}

// ============================================
// Enter Room (Step 2: From email link)
// ============================================

async function enterRoomFromLink(code, token, email) {
  console.log('Entering room from link:', code, 'email:', email);
  
  try {
    // Verify access with backend
    const result = await api.verifyAccess(code, token, email);
    console.log('Verify access result:', result);
    
    if (!result.success || !result.hasAccess) {
      showToast(result.error || 'Access denied', 'error');
      showView('landing');
      return;
    }
    
    // Set state from verification
    currentRoom = code;
    currentToken = token;
    currentEmail = email;
    isHost = result.isHost;
    canShareScreen = result.isHost;
    hasPassword = result.hasPassword || false;
    
    const userName = result.name || email.split('@')[0];
    const odId = generateUserId();
    currentUser = { id: odId, name: userName, email };
    
    // Enter the actual room
    await enterRoom(code, token, odId, userName, isHost, hasPassword);
    
  } catch (err) {
    console.error('Enter room error:', err);
    showToast('Failed to join room. Please try again.', 'error');
    showView('landing');
  }
}

async function enterRoom(roomCode, token, odId, userName, hostStatus, roomHasPassword) {
  console.log('Entering room:', roomCode, 'as', userName, 'host:', hostStatus);
  
  // Update state
  isHost = hostStatus;
  canShareScreen = hostStatus;
  hasPassword = roomHasPassword;
  
  // Update UI
  headerRoomCode.textContent = roomCode;
  shareUrl.textContent = getShareableUrl();
  hostBadge.classList.toggle('hidden', !isHost);
  passwordBadge.classList.toggle('hidden', !hasPassword);
  btnScreen.disabled = !canShareScreen;
  
  screenPlaceholderText.textContent = isHost 
    ? 'Click "Screen" to share your screen' 
    : 'Waiting for host to share screen';
  
  // Add self to participants
  participants.set(odId, { name: userName, isHost: hostStatus, canShare: hostStatus });
  updateParticipantsList();
  
  // Update URL (clean, without email query param for display)
  window.history.replaceState({ room: roomCode }, '', `/${roomCode}-${token}`);
  
  try {
    // Initialize WebRTC
    webrtc.setCallbacks({
      onPeerOpen: (id) => {
        console.log('Peer ready:', id);
        addSystemMessage('You joined the party');
      },
      onPeerError: (err) => {
        console.error('Peer error:', err);
        showToast('Connection error', 'error');
      },
      onConnection: (peerId, peerData) => handlePeerConnection(peerId, peerData),
      onDisconnection: (peerId) => handlePeerDisconnection(peerId),
      onRemoteStream: (peerId, stream) => addRemoteVideo(peerId, stream),
      onScreenStream: (peerId, stream) => handleScreenStream(peerId, stream),
      onChatMessage: (peerId, data) => addChatMessage(data.displayName, data.text, data.timestamp),
      onControlMessage: (peerId, data) => handleControlMessage(peerId, data)
    });
    
    await webrtc.initPeer(roomCode, odId, {
      name: userName,
      odId: odId,
      isHost: hostStatus,
      canShare: canShareScreen
    });
    
    showView('room');
    showToast(`Welcome to room ${roomCode}!`, 'success');
    
  } catch (err) {
    console.error('WebRTC init error:', err);
    showToast('Failed to connect', 'error');
    showView('landing');
  }
}

function handleScreenStream(peerId, stream) {
  screenVideo.srcObject = stream;
  screenVideo.classList.add('has-stream');
  screenPlaceholder.classList.add('hidden');
  
  stream.getVideoTracks()[0].onended = () => {
    screenVideo.srcObject = null;
    screenVideo.classList.remove('has-stream');
    screenPlaceholder.classList.remove('hidden');
  };
}

function handlePeerConnection(peerId, peerData) {
  if (!peerData) return;
  
  const incomingOdId = peerData.odId || peerId;
  
  // Host validates incoming connections
  if (isHost && bannedUsers.has(incomingOdId)) {
    webrtc.sendControlMessage({ type: 'kicked', targetOdId: incomingOdId });
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
  currentEmail = null;
  currentUser = null;
  isHost = false;
  canShareScreen = false;
  hasPassword = false;
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
  
  window.history.pushState({}, '', '/');
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
          <button class="btn-grant-screen" data-od-id="${odId}">${data.canShare ? 'Revoke' : 'Screen'}</button>
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
  
  // Event listeners for host actions
  participantsList.querySelectorAll('.btn-grant-screen').forEach(btn => {
    btn.addEventListener('click', () => toggleScreenPermission(btn.dataset.odId));
  });
  
  participantsList.querySelectorAll('.btn-kick').forEach(btn => {
    btn.addEventListener('click', () => kickParticipant(btn.dataset.odId));
  });
}

function toggleScreenPermission(targetOdId) {
  const participant = participants.get(targetOdId);
  if (!participant) return;
  
  participant.canShare = !participant.canShare;
  updateParticipantsList();
  
  webrtc.sendControlMessage({
    type: 'screenPermission',
    targetOdId: targetOdId,
    canShare: participant.canShare
  });
  
  showToast(`${participant.canShare ? 'Granted' : 'Revoked'} screen share for ${participant.name}`, 'success');
}

function kickParticipant(targetOdId) {
  const participant = participants.get(targetOdId);
  if (!participant || !isHost) return;
  
  bannedUsers.add(targetOdId);
  webrtc.sendControlMessage({ type: 'kicked', targetOdId: targetOdId });
  
  addSystemMessage(`${participant.name} was removed`);
  participants.delete(targetOdId);
  if (participant.peerId) removeRemoteVideo(participant.peerId);
  updateParticipantsList();
  showToast(`Removed ${participant.name}`, 'success');
}

function handleControlMessage(peerId, data) {
  switch (data.type) {
    case 'screenPermission':
      if (data.targetOdId === currentUser?.id) {
        canShareScreen = data.canShare;
        btnScreen.disabled = !canShareScreen;
        showToast(canShareScreen ? 'You can now share your screen' : 'Screen share revoked', 'info');
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
// Video & Chat
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
      if (data.peerId === peerId) { peerName = data.name; break; }
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

// Create Room Form
createForm.addEventListener('submit', async (e) => {
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
  await handleCreateRoom(name, email, password);
  setButtonLoading(btn, false);
});

// Join Room Form
joinForm.addEventListener('submit', async (e) => {
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
  await handleJoinRoom(code, name, email, password);
  setButtonLoading(btn, false);
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

// Media Controls
btnMic.addEventListener('click', async () => {
  const isActive = btnMic.dataset.active === 'true';
  if (!isActive) {
    try {
      const stream = await webrtc.getLocalStream(true, btnCam.dataset.active === 'true');
      localVideo.srcObject = stream;
      btnMic.dataset.active = 'true';
    } catch (err) { showToast('Could not access microphone', 'error'); }
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
    } catch (err) { showToast('Could not access camera', 'error'); }
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
      if (err.name !== 'NotAllowedError') showToast('Could not share screen', 'error');
    }
  } else {
    webrtc.stopScreenShare();
    screenVideo.srcObject = null;
    screenVideo.classList.remove('has-stream');
    screenPlaceholder.classList.remove('hidden');
    btnScreen.dataset.active = 'false';
  }
});

// Copy buttons
btnCopyRoom.addEventListener('click', () => {
  navigator.clipboard.writeText(getShareableUrl());
  showToast('Link copied!', 'success');
});

btnCopyLink.addEventListener('click', () => {
  navigator.clipboard.writeText(getShareableUrl());
  showToast('Link copied!', 'success');
});

// Navigation
btnLeave.addEventListener('click', leaveRoom);
btnBackLanding.addEventListener('click', () => showView('landing'));
btnBackHome.addEventListener('click', () => showView('landing'));

// ============================================
// Initialization
// ============================================

async function init() {
  console.log('Watch Party initializing...');
  
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  
  // Check for email link format: /CODE-TOKEN?email=xxx
  const linkMatch = path.match(/^\/([A-Z0-9]{5})-([a-z0-9]{10,})$/i);
  
  if (linkMatch && params.get('email')) {
    const code = linkMatch[1].toUpperCase();
    const token = linkMatch[2].toLowerCase();
    const email = decodeURIComponent(params.get('email'));
    
    console.log('Detected email link:', code, token, email);
    await enterRoomFromLink(code, token, email);
    return;
  }
  
  // Check for just room code in URL: /CODE
  const codeMatch = path.match(/^\/([A-Z0-9]{5})$/i);
  if (codeMatch) {
    inputCode.value = codeMatch[1].toUpperCase();
    joinName.focus();
    showView('landing');
    return;
  }
  
  // Check for code query param: ?code=XXXXX
  if (params.get('code')) {
    inputCode.value = params.get('code').toUpperCase();
    joinName.focus();
  }
  
  showView('landing');
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (currentRoom) webrtc.disconnect();
});

// Start the app
init().catch(err => {
  console.error('Init error:', err);
  showToast('Failed to initialize', 'error');
});
