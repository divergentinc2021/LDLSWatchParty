// ============================================
// Watch Party - Main Application Controller
// ============================================

import { initializeApp } from 'firebase/app';
import { firebaseConfig } from './firebase-config.js';

// Import modules
import { 
  initAuth,
  waitForAuthReady,
  onAuthChange, 
  getUser, 
  getUserDisplayName,
  sendAuthLink, 
  handleEmailLinkRedirect,
  logout,
  hasPendingAuth
} from './auth.js';

import { 
  initRoom, 
  createRoom, 
  joinRoom, 
  validateRoomCode,
  addParticipant,
  leaveRoom,
  subscribeToParticipants,
  sendEmailInvite,
  getCurrentRoom
} from './room.js';

import { 
  initChat, 
  sendMessage, 
  sendSystemMessage,
  subscribeToChat, 
  unsubscribeFromChat,
  formatTime
} from './chat.js';

import { 
  initWebRTC, 
  setCallbacks,
  joinMesh, 
  leaveMesh,
  getLocalStream,
  toggleMic,
  toggleCamera,
  startScreenShare,
  stopScreenShare,
  getScreenStream,
  getLocalMediaStream
} from './webrtc.js';

// ============================================
// State
// ============================================

let currentView = 'landing';
let pendingAction = null; // 'create' | 'join'
let pendingRoomCode = null;
let participants = [];

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
const btnBackLanding = document.getElementById('btn-back-landing');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authForm = document.getElementById('auth-form');
const authPending = document.getElementById('auth-pending');
const authError = document.getElementById('auth-error');
const inputEmail = document.getElementById('input-email');
const btnSendLink = document.getElementById('btn-send-link');
const btnResend = document.getElementById('btn-resend');
const pendingEmail = document.getElementById('pending-email');
const errorMessage = document.getElementById('error-message');

// Room
const displayRoomCode = document.getElementById('display-room-code');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnInvite = document.getElementById('btn-invite');
const btnLeave = document.getElementById('btn-leave');
const participantCount = document.getElementById('participant-count');

// Video
const screenVideo = document.getElementById('screen-video');
const screenPlaceholder = document.getElementById('screen-placeholder');
const localVideo = document.getElementById('local-video');
const webcamGrid = document.getElementById('webcam-grid');

// Chat
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

// Controls
const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnToggleCam = document.getElementById('btn-toggle-cam');
const btnToggleScreen = document.getElementById('btn-toggle-screen');

// Invite Modal
const inviteModal = document.getElementById('invite-modal');
const btnCloseInvite = document.getElementById('btn-close-invite');
const inviteEmail = document.getElementById('invite-email');
const btnSendInvite = document.getElementById('btn-send-invite');
const inviteCodeText = document.getElementById('invite-code-text');
const btnCopyInvite = document.getElementById('btn-copy-invite');

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

function showAuthError(message) {
  authError.classList.remove('hidden');
  errorMessage.textContent = message;
}

function hideAuthError() {
  authError.classList.add('hidden');
}

function showAuthPending(email) {
  authForm.classList.add('hidden');
  authPending.classList.remove('hidden');
  pendingEmail.textContent = email;
}

function resetAuthView() {
  authForm.classList.remove('hidden');
  authPending.classList.add('hidden');
  hideAuthError();
  inputEmail.value = '';
}

// ============================================
// Toast Notifications
// ============================================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ============================================
// Landing Actions
// ============================================

btnCreate.addEventListener('click', () => {
  console.log('Create room clicked');
  pendingAction = 'create';
  pendingRoomCode = null;
  authTitle.textContent = 'Enter your email';
  authSubtitle.textContent = "We'll send you a link to create your room";
  resetAuthView();
  showView('auth');
});

