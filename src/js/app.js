// ============================================
// Watch Party - Main Application
// With Theater Mode + PiP
// ============================================

import * as api from './api.js';
import * as webrtc from './webrtc.js';

// ============================================
// State
// ============================================
let currentRoom = null;
let currentToken = null;
let currentUser = null;
let isHost = false;
let hasPassword = false;
let lobbyPeers = new Map();
let participants = new Map();
let sessionStarted = false;

// Theater Mode State
let theaterMode = false;
let unreadChatCount = 0;
let sidebarVisible = false;

// ============================================
// DOM Elements
// ============================================
const views = {
  landing: document.getElementById('view-landing'),
  joinLink: document.getElementById('view-join-link'),
  lobby: document.getElementById('view-lobby'),
  room: document.getElementById('view-room'),
  kicked: document.getElementById('view-kicked')
};

// Landing
const createForm = document.getElementById('create-form');
const joinForm = document.getElementById('join-form');
const activeSessionsEl = document.getElementById('active-sessions');
const sessionCountEl = document.getElementById('session-count');

// Join via Link
const joinLinkForm = document.getElementById('join-link-form');
const joinLinkCode = document.getElementById('join-link-code');
const joinLinkHost = document.getElementById('join-link-host');
const joinLinkName = document.getElementById('join-link-name');
const joinLinkPassword = document.getElementById('join-link-password');

// Lobby
const lobbyRoomCode = document.getElementById('lobby-room-code');
const lobbyPasswordBadge = document.getElementById('lobby-password-badge');
const lobbyStatusText = document.getElementById('lobby-status-text');
const lobbyCount = document.getElementById('lobby-count');
const lobbyParticipantsList = document.getElementById('lobby-participants-list');
const lobbyShareUrl = document.getElementById('lobby-share-url');
const btnLobbyCopy = document.getElementById('btn-lobby-copy');
const btnStartSession = document.getElementById('btn-start-session');
const btnLeaveLobby = document.getElementById('btn-leave-lobby');

// Room
const roomContainer = document.getElementById('room-container');
const headerRoomCode = document.getElementById('header-room-code');
const hostBadge = document.getElementById('host-badge');
const passwordBadge = document.getElementById('password-badge');
const participantCount = document.getElementById('participant-count');
const participantsList = document.getElementById('participants-list');
const sidebar = document.getElementById('sidebar');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatUnreadBadge = document.getElementById('chat-unread-badge');
const localVideo = document.getElementById('local-video');
const screenVideo = document.getElementById('screen-video');
const screenPlaceholder = document.getElementById('screen-placeholder');
const screenPlaceholderText = document.getElementById('screen-placeholder-text');
const webcamGrid = document.getElementById('webcam-grid');
const bufferIndicator = document.getElementById('buffer-indicator');
const bufferCountdown = document.getElementById('buffer-countdown');

// Controls
const btnMic = document.getElementById('btn-mic');
const btnCam = document.getElementById('btn-cam');
const btnScreen = document.getElementById('btn-screen');
const btnTheater = document.getElementById('btn-theater');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnLeave = document.getElementById('btn-leave');
const btnCopyRoom = document.getElementById('btn-copy-room');
const btnBackHome = document.getElementById('btn-back-home');

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('Watch Party initializing...');
  
  const path = window.location.pathname;
  const match = path.match(/^\/([A-Z0-9]{5})-([a-z0-9]{12})$/i);
  
  if (match) {
    const code = match[1].toUpperCase();
    const token = match[2];
    await handleDirectLink(code, token);
  } else {
    showView('landing');
    fetchActiveSessionCount();
  }
  
  setupEventListeners();
}

async function fetchActiveSessionCount() {
  try {
    const result = await api.getActiveSessionCount();
    if (result.success && result.count > 0) {
      sessionCountEl.textContent = result.count;
      activeSessionsEl.classList.remove('hidden');
    }
  } catch (err) {
    console.log('Could not fetch session count');
  }
}

