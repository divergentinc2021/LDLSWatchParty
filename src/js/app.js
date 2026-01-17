// ============================================
// Watch Party - Main Application
// ============================================

import * as api from './api.js';
import * as webrtc from './webrtc.js';

// ============================================
// State
// ============================================

let currentView = 'landing';
let currentRoom = null;
let currentUser = null;
let isHost = false;
let chatMessages = [];

// ============================================
// DOM Elements
// ============================================

const views = {
  landing: document.getElementById('view-landing'),
  auth: document.getElementById('view-auth'),
  room: document.getElementById('view-room')
};

// Landing
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const inputCode = document.getElementById('input-code');

// Auth
const btnBack = document.getElementById('btn-back');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authForm = document.getElementById('auth-form');
const authSuccess = document.getElementById('auth-success');
const authError = document.getElementById('auth-error');
const inputEmail = document.getElementById('input-email');
const inputName = document.getElementById('input-name');
const btnSubmit = document.getElementById('btn-submit');
const btnResend = document.getElementById('btn-resend');
const successEmail = document.getElementById('success-email');
const displayCode = document.getElementById('display-code');
const btnCopyCode = document.getElementById('btn-copy-code');
const roomCodeDisplay = document.getElementById('room-code-display');
const errorMessage = document.getElementById('error-message');

// Room
const headerRoomCode = document.getElementById('header-room-code');
const btnCopyRoom = document.getElementById('btn-copy-room');
const btnInvite = document.getElementById('btn-invite');
const btnLeave = document.getElementById('btn-leave');
const participantCount = document.getElementById('participant-count');
const screenVideo = document.getElementById('screen-video');
const screenPlaceholder = document.getElementById('screen-placeholder');
const localVideo = document.getElementById('local-video');
const webcamGrid = document.getElementById('webcam-grid');
const chatMessagesEl = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const btnMic = document.getElementById('btn-mic');
const btnCam = document.getElementById('btn-cam');
const btnScreen = document.getElementById('btn-screen');