btnJoin.addEventListener('click', async () => {
  const code = inputCode.value.trim().toUpperCase();
  console.log('Join room clicked with code:', code);
  
  if (code.length !== 5) {
    showToast('Please enter a 5-character code', 'error');
    return;
  }
  
  // Validate code exists
  try {
    const valid = await validateRoomCode(code);
    if (!valid) {
      showToast('Room not found. Check your code.', 'error');
      return;
    }
  } catch (err) {
    console.error('Error validating room code:', err);
    showToast('Error checking room. Please try again.', 'error');
    return;
  }
  
  pendingAction = 'join';
  pendingRoomCode = code;
  authTitle.textContent = 'Enter your email';
  authSubtitle.textContent = `We'll send you a link to join room ${code}`;
  resetAuthView();
  showView('auth');
});

// Auto-uppercase code input
inputCode.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

// ============================================
// Auth Actions
// ============================================

btnBackLanding.addEventListener('click', () => {
  pendingAction = null;
  pendingRoomCode = null;
  showView('landing');
});

btnSendLink.addEventListener('click', async () => {
  const email = inputEmail.value.trim();
  
  if (!email || !email.includes('@')) {
    showAuthError('Please enter a valid email address');
    return;
  }
  
  hideAuthError();
  btnSendLink.disabled = true;
  btnSendLink.textContent = 'Sending...';
  
  try {
    const isHost = pendingAction === 'create';
    console.log('Sending auth link - email:', email, 'roomCode:', pendingRoomCode, 'isHost:', isHost);
    await sendAuthLink(email, pendingRoomCode, isHost);
    showAuthPending(email);
    showToast('Check your email for the magic link!', 'success');
  } catch (err) {
    console.error('Auth error:', err);
    showAuthError(err.message || 'Failed to send link. Please try again.');
  } finally {
    btnSendLink.disabled = false;
    btnSendLink.textContent = 'Send Magic Link';
  }
});

btnResend.addEventListener('click', async () => {
  const email = pendingEmail.textContent;
  btnResend.disabled = true;
  
  try {
    const isHost = pendingAction === 'create';
    await sendAuthLink(email, pendingRoomCode, isHost);
    showToast('Link sent!', 'success');
  } catch (err) {
    showToast('Failed to resend. Please try again.', 'error');
  } finally {
    btnResend.disabled = false;
  }
});

// ============================================
// Room Actions
// ============================================

async function enterRoom(roomCode, isHost) {
  console.log('Entering room - roomCode:', roomCode, 'isHost:', isHost);
  
  const user = getUser();
  if (!user) {
    console.error('No user logged in!');
    showToast('Authentication required', 'error');
    showView('landing');
    return;
  }
  
  console.log('User:', user.email, user.uid);
  
  try {
    // Set host class on body
    document.body.classList.toggle('is-host', isHost);
    
    // Join or create room in Firestore
    let room;
    if (isHost) {
      console.log('Creating new room...');
      room = await createRoom(user.email, user.uid);
      console.log('Room created:', room.code);
    } else {
      console.log('Joining existing room:', roomCode);
      room = await joinRoom(roomCode, user.email, user.uid);
      console.log('Joined room:', room.code);
    }
    
    // Update UI
    displayRoomCode.textContent = room.code;
    inviteCodeText.textContent = room.code;
    
    // Add ourselves as participant
    await addParticipant(room.code, user.uid, user.email);
    console.log('Added as participant');
    
    // Subscribe to participants
    subscribeToParticipants(room.code, (parts) => {
      participants = parts;
      updateParticipantCount();
    });
    
    // Subscribe to chat
    subscribeToChat(room.code, renderMessages);
    
    // Send join message
    await sendSystemMessage(room.code, `${getUserDisplayName()} joined the party`);
    
    // Join WebRTC mesh
    setCallbacks({
      onStream: handleRemoteStream,
      onDisconnect: handleRemoteDisconnect,
      onScreen: handleScreenStream
    });
    await joinMesh(room.code, user.uid, isHost);
    console.log('Joined WebRTC mesh');
    
    showView('room');
    showToast(`Welcome to room ${room.code}!`, 'success');
    
  } catch (err) {
    console.error('Error entering room:', err);
    showToast(err.message || 'Failed to enter room', 'error');
    showView('landing');
  }
}

function updateParticipantCount() {
  const count = participants.filter(p => p.isOnline).length;
  participantCount.textContent = `${count} watching`;
}