// ============================================
// View Management
// ============================================
function showView(viewName) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  if (views[viewName]) {
    views[viewName].classList.add('active');
  }
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
  // Create Room
  createForm?.addEventListener('submit', handleCreateRoom);
  
  // Join Room (via code)
  joinForm?.addEventListener('submit', handleJoinRoom);
  
  // Join via Link
  joinLinkForm?.addEventListener('submit', handleJoinViaLink);
  
  // Lobby
  btnLobbyCopy?.addEventListener('click', copyLobbyLink);
  btnStartSession?.addEventListener('click', startSession);
  btnLeaveLobby?.addEventListener('click', leaveLobby);
  
  // Room controls
  btnMic?.addEventListener('click', toggleMic);
  btnCam?.addEventListener('click', toggleCam);
  btnScreen?.addEventListener('click', toggleScreen);
  btnTheater?.addEventListener('click', toggleTheaterMode);
  btnFullscreen?.addEventListener('click', toggleFullscreen);
  btnLeave?.addEventListener('click', leaveRoom);
  btnCopyRoom?.addEventListener('click', copyRoomLink);
  
  // Chat
  chatForm?.addEventListener('submit', handleChatSubmit);
  chatInput?.addEventListener('focus', () => {
    // Clear unread count when focusing chat
    if (theaterMode) {
      unreadChatCount = 0;
      updateUnreadBadge();
    }
  });
  
  // Sidebar hover tracking in theater mode
  sidebar?.addEventListener('mouseenter', () => {
    sidebarVisible = true;
    unreadChatCount = 0;
    updateUnreadBadge();
  });
  sidebar?.addEventListener('mouseleave', () => {
    sidebarVisible = false;
  });
  
  // Kicked
  btnBackHome?.addEventListener('click', () => {
    window.location.href = '/';
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
  
  // Fullscreen change detection
  document.addEventListener('fullscreenchange', handleFullscreenChange);
}

function handleKeyboard(e) {
  // Only in room view
  if (!views.room.classList.contains('active')) return;
  
  // Don't trigger if typing in input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  switch (e.key.toLowerCase()) {
    case 't':
      toggleTheaterMode();
      break;
    case 'f':
      toggleFullscreen();
      break;
    case 'm':
      toggleMic();
      break;
    case 'v':
      toggleCam();
      break;
    case 'escape':
      if (theaterMode) toggleTheaterMode();
      break;
  }
}

// ============================================
// Theater Mode
// ============================================
function toggleTheaterMode() {
  theaterMode = !theaterMode;
  roomContainer.classList.toggle('theater-mode', theaterMode);
  btnTheater.dataset.active = String(theaterMode);
  
  if (theaterMode) {
    // Reset unread counter when entering theater mode
    unreadChatCount = 0;
    updateUnreadBadge();
  }
  
  console.log('Theater mode:', theaterMode);
}

function enterTheaterMode() {
  if (!theaterMode) {
    theaterMode = true;
    roomContainer.classList.add('theater-mode');
    btnTheater.dataset.active = 'true';
    unreadChatCount = 0;
    updateUnreadBadge();
  }
}

function exitTheaterMode() {
  if (theaterMode) {
    theaterMode = false;
    roomContainer.classList.remove('theater-mode');
    btnTheater.dataset.active = 'false';
  }
}

function updateUnreadBadge() {
  if (chatUnreadBadge) {
    chatUnreadBadge.textContent = unreadChatCount > 99 ? '99+' : unreadChatCount;
    chatUnreadBadge.classList.toggle('visible', unreadChatCount > 0 && theaterMode && !sidebarVisible);
  }
}