// Modal
const inviteModal = document.getElementById('invite-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const modalRoomCode = document.getElementById('modal-room-code');
const btnCopyModal = document.getElementById('btn-copy-modal');
const inviteForm = document.getElementById('invite-form');
const inviteEmail = document.getElementById('invite-email');

// Toast
const toastContainer = document.getElementById('toast-container');

// ============================================
// View Management
// ============================================

function showView(viewName) {
  console.log('Showing view:', viewName);
  Object.keys(views).forEach(key => {
    views[key].classList.toggle('active', key === viewName);
  });
  currentView = viewName;
}

function resetAuthView() {
  authForm.classList.remove('hidden');
  authSuccess.classList.add('hidden');
  authError.classList.add('hidden');
  inputEmail.value = '';
  inputName.value = '';
  btnSubmit.disabled = false;
  btnSubmit.querySelector('.btn-text').classList.remove('hidden');
  btnSubmit.querySelector('.btn-loading').classList.add('hidden');
}

function showAuthLoading() {
  btnSubmit.disabled = true;
  btnSubmit.querySelector('.btn-text').classList.add('hidden');
  btnSubmit.querySelector('.btn-loading').classList.remove('hidden');
}

function hideAuthLoading() {
  btnSubmit.disabled = false;
  btnSubmit.querySelector('.btn-text').classList.remove('hidden');
  btnSubmit.querySelector('.btn-loading').classList.add('hidden');
}

function showAuthSuccess(email, code = null) {
  authForm.classList.add('hidden');
  authSuccess.classList.remove('hidden');
  authError.classList.add('hidden');
  successEmail.textContent = email;
  
  if (code) {
    displayCode.textContent = code;
    roomCodeDisplay.classList.remove('hidden');
  } else {
    roomCodeDisplay.classList.add('hidden');
  }
}

function showAuthError(message) {
  authError.classList.remove('hidden');
  errorMessage.textContent = message;
  hideAuthLoading();
}

function hideAuthError() {
  authError.classList.add('hidden');
}

// ============================================
// Toast Notifications
// ============================================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ============================================
// Landing Actions
// ============================================

let pendingAction = null; // 'create' | 'join'
let pendingRoomCode = null;

btnCreate.addEventListener('click', () => {
  pendingAction = 'create';
  pendingRoomCode = null;
  authTitle.textContent = 'Create your room';
  authSubtitle.textContent = "We'll email you an access link with your room code";
  resetAuthView();
  showView('auth');
});

btnJoin.addEventListener('click', async () => {
  const code = inputCode.value.trim().toUpperCase();
  
  if (code.length !== 5) {
    showToast('Please enter a 5-character code', 'error');
    return;
  }
  
  // Validate room exists
  try {
    const result = await api.validateRoom(code);
    if (!result.valid) {
      showToast(result.error || 'Room not found', 'error');
      return;
    }
  } catch (err) {
    showToast('Error checking room. Please try again.', 'error');
    return;
  }
  
  pendingAction = 'join';
  pendingRoomCode = code;
  authTitle.textContent = 'Join room';
  authSubtitle.textContent = `Enter your email to join room ${code}`;
  resetAuthView();
  showView('auth');
});

// Auto-uppercase room code input
inputCode.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

// ============================================
// Auth Actions
// ============================================

btnBack.addEventListener('click', () => {
  pendingAction = null;
  pendingRoomCode = null;
  showView('landing');
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = inputEmail.value.trim();
  const name = inputName.value.trim();
  
  if (!email || !email.includes('@')) {
    showAuthError('Please enter a valid email address');
    return;
  }
  
  hideAuthError();
  showAuthLoading();
  
  try {
    let result;
    
    if (pendingAction === 'create') {
      result = await api.createRoom(email, name);
      showAuthSuccess(email, result.code);
      showToast('Room created! Check your email.', 'success');
    } else {
      result = await api.joinRoom(pendingRoomCode, email, name);
      showAuthSuccess(email, pendingRoomCode);
      showToast('Check your email for the access link!', 'success');
    }
    
    // Store for potential direct entry
    localStorage.setItem('wp_email', email);
    localStorage.setItem('wp_name', name || email.split('@')[0]);
    localStorage.setItem('wp_room', result.code || pendingRoomCode);
    
  } catch (err) {
    console.error('Auth error:', err);
    showAuthError(err.message || 'Something went wrong. Please try again.');
  }
});

btnResend.addEventListener('click', async () => {
  const email = localStorage.getItem('wp_email');
  const name = localStorage.getItem('wp_name');
  
  if (!email) {
    showToast('Please try again from the beginning', 'error');
    return;
  }
  
  btnResend.disabled = true;
  
  try {
    if (pendingAction === 'create') {
      await api.createRoom(email, name);
    } else {
      await api.joinRoom(pendingRoomCode, email, name);
    }
    showToast('Email sent!', 'success');
  } catch (err) {
    showToast('Failed to resend. Please try again.', 'error');
  } finally {
    btnResend.disabled = false;
  }
});

btnCopyCode.addEventListener('click', () => {
  const code = displayCode.textContent;
  navigator.clipboard.writeText(code);
  showToast('Code copied!', 'success');
});

// ============================================
// Room Entry
// ============================================

async function enterRoom(roomCode, email, userName, hostStatus) {
  console.log('Entering room:', roomCode, 'as', userName, 'host:', hostStatus);
  
  currentRoom = roomCode;
  currentUser = { email, name: userName };
  isHost = hostStatus;
  
  // Update UI
  document.body.classList.toggle('is-host', isHost);
  headerRoomCode.textContent = roomCode;
  modalRoomCode.textContent = roomCode;
  
  // Generate a unique ID for this user
  const odId = generateUserId();
  
  try {
    // Initialize WebRTC
    webrtc.setCallbacks({
      onPeerOpen: (id) => {
        console.log('Peer ready:', id);
        addSystemMessage(`You joined the party`);
      },
      onPeerError: (err) => {
        console.error('Peer error:', err);
        showToast('Connection error. Please refresh.', 'error');
      },
      onConnection: (peerId) => {
        updateParticipantCount();
        const peerName = extractNameFromPeerId(peerId);
        addSystemMessage(`${peerName} joined`);
      },
      onDisconnection: (peerId) => {
        removeRemoteVideo(peerId);
        updateParticipantCount();
        const peerName = extractNameFromPeerId(peerId);
        addSystemMessage(`${peerName} left`);
      },
      onRemoteStream: (peerId, stream) => {
        addRemoteVideo(peerId, stream);
      },
      onScreenStream: (peerId, stream) => {
        screenVideo.srcObject = stream;
        screenPlaceholder.classList.add('hidden');
      },
      onChatMessage: (peerId, data) => {
        addChatMessage(data.displayName, data.text, data.timestamp);
      }
    });
    
    await webrtc.initPeer(roomCode, odId);
    
    // Connect to other participants
    // In a real app, you'd get this list from the server
    // For now, we'll discover peers through PeerJS
    
    showView('room');
    showToast(`Welcome to room ${roomCode}!`, 'success');
    
  } catch (err) {
    console.error('Failed to enter room:', err);
    showToast('Failed to join room. Please try again.', 'error');
    showView('landing');
  }
}

function generateUserId() {
  return Math.random().toString(36).substring(2, 10);
}

function extractNameFromPeerId(peerId) {
  // peerId format: ROOMCODE-userid
  const parts = peerId.split('-');
  return parts[1] || 'Guest';
}

// ============================================
// Room UI
// ============================================

function updateParticipantCount() {
  const count = webrtc.getConnectedPeers().length + 1; // +1 for self
  participantCount.querySelector('span:last-child').textContent = count;
}

function addRemoteVideo(peerId, stream) {
  // Check if already exists
  if (document.getElementById(`remote-${peerId}`)) {
    const video = document.getElementById(`remote-${peerId}`).querySelector('video');
    video.srcObject = stream;
    return;
  }
  
  const tile = document.createElement('div');
  tile.id = `remote-${peerId}`;
  tile.className = 'webcam-tile remote';
  
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;
  
  const nameEl = document.createElement('span');
  nameEl.className = 'webcam-name';
  nameEl.textContent = extractNameFromPeerId(peerId);
  
  tile.appendChild(video);
  tile.appendChild(nameEl);
  webcamGrid.appendChild(tile);
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

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const text = chatInput.value.trim();
  if (!text) return;
  
  chatInput.value = '';
  
  // Send to peers
  const message = webrtc.sendChatMessage(currentUser.name, text);
  
  // Add locally
  addChatMessage(currentUser.name, text, message.timestamp);
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================
// Media Controls
// ============================================

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
  const isActive = btnScreen.dataset.active === 'true';
  
  if (!isActive) {
    try {
      const stream = await webrtc.startScreenShare();
      screenVideo.srcObject = stream;
      screenPlaceholder.classList.add('hidden');
      btnScreen.dataset.active = 'true';
      
      // Handle user stopping via browser UI
      stream.getVideoTracks()[0].onended = () => {
        screenVideo.srcObject = null;
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
    screenPlaceholder.classList.remove('hidden');
    btnScreen.dataset.active = 'false';
  }
});

// ============================================
// Room Actions
// ============================================

btnCopyRoom.addEventListener('click', () => {
  navigator.clipboard.writeText(currentRoom);
  showToast('Code copied!', 'success');
});

btnInvite.addEventListener('click', () => {
  inviteModal.classList.remove('hidden');
});

btnCloseModal.addEventListener('click', () => {
  inviteModal.classList.add('hidden');
});

inviteModal.querySelector('.modal-backdrop').addEventListener('click', () => {
  inviteModal.classList.add('hidden');
});

btnCopyModal.addEventListener('click', () => {
  navigator.clipboard.writeText(currentRoom);
  showToast('Code copied!', 'success');
});

inviteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = inviteEmail.value.trim();
  if (!email) return;
  
  try {
    await api.joinRoom(currentRoom, email, '');
    inviteEmail.value = '';
    showToast('Invite sent!', 'success');
  } catch (err) {
    showToast('Failed to send invite', 'error');
  }
});