btnLeave.addEventListener('click', async () => {
  await handleLeaveRoom();
});

async function handleLeaveRoom() {
  const user = getUser();
  const room = getCurrentRoom();
  
  if (room && user) {
    try {
      await sendSystemMessage(room.code, `${getUserDisplayName()} left the party`);
      await leaveRoom(room.code, user.uid);
    } catch (err) {
      console.error('Error leaving room:', err);
    }
  }
  
  await leaveMesh();
  unsubscribeFromChat();
  
  // Reset controls
  btnToggleMic.dataset.active = 'false';
  btnToggleCam.dataset.active = 'false';
  btnToggleScreen.dataset.active = 'false';
  
  // Clear video elements
  localVideo.srcObject = null;
  screenVideo.srcObject = null;
  screenPlaceholder.classList.remove('hidden');
  
  // Remove remote video tiles
  document.querySelectorAll('.webcam-tile.remote').forEach(el => el.remove());
  
  document.body.classList.remove('is-host');
  showView('landing');
}

// Copy room code
btnCopyCode.addEventListener('click', () => {
  navigator.clipboard.writeText(displayRoomCode.textContent);
  showToast('Code copied!', 'success');
});

// ============================================
// Invite Modal
// ============================================

btnInvite.addEventListener('click', () => {
  inviteModal.classList.remove('hidden');
});

btnCloseInvite.addEventListener('click', () => {
  inviteModal.classList.add('hidden');
});

inviteModal.querySelector('.modal-backdrop').addEventListener('click', () => {
  inviteModal.classList.add('hidden');
});

btnSendInvite.addEventListener('click', () => {
  const email = inviteEmail.value.trim();
  if (!email) return;
  
  const room = getCurrentRoom();
  sendEmailInvite(email, room.code, getUserDisplayName());
  inviteEmail.value = '';
  showToast('Invite email opened', 'success');
});

btnCopyInvite.addEventListener('click', () => {
  navigator.clipboard.writeText(inviteCodeText.textContent);
  showToast('Code copied!', 'success');
});

// ============================================
// Chat
// ============================================

function renderMessages(messages) {
  chatMessages.innerHTML = messages.map(msg => {
    if (msg.type === 'system') {
      return `
        <div class="chat-message system">
          <span class="text">${escapeHtml(msg.text)}</span>
        </div>
      `;
    }
    
    return `
      <div class="chat-message">
        <span class="sender">${escapeHtml(msg.displayName)}</span>
        <span class="text">${escapeHtml(msg.text)}</span>
        <span class="time">${formatTime(msg.timestamp)}</span>
      </div>
    `;
  }).join('');
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const text = chatInput.value.trim();
  if (!text) return;
  
  const user = getUser();
  const room = getCurrentRoom();
  
  chatInput.value = '';
  
  await sendMessage(room.code, user.uid, getUserDisplayName(), text);
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Media Controls
// ============================================

btnToggleMic.addEventListener('click', async () => {
  const isActive = btnToggleMic.dataset.active === 'true';
  
  if (!isActive) {
    try {
      await getLocalStream(true, btnToggleCam.dataset.active === 'true');
      const stream = getLocalMediaStream();
      localVideo.srcObject = stream;
      btnToggleMic.dataset.active = 'true';
    } catch (err) {
      showToast('Could not access microphone', 'error');
    }
  } else {
    toggleMic(false);
    btnToggleMic.dataset.active = 'false';
  }
});

btnToggleCam.addEventListener('click', async () => {
  const isActive = btnToggleCam.dataset.active === 'true';
  
  if (!isActive) {
    try {
      await getLocalStream(btnToggleMic.dataset.active === 'true', true);
      const stream = getLocalMediaStream();
      localVideo.srcObject = stream;
      btnToggleCam.dataset.active = 'true';
    } catch (err) {
      showToast('Could not access camera', 'error');
    }
  } else {
    toggleCamera(false);
    btnToggleCam.dataset.active = 'false';
  }
});

btnToggleScreen.addEventListener('click', async () => {
  const isActive = btnToggleScreen.dataset.active === 'true';
  
  if (!isActive) {
    try {
      const stream = await startScreenShare();
      screenVideo.srcObject = stream;
      screenPlaceholder.classList.add('hidden');
      btnToggleScreen.dataset.active = 'true';
      
      // Listen for user stopping via browser UI
      stream.getVideoTracks()[0].onended = () => {
        screenVideo.srcObject = null;
        screenPlaceholder.classList.remove('hidden');
        btnToggleScreen.dataset.active = 'false';
      };
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        showToast('Could not share screen', 'error');
      }
    }
  } else {
    stopScreenShare();
    screenVideo.srcObject = null;
    screenPlaceholder.classList.remove('hidden');
    btnToggleScreen.dataset.active = 'false';
  }
});