// ============================================
// Fullscreen
// ============================================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    roomContainer.requestFullscreen().catch(err => {
      console.error('Fullscreen error:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

function handleFullscreenChange() {
  const isFullscreen = !!document.fullscreenElement;
  
  if (btnFullscreen) {
    btnFullscreen.querySelector('.icon-expand')?.classList.toggle('hidden', isFullscreen);
    btnFullscreen.querySelector('.icon-compress')?.classList.toggle('hidden', !isFullscreen);
  }
  
  // Auto-enter theater mode when going fullscreen
  if (isFullscreen && !theaterMode) {
    enterTheaterMode();
  }
}

// ============================================
// Buffer/Loading Indicator
// ============================================
function showBufferIndicator(seconds = 3) {
  return new Promise((resolve) => {
    bufferIndicator.classList.remove('hidden');
    let remaining = seconds;
    bufferCountdown.textContent = remaining;
    
    const interval = setInterval(() => {
      remaining--;
      bufferCountdown.textContent = remaining;
      
      if (remaining <= 0) {
        clearInterval(interval);
        bufferIndicator.classList.add('hidden');
        resolve();
      }
    }, 1000);
  });
}

// ============================================
// Direct Link Handler
// ============================================
async function handleDirectLink(code, token) {
  console.log('Direct link detected:', code);
  
  const result = await api.validateRoom(code);
  
  if (!result.success || !result.valid) {
    showToast(result.error || 'Room not found', 'error');
    showView('landing');
    window.history.replaceState({}, '', '/');
    return;
  }
  
  const roomInfo = await api.getRoomInfo(code);
  
  currentRoom = code;
  currentToken = token;
  hasPassword = result.hasPassword;
  
  joinLinkCode.textContent = code;
  joinLinkHost.textContent = roomInfo.success ? `Hosted by ${roomInfo.room.hostName}` : '';
  joinLinkPassword.classList.toggle('hidden', !result.hasPassword);
  
  showView('joinLink');
}

// ============================================
// Create Room
// ============================================
async function handleCreateRoom(e) {
  e.preventDefault();
  
  const btn = createForm.querySelector('button');
  btn.classList.add('loading');
  
  const name = document.getElementById('create-name').value.trim();
  const email = document.getElementById('create-email').value.trim();
  const password = document.getElementById('create-password').value;
  
  if (!name) {
    showToast('Please enter your name', 'error');
    btn.classList.remove('loading');
    return;
  }
  
  try {
    const result = await api.createRoom(email || `anon-${Date.now()}@watchparty.local`, name, password);
    
    if (!result.success) {
      showToast(result.error || 'Failed to create room', 'error');
      btn.classList.remove('loading');
      return;
    }
    
    currentRoom = result.code;
    currentToken = result.token;
    currentUser = { id: generateId(), name, email };
    isHost = true;
    hasPassword = !!password;
    
    window.history.replaceState({}, '', `/${result.code}-${result.token}`);
    enterLobby();
    
  } catch (err) {
    console.error('Create room error:', err);
    showToast('Failed to create room', 'error');
  }
  
  btn.classList.remove('loading');
}

// ============================================
// Join Room (via code)
// ============================================
async function handleJoinRoom(e) {
  e.preventDefault();
  
  const btn = joinForm.querySelector('button');
  btn.classList.add('loading');
  
  const code = document.getElementById('input-code').value.trim().toUpperCase();
  const name = document.getElementById('join-name').value.trim();
  const password = document.getElementById('join-password').value;
  
  if (!code || code.length !== 5) {
    showToast('Please enter a valid 5-character code', 'error');
    btn.classList.remove('loading');
    return;
  }
  
  if (!name) {
    showToast('Please enter your name', 'error');
    btn.classList.remove('loading');
    return;
  }
  
  try {
    const validation = await api.validateRoom(code);
    
    if (!validation.success || !validation.valid) {
      showToast(validation.error || 'Room not found', 'error');
      btn.classList.remove('loading');
      return;
    }
    
    const joinResult = await api.joinRoom(code, `${name.toLowerCase().replace(/\s+/g, '')}@guest.local`, name, password);
    
    if (!joinResult.success) {
      showToast(joinResult.error || 'Failed to join', 'error');
      btn.classList.remove('loading');
      return;
    }
    
    currentRoom = code;
    currentToken = joinResult.token;
    currentUser = { id: generateId(), name };
    isHost = false;
    hasPassword = validation.hasPassword;
    
    window.history.replaceState({}, '', `/${code}-${currentToken}`);
    enterLobby();
    
  } catch (err) {
    console.error('Join room error:', err);
    showToast('Failed to join room', 'error');
  }
  
  btn.classList.remove('loading');
}

// ============================================
// Join via Link
// ============================================
async function handleJoinViaLink(e) {
  e.preventDefault();
  
  const btn = joinLinkForm.querySelector('button');
  btn.classList.add('loading');
  
  const name = joinLinkName.value.trim();
  const password = joinLinkPassword.value;
  
  if (!name) {
    showToast('Please enter your name', 'error');
    btn.classList.remove('loading');
    return;
  }
  
  try {
    if (hasPassword) {
      const result = await api.joinRoom(currentRoom, `${name.toLowerCase().replace(/\s+/g, '')}@guest.local`, name, password);
      
      if (!result.success) {
        showToast(result.error || 'Failed to join', 'error');
        btn.classList.remove('loading');
        return;
      }
    }
    
    currentUser = { id: generateId(), name };
    isHost = false;
    enterLobby();
    
  } catch (err) {
    console.error('Join via link error:', err);
    showToast('Failed to join room', 'error');
  }
  
  btn.classList.remove('loading');
}

// ============================================
// Lobby
// ============================================
async function enterLobby() {
  console.log('Entering lobby for room:', currentRoom);
  
  lobbyRoomCode.textContent = currentRoom;
  lobbyPasswordBadge.classList.toggle('hidden', !hasPassword);
  lobbyShareUrl.textContent = `${window.location.origin}/${currentRoom}-${currentToken}`;
  lobbyStatusText.textContent = 'Connecting...';
  
  lobbyPeers.clear();
  lobbyPeers.set(currentUser.id, { name: currentUser.name, isHost });
  updateLobbyUI();
  
  showView('lobby');
  
  webrtc.setCallbacks({
    onPeerOpen: (peerId) => {
      console.log('✅ Connected:', peerId);
      lobbyStatusText.textContent = isHost 
        ? 'Waiting for participants to join...' 
        : 'Connecting to host...';
    },
    onPeerError: (err) => {
      console.error('Peer error:', err);
      showToast('Connection error. Please try again.', 'error');
    },
    onConnection: (peerId, peerData) => {
      console.log('🤝 Peer connected:', peerId, peerData);
      if (peerData && peerData.name) {
        lobbyPeers.set(peerId, { name: peerData.name, isHost: peerData.isHost });
        updateLobbyUI();
        
        if (sessionStarted) {
          participants.set(peerId, { name: peerData.name, isHost: peerData.isHost });
          updateParticipantsList();
        }
      }
    },
    onDisconnection: (peerId) => {
      console.log('👋 Peer disconnected:', peerId);
      lobbyPeers.delete(peerId);
      participants.delete(peerId);
      updateLobbyUI();
      updateParticipantsList();
      removeRemoteVideo(peerId);
    },
    onRemoteStream: (peerId, stream) => addRemoteVideo(peerId, stream),
    onScreenStream: (peerId, stream) => showRemoteScreenShare(peerId, stream),
    onChatMessage: (peerId, msg) => {
      addChatMessage(msg.displayName, msg.text, msg.timestamp);
      // Increment unread count if in theater mode and sidebar not visible
      if (theaterMode && !sidebarVisible) {
        unreadChatCount++;
        updateUnreadBadge();
      }
    },
    onControlMessage: (peerId, data) => handleControlMessage(peerId, data)
  });
  
  try {
    await webrtc.initPeer(currentRoom, currentUser.id, {
      name: currentUser.name,
      isHost
    });
  } catch (err) {
    console.error('Failed to initialize WebRTC:', err);
    showToast('Failed to connect. Please try again.', 'error');
  }
}

function updateLobbyUI() {
  const count = lobbyPeers.size;
  lobbyCount.textContent = count;
  
  if (isHost) {
    btnStartSession.disabled = count < 2;
  } else {
    btnStartSession.style.display = 'none';
  }
  
  if (count >= 2) {
    lobbyStatusText.textContent = isHost 
      ? 'Ready to start!' 
      : 'Waiting for host to start the session...';
  }
  
  lobbyParticipantsList.innerHTML = '';
  
  lobbyPeers.forEach((peer, peerId) => {
    const div = document.createElement('div');
    div.className = 'lobby-peer';
    
    const isSelf = peerId === currentUser.id;
    
    div.innerHTML = `
      <span class="peer-dot"></span>
      <span class="peer-name">${peer.name}</span>
      ${isSelf ? '<span class="peer-tag">You</span>' : ''}
      ${peer.isHost ? '<span class="peer-host">Host</span>' : ''}
    `;
    
    lobbyParticipantsList.appendChild(div);
  });
}

function copyLobbyLink() {
  const url = `${window.location.origin}/${currentRoom}-${currentToken}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copied to clipboard!', 'success');
  });
}

function startSession() {
  if (!isHost || lobbyPeers.size < 2) return;
  
  console.log('🎬 Starting session!');
  sessionStarted = true;
  
  webrtc.sendControlMessage({ type: 'sessionStart' });
  enterRoom();
}

function leaveLobby() {
  webrtc.disconnect();
  window.location.href = '/';
}

// ============================================
// Room
// ============================================
function enterRoom() {
  console.log('Entering room:', currentRoom);
  
  participants.clear();
  lobbyPeers.forEach((peer, peerId) => {
    participants.set(peerId, peer);
  });
  
  headerRoomCode.textContent = currentRoom;
  hostBadge.classList.toggle('hidden', !isHost);
  passwordBadge.classList.toggle('hidden', !hasPassword);
  
  screenPlaceholderText.textContent = isHost 
    ? 'Click "Screen" to share your screen' 
    : 'Waiting for host to share screen';
  
  updateParticipantsList();
  addSystemMessage('Session started!');
  
  showView('room');
  initLocalMedia();
}

async function initLocalMedia() {
  try {
    const stream = await webrtc.getLocalStream(true, true);
    localVideo.srcObject = stream;
    btnMic.dataset.active = 'true';
    btnCam.dataset.active = 'true';
  } catch (err) {
    console.error('Media error:', err);
    showToast('Could not access camera/microphone', 'error');
  }
}

// ============================================
// Control Message Handler
// ============================================
function handleControlMessage(peerId, data) {
  switch (data.type) {
    case 'sessionStart':
      if (!sessionStarted) {
        sessionStarted = true;
        enterRoom();
      }
      break;
      
    case 'kick':
      if (data.targetId === currentUser.id) {
        webrtc.disconnect();
        showView('kicked');
      }
      break;
      
    case 'grantScreen':
      if (data.targetId === currentUser.id) {
        showToast('Host granted you screen sharing permission', 'success');
      }
      break;
      
    case 'screenStart':
      // Auto-enter theater mode when someone starts sharing
      enterTheaterMode();
      break;
      
    case 'screenStop':
      // Optionally exit theater mode
      // exitTheaterMode();
      break;
  }
}

// ============================================
// Media Controls
// ============================================
function toggleMic() {
  const isActive = btnMic.dataset.active === 'true';
  const newState = !isActive;
  webrtc.toggleMic(newState);
  btnMic.dataset.active = String(newState);
}

function toggleCam() {
  const isActive = btnCam.dataset.active === 'true';
  const newState = !isActive;
  webrtc.toggleCamera(newState);
  btnCam.dataset.active = String(newState);
}

async function toggleScreen() {
  const isActive = btnScreen.dataset.active === 'true';
  
  if (isActive) {
    webrtc.stopScreenShare();
    btnScreen.dataset.active = 'false';
    screenVideo.srcObject = null;
    screenVideo.classList.remove('has-stream');
    screenPlaceholder.classList.remove('hidden');
    
    // Notify others
    webrtc.sendControlMessage({ type: 'screenStop' });
  } else {
    try {
      // Show buffer countdown
      await showBufferIndicator(3);
      
      const stream = await webrtc.startScreenShare();
      screenVideo.srcObject = stream;
      screenVideo.classList.add('has-stream');
      screenPlaceholder.classList.add('hidden');
      btnScreen.dataset.active = 'true';
      
      // Auto-enter theater mode when starting screen share
      enterTheaterMode();
      
      // Notify others
      webrtc.sendControlMessage({ type: 'screenStart' });
      
    } catch (err) {
      console.error('Screen share error:', err);
      if (err.name !== 'NotAllowedError') {
        showToast('Failed to share screen', 'error');
      }
    }
  }
}

function leaveRoom() {
  webrtc.disconnect();
  window.location.href = '/';
}

function copyRoomLink() {
  const url = `${window.location.origin}/${currentRoom}-${currentToken}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copied!', 'success');
  });
}