btnLeave.addEventListener('click', () => {
  leaveRoom();
});

function leaveRoom() {
  webrtc.disconnect();
  
  currentRoom = null;
  currentUser = null;
  isHost = false;
  chatMessages = [];
  
  // Reset UI
  document.body.classList.remove('is-host');
  btnMic.dataset.active = 'false';
  btnCam.dataset.active = 'false';
  btnScreen.dataset.active = 'false';
  localVideo.srcObject = null;
  screenVideo.srcObject = null;
  screenPlaceholder.classList.remove('hidden');
  chatMessagesEl.innerHTML = '';
  
  // Remove remote videos
  document.querySelectorAll('.webcam-tile.remote').forEach(el => el.remove());
  
  showView('landing');
}

// ============================================
// URL Parameter Handling
// ============================================

async function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get('room');
  const email = params.get('email');
  
  if (roomCode && email) {
    console.log('URL params found:', roomCode, email);
    
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
    
    try {
      // Verify access
      const access = await api.verifyAccess(roomCode, email);
      
      if (access.hasAccess) {
        const name = localStorage.getItem('wp_name') || email.split('@')[0];
        await enterRoom(roomCode, email, name, access.isHost);
        return true;
      } else {
        showToast('Access denied. Please request a new invite.', 'error');
      }
    } catch (err) {
      console.error('Access verification failed:', err);
      showToast('Could not verify access. Please try again.', 'error');
    }
  }
  
  return false;
}

// ============================================
// Initialize
// ============================================

async function init() {
  console.log('Watch Party v2 initializing...');
  
  // Check URL params for direct room entry
  const directEntry = await checkUrlParams();
  
  if (!directEntry) {
    showView('landing');
  }
}

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (currentRoom) {
    webrtc.disconnect();
  }
});

// Start app
init().catch(err => {
  console.error('Init error:', err);
  showToast('Failed to initialize app', 'error');
});