// ============================================
// WebRTC Callbacks
// ============================================

function handleRemoteStream(odId, stream) {
  // Check if tile already exists
  let tile = document.getElementById(`remote-${odId}`);
  
  if (!tile) {
    tile = document.createElement('div');
    tile.id = `remote-${odId}`;
    tile.className = 'webcam-tile remote';
    tile.innerHTML = `
      <video autoplay playsinline></video>
      <span class="webcam-name">Guest</span>
    `;
    webcamGrid.appendChild(tile);
  }
  
  const video = tile.querySelector('video');
  video.srcObject = stream;
  
  // Update name from participants
  const participant = participants.find(p => p.odId === odId);
  if (participant) {
    tile.querySelector('.webcam-name').textContent = participant.displayName;
  }
}

function handleRemoteDisconnect(odId) {
  const tile = document.getElementById(`remote-${odId}`);
  if (tile) {
    tile.remove();
  }
}

function handleScreenStream(odId, stream) {
  screenVideo.srcObject = stream;
  screenPlaceholder.classList.add('hidden');
}

// ============================================
// Initialize
// ============================================

async function init() {
  console.log('Initializing Watch Party...');
  
  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  console.log('Firebase initialized');
  
  // Initialize modules
  initAuth(app);
  initRoom(app);
  initChat(app);
  initWebRTC(app);
  console.log('All modules initialized');
  
  // IMPORTANT: Wait for auth to be ready before checking pending auth
  console.log('Waiting for auth to be ready...');
  await waitForAuthReady();
  console.log('Auth is ready, checking for pending auth...');
  
  // Check for email link redirect
  if (hasPendingAuth()) {
    console.log('Pending auth detected, handling redirect...');
    try {
      const result = await handleEmailLinkRedirect();
      console.log('Email link result:', result);
      
      if (result && result.user) {
        if (result.roomCode) {
          // Join existing room
          console.log('Joining room from email link:', result.roomCode);
          await enterRoom(result.roomCode, result.isHost);
        } else if (result.isHost) {
          // Create new room
          console.log('Creating new room from email link');
          await enterRoom(null, true);
        } else {
          // Edge case: authenticated but no room context
          console.log('Authenticated but no room context, showing landing');
          showToast('Signed in! Create or join a room.', 'success');
          showView('landing');
        }
        return;
      }
    } catch (err) {
      console.error('Email link error:', err);
      showToast(err.message || 'Authentication failed', 'error');
    }
  }
  
  // Check URL for room code (direct link)
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoom = urlParams.get('room');
  
  if (urlRoom) {
    console.log('Room code in URL:', urlRoom);
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Check if already logged in
    const user = getUser();
    if (user) {
      await enterRoom(urlRoom, false);
    } else {
      // Need to auth first
      pendingAction = 'join';
      pendingRoomCode = urlRoom;
      authTitle.textContent = 'Enter your email';
      authSubtitle.textContent = `We'll send you a link to join room ${urlRoom}`;
      showView('auth');
    }
    return;
  }
  
  // Default: show landing
  console.log('Showing landing page');
  showView('landing');
}

// Handle page unload
window.addEventListener('beforeunload', () => {
  const room = getCurrentRoom();
  if (room) {
    leaveMesh();
  }
});

// Start app
init().catch(err => {
  console.error('Init error:', err);
  showToast('Failed to initialize app', 'error');
});