// ============================================
// Participants
// ============================================
function updateParticipantsList() {
  const count = participants.size;
  participantCount.querySelector('span').textContent = count;
  
  participantsList.innerHTML = '';
  
  participants.forEach((p, peerId) => {
    const div = document.createElement('div');
    div.className = 'participant-item';
    
    const isSelf = peerId === currentUser.id;
    
    let actionsHtml = '';
    if (isHost && !isSelf && !p.isHost) {
      actionsHtml = `
        <div class="participant-actions">
          <button class="btn-grant-screen" data-peer="${peerId}">Grant Screen</button>
          <button class="btn-kick" data-peer="${peerId}">Kick</button>
        </div>
      `;
    }
    
    div.innerHTML = `
      <div class="participant-info">
        <span class="participant-name">${p.name}${isSelf ? ' (You)' : ''}</span>
        ${p.isHost ? '<span class="participant-host-tag">Host</span>' : ''}
      </div>
      ${actionsHtml}
    `;
    
    participantsList.appendChild(div);
  });
  
  participantsList.querySelectorAll('.btn-kick').forEach(btn => {
    btn.addEventListener('click', () => kickParticipant(btn.dataset.peer));
  });
  
  participantsList.querySelectorAll('.btn-grant-screen').forEach(btn => {
    btn.addEventListener('click', () => grantScreen(btn.dataset.peer));
  });
}

function kickParticipant(peerId) {
  webrtc.sendControlMessage({ type: 'kick', targetId: peerId });
  participants.delete(peerId);
  updateParticipantsList();
}

function grantScreen(peerId) {
  webrtc.sendControlMessage({ type: 'grantScreen', targetId: peerId });
  showToast('Screen sharing permission granted', 'success');
}

// ============================================
// Video Handling
// ============================================
function addRemoteVideo(peerId, stream) {
  removeRemoteVideo(peerId);
  
  const tile = document.createElement('div');
  tile.className = 'webcam-tile';
  tile.id = `webcam-${peerId}`;
  
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsinline = true;
  video.srcObject = stream;
  
  const name = document.createElement('span');
  name.className = 'webcam-name';
  name.textContent = participants.get(peerId)?.name || lobbyPeers.get(peerId)?.name || 'Participant';
  
  tile.appendChild(video);
  tile.appendChild(name);
  webcamGrid.appendChild(tile);
}

function removeRemoteVideo(peerId) {
  const tile = document.getElementById(`webcam-${peerId}`);
  if (tile) tile.remove();
}

function showRemoteScreenShare(peerId, stream) {
  console.log('📺 Showing remote screen share from:', peerId);
  screenVideo.srcObject = stream;
  screenVideo.classList.add('has-stream');
  screenPlaceholder.classList.add('hidden');
  
  // Auto-enter theater mode when receiving screen share
  enterTheaterMode();
}

// ============================================
// Chat
// ============================================
function handleChatSubmit(e) {
  e.preventDefault();
  
  const text = chatInput.value.trim();
  if (!text) return;
  
  const msg = webrtc.sendChatMessage(currentUser.name, text);
  addChatMessage(currentUser.name, text, msg.timestamp, true);
  chatInput.value = '';
}

function addChatMessage(sender, text, timestamp, isSelf = false) {
  const div = document.createElement('div');
  div.className = `chat-message${isSelf ? ' self' : ''}`;
  
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  div.innerHTML = `
    <span class="sender">${sender}</span>
    <span class="text">${escapeHtml(text)}</span>
    <span class="time">${time}</span>
  `;
  
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'chat-message system';
  div.innerHTML = `<span class="text">${text}</span>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============================================
// Utilities
// ============================================
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => toast.remove(), 4000);
}
