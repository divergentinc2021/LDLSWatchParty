// ============================================
// Watch Party - Main Application
// PWA + Notifications + Roles + Focus Mode
// ============================================

import * as api from './api.js';
import * as webrtc from './webrtc.js';

// ============================================
// Constants
// ============================================
const ROLES = {
  SUPERHOST: 'superhost',  // Original creator, full control
  HOST: 'host',            // Can share screen, granted by superhost
  PARTICIPANT: 'participant' // Regular viewer
};

// ============================================
// State
// ============================================
let currentRoom = null;
let currentToken = null;
let currentUser = null;
let myRole = ROLES.PARTICIPANT;
let hasPassword = false;
let lobbyPeers = new Map();
let participants = new Map(); // peerId -> {name, role}
let sessionStarted = false;

// UI State
let focusMode = false;
let controlsHidden = false;
let unreadChatCount = 0;
let sidebarVisible = false;
let notificationsEnabled = false;
let deferredInstallPrompt = null;

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
const btnInstall = document.getElementById('btn-install');

// Join Link
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
const roomHeader = document.getElementById('room-header');
const roomFooter = document.getElementById('room-footer');
const headerRoomCode = document.getElementById('header-room-code');
const roleBadge = document.getElementById('role-badge');
const participantCount = document.getElementById('participant-count');
const participantsList = document.getElementById('participants-list');
const sidebar = document.getElementById('sidebar');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatUnreadBadge = document.getElementById('chat-unread-badge');
const localVideo = document.getElementById('local-video');
const screenVideo = document.getElementById('screen-video');
const screenContainer = document.getElementById('screen-container');
const screenPlaceholder = document.getElementById('screen-placeholder');
const screenPlaceholderText = document.getElementById('screen-placeholder-text');
const webcamGrid = document.getElementById('webcam-grid');

// Controls
const btnMic = document.getElementById('btn-mic');
const btnCam = document.getElementById('btn-cam');
const btnScreen = document.getElementById('btn-screen');
const btnFocus = document.getElementById('btn-focus');
const btnPip = document.getElementById('btn-pip');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnToggleControls = document.getElementById('btn-toggle-controls');
const btnLeave = document.getElementById('btn-leave');
const btnCopyRoom = document.getElementById('btn-copy-room');
const btnBackHome = document.getElementById('btn-back-home');

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('🎬 Watch Party initializing...');
  
  // Register PWA
  registerServiceWorker();
  setupPWAInstall();
  
  // Request notification permission
  requestNotificationPermission();
  
  // Check URL for room link
  const path = window.location.pathname;
  const match = path.match(/^\/([A-Z0-9]{5})-([a-z0-9]{12})$/i);
  const loadingScreen = document.getElementById('loading-screen');
  
  if (match) {
    // Show loading screen while validating room
    loadingScreen?.classList.remove('hidden');
    
    const code = match[1].toUpperCase();
    const token = match[2];
    await handleDirectLink(code, token);
    
    // Hide loading screen after handling
    loadingScreen?.classList.add('hidden');
  } else {
    showView('landing');
    fetchActiveSessionCount();
  }
  
  setupEventListeners();
}

// ============================================
// PWA Setup
// ============================================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('✅ Service Worker registered'))
      .catch(err => console.log('SW registration failed:', err));
  }
}

function setupPWAInstall() {
  const installPrompt = document.getElementById('install-prompt');
  const installPromptBtn = document.getElementById('install-prompt-btn');
  const installPromptDismiss = document.getElementById('install-prompt-dismiss');
  const installPromptIOS = document.getElementById('install-prompt-ios');
  const installPromptIOSDismiss = document.getElementById('install-prompt-ios-dismiss');
  
  // Check if already installed
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
                       || window.navigator.standalone === true;
  
  if (isStandalone) {
    console.log('✅ Running as installed PWA');
    return; // Don't show install prompts
  }
  
  // Detect iOS (iPhone, iPad, iPod)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  if (isIOS) {
    // iOS doesn't support beforeinstallprompt - show manual instructions
    setTimeout(() => {
      if (localStorage.getItem('pwa-install-ios-dismissed') !== 'true') {
        installPromptIOS?.classList.remove('hidden');
      }
    }, 5000);
    
    installPromptIOSDismiss?.addEventListener('click', () => {
      installPromptIOS?.classList.add('hidden');
      localStorage.setItem('pwa-install-ios-dismissed', 'true');
    });
    return;
  }
  
  // Android/Desktop - use beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    
    // Show the small button immediately
    btnInstall?.classList.remove('hidden');
    
    // Show the banner after a delay (let user interact first)
    setTimeout(() => {
      // Only show if not dismissed before
      if (localStorage.getItem('pwa-install-dismissed') !== 'true') {
        installPrompt?.classList.remove('hidden');
      }
    }, 5000);
  });
  
  // Small button in header
  btnInstall?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    console.log('Install result:', result.outcome);
    deferredInstallPrompt = null;
    btnInstall.classList.add('hidden');
    installPrompt?.classList.add('hidden');
  });
  
  // Banner install button
  installPromptBtn?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    console.log('Install result:', result.outcome);
    deferredInstallPrompt = null;
    btnInstall?.classList.add('hidden');
    installPrompt?.classList.add('hidden');
  });
  
  // Banner dismiss button
  installPromptDismiss?.addEventListener('click', () => {
    installPrompt?.classList.add('hidden');
    localStorage.setItem('pwa-install-dismissed', 'true');
  });
  
  window.addEventListener('appinstalled', () => {
    console.log('✅ PWA installed');
    btnInstall?.classList.add('hidden');
    installPrompt?.classList.add('hidden');
  });
}

// ============================================
// Notifications
// ============================================
async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  
  if (Notification.permission === 'granted') {
    notificationsEnabled = true;
  } else if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    notificationsEnabled = permission === 'granted';
  }
}

function showNotification(title, body, tag = 'chat') {
  if (!notificationsEnabled || document.hasFocus()) return;
  
  const notification = new Notification(title, {
    body,
    icon: '/icons/icon.svg',
    tag,
    renotify: true
  });
  
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

// ============================================
// View Management
// ============================================
function showView(viewName) {
  Object.values(views).forEach(v => v?.classList.remove('active'));
  views[viewName]?.classList.add('active');
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
  // Forms
  createForm?.addEventListener('submit', handleCreateRoom);
  joinForm?.addEventListener('submit', handleJoinRoom);
  joinLinkForm?.addEventListener('submit', handleJoinViaLink);
  
  // Lobby
  btnLobbyCopy?.addEventListener('click', copyLobbyLink);
  btnStartSession?.addEventListener('click', startSession);
  btnLeaveLobby?.addEventListener('click', leaveLobby);
  
  // Room Controls
  btnMic?.addEventListener('click', toggleMic);
  btnCam?.addEventListener('click', toggleCam);
  btnScreen?.addEventListener('click', toggleScreen);
  btnFocus?.addEventListener('click', toggleFocusMode);
  btnPip?.addEventListener('click', togglePictureInPicture);
  btnFullscreen?.addEventListener('click', toggleFullscreen);
  btnToggleControls?.addEventListener('click', toggleControlsVisibility);
  btnLeave?.addEventListener('click', leaveRoom);
  btnCopyRoom?.addEventListener('click', copyRoomLink);
  
  // Chat
  chatForm?.addEventListener('submit', handleChatSubmit);
  chatInput?.addEventListener('focus', clearUnreadCount);
  sidebar?.addEventListener('mouseenter', () => { sidebarVisible = true; clearUnreadCount(); });
  sidebar?.addEventListener('mouseleave', () => { sidebarVisible = false; });
  
  // Kicked
  btnBackHome?.addEventListener('click', () => window.location.href = '/');
  
  // Keyboard
  document.addEventListener('keydown', handleKeyboard);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  
  // Visibility change (for notifications)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      clearUnreadCount();
    }
  });
}

function handleKeyboard(e) {
  if (!views.room?.classList.contains('active')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  switch (e.key.toLowerCase()) {
    case 'f': toggleFocusMode(); break;
    case 'm': toggleMic(); break;
    case 'v': toggleCam(); break;
    case 's': if (canShareScreen()) toggleScreen(); break;
    case 'p': togglePictureInPicture(); break;
    case 'escape': if (focusMode) toggleFocusMode(); break;
  }
}

// ============================================
// Focus Mode (Clean Theater Mode)
// ============================================
function toggleFocusMode() {
  focusMode = !focusMode;
  roomContainer?.classList.toggle('focus-mode', focusMode);
  btnFocus.dataset.active = String(focusMode);
  
  // Show controls initially when entering focus mode
  if (focusMode) {
    controlsHidden = false;
    updateControlsVisibility();
  }
  
  console.log('Focus mode:', focusMode);
}

function toggleControlsVisibility() {
  controlsHidden = !controlsHidden;
  updateControlsVisibility();
}

function updateControlsVisibility() {
  roomFooter?.classList.toggle('hidden-controls', controlsHidden);
  btnToggleControls?.querySelector('.icon-up')?.classList.toggle('hidden', controlsHidden);
  btnToggleControls?.querySelector('.icon-down')?.classList.toggle('hidden', !controlsHidden);
}

// ============================================
// Picture-in-Picture (Always on Top)
// ============================================
async function togglePictureInPicture() {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      showToast('Exited Picture-in-Picture', 'info');
    } else if (screenVideo?.srcObject) {
      await screenVideo.requestPictureInPicture();
      showToast('Now playing in Picture-in-Picture (always on top)', 'success');
    } else {
      showToast('No active screen share for PiP', 'error');
    }
  } catch (err) {
    console.error('PiP error:', err);
    showToast('Picture-in-Picture not supported', 'error');
  }
}

// ============================================
// Fullscreen
// ============================================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    roomContainer?.requestFullscreen().catch(err => console.error('Fullscreen error:', err));
  } else {
    document.exitFullscreen();
  }
}

function handleFullscreenChange() {
  const isFullscreen = !!document.fullscreenElement;
  btnFullscreen?.querySelector('.icon-expand')?.classList.toggle('hidden', isFullscreen);
  btnFullscreen?.querySelector('.icon-compress')?.classList.toggle('hidden', !isFullscreen);
  
  // Auto-enter focus mode when fullscreen
  if (isFullscreen && !focusMode) {
    toggleFocusMode();
  }
}

// ============================================
// Role System
// ============================================
function canShareScreen() {
  return myRole === ROLES.SUPERHOST || myRole === ROLES.HOST;
}

function updateRoleBadge() {
  if (!roleBadge) return;
  
  if (myRole === ROLES.SUPERHOST) {
    roleBadge.textContent = '👑 SUPERHOST';
    roleBadge.className = 'role-badge superhost';
    roleBadge.classList.remove('hidden');
  } else if (myRole === ROLES.HOST) {
    roleBadge.textContent = '🎬 HOST';
    roleBadge.className = 'role-badge host';
    roleBadge.classList.remove('hidden');
  } else {
    roleBadge.classList.add('hidden');
  }
  
  // Update screen button based on role
  btnScreen.disabled = !canShareScreen();
  screenPlaceholderText.textContent = canShareScreen() 
    ? 'Click "Screen" to share' 
    : 'Waiting for host to share screen';
}

function promoteToHost(peerId) {
  if (myRole !== ROLES.SUPERHOST) return;
  
  webrtc.sendControlMessage({ 
    type: 'roleChange', 
    targetId: peerId, 
    newRole: ROLES.HOST 
  });
  
  const peer = participants.get(peerId);
  if (peer) {
    peer.role = ROLES.HOST;
    updateParticipantsList();
    showToast(`${peer.name} is now a Host`, 'success');
  }
}

function demoteToParticipant(peerId) {
  if (myRole !== ROLES.SUPERHOST) return;
  
  webrtc.sendControlMessage({ 
    type: 'roleChange', 
    targetId: peerId, 
    newRole: ROLES.PARTICIPANT 
  });
  
  const peer = participants.get(peerId);
  if (peer) {
    peer.role = ROLES.PARTICIPANT;
    updateParticipantsList();
    showToast(`${peer.name} is now a Participant`, 'info');
  }
}

// ============================================
// Chat & Notifications
// ============================================
function clearUnreadCount() {
  unreadChatCount = 0;
  updateUnreadBadge();
}

function updateUnreadBadge() {
  if (!chatUnreadBadge) return;
  chatUnreadBadge.textContent = unreadChatCount > 99 ? '99+' : unreadChatCount;
  chatUnreadBadge.classList.toggle('visible', unreadChatCount > 0 && focusMode && !sidebarVisible);
}

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
  
  chatMessages?.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  // Increment unread and show notification
  if (!isSelf) {
    if (focusMode && !sidebarVisible) {
      unreadChatCount++;
      updateUnreadBadge();
    }
    
    // Show browser notification if not focused
    if (!document.hasFocus()) {
      showNotification('Watch Party', `${sender}: ${text}`);
    }
  }
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'chat-message system';
  div.innerHTML = `<span class="text">${text}</span>`;
  chatMessages?.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============================================
// Direct Link Handler
// ============================================
async function handleDirectLink(code, token) {
  console.log('Direct link:', code);
  
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
  joinLinkPassword?.classList.toggle('hidden', !result.hasPassword);
  
  showView('joinLink');
}

// ============================================
// Room Creation/Joining
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
    myRole = ROLES.SUPERHOST; // Creator is always superhost
    hasPassword = !!password;
    
    window.history.replaceState({}, '', `/${result.code}-${result.token}`);
    enterLobby();
  } catch (err) {
    console.error('Create room error:', err);
    showToast('Failed to create room', 'error');
  }
  btn.classList.remove('loading');
}

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
    myRole = ROLES.PARTICIPANT;
    hasPassword = validation.hasPassword;
    
    window.history.replaceState({}, '', `/${code}-${currentToken}`);
    enterLobby();
  } catch (err) {
    console.error('Join room error:', err);
    showToast('Failed to join room', 'error');
  }
  btn.classList.remove('loading');
}

async function handleJoinViaLink(e) {
  e.preventDefault();
  const btn = joinLinkForm.querySelector('button');
  btn.classList.add('loading');
  
  const name = joinLinkName.value.trim();
  const password = joinLinkPassword?.value || '';
  
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
    myRole = ROLES.PARTICIPANT;
    enterLobby();
  } catch (err) {
    console.error('Join error:', err);
    showToast('Failed to join room', 'error');
  }
  btn.classList.remove('loading');
}

// ============================================
// Lobby
// ============================================
async function enterLobby() {
  console.log('Entering lobby:', currentRoom);
  
  lobbyRoomCode.textContent = currentRoom;
  lobbyPasswordBadge?.classList.toggle('hidden', !hasPassword);
  lobbyShareUrl.textContent = `${window.location.origin}/${currentRoom}-${currentToken}`;
  lobbyStatusText.textContent = 'Connecting...';
  
  lobbyPeers.clear();
  lobbyPeers.set(currentUser.id, { name: currentUser.name, role: myRole });
  updateLobbyUI();
  
  showView('lobby');
  
  webrtc.setCallbacks({
    onPeerOpen: (peerId) => {
      console.log('✅ Connected:', peerId);
      lobbyStatusText.textContent = myRole === ROLES.SUPERHOST 
        ? 'Waiting for participants...' 
        : 'Connecting to host...';
    },
    onPeerError: (err) => {
      console.error('Peer error:', err);
      showToast('Connection error', 'error');
    },
    onConnection: (peerId, peerData) => {
      console.log('🤝 Peer connected:', peerId, peerData);
      if (peerData?.name) {
        const peerRole = peerData.role || ROLES.PARTICIPANT;
        lobbyPeers.set(peerId, { name: peerData.name, role: peerRole });
        updateLobbyUI();
        
        if (sessionStarted) {
          participants.set(peerId, { name: peerData.name, role: peerRole });
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
    onChatMessage: (peerId, msg) => addChatMessage(msg.displayName, msg.text, msg.timestamp),
    onControlMessage: (peerId, data) => handleControlMessage(peerId, data)
  });
  
  try {
    await webrtc.initPeer(currentRoom, currentUser.id, {
      name: currentUser.name,
      role: myRole
    });
  } catch (err) {
    console.error('WebRTC init failed:', err);
    showToast('Failed to connect', 'error');
  }
}

function updateLobbyUI() {
  const count = lobbyPeers.size;
  lobbyCount.textContent = count;
  
  if (myRole === ROLES.SUPERHOST) {
    btnStartSession.disabled = count < 2;
  } else {
    btnStartSession.style.display = 'none';
  }
  
  if (count >= 2) {
    lobbyStatusText.textContent = myRole === ROLES.SUPERHOST 
      ? 'Ready to start!' 
      : 'Waiting for host to start...';
  }
  
  lobbyParticipantsList.innerHTML = '';
  lobbyPeers.forEach((peer, peerId) => {
    const div = document.createElement('div');
    div.className = 'lobby-peer';
    const isSelf = peerId === currentUser.id;
    
    let roleTag = '';
    if (peer.role === ROLES.SUPERHOST) roleTag = '<span class="peer-host">👑 SuperHost</span>';
    else if (peer.role === ROLES.HOST) roleTag = '<span class="peer-host">🎬 Host</span>';
    
    div.innerHTML = `
      <span class="peer-dot"></span>
      <span class="peer-name">${peer.name}</span>
      ${isSelf ? '<span class="peer-tag">You</span>' : ''}
      ${roleTag}
    `;
    lobbyParticipantsList.appendChild(div);
  });
}

function copyLobbyLink() {
  navigator.clipboard.writeText(`${window.location.origin}/${currentRoom}-${currentToken}`)
    .then(() => showToast('Link copied!', 'success'));
}

function startSession() {
  if (myRole !== ROLES.SUPERHOST || lobbyPeers.size < 2) return;
  
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
  updateRoleBadge();
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
    showToast('Could not access camera/mic', 'error');
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
      
    case 'roleChange':
      if (data.targetId === currentUser.id) {
        myRole = data.newRole;
        updateRoleBadge();
        
        if (data.newRole === ROLES.HOST) {
          showToast('You are now a Host! You can share your screen.', 'success');
        } else if (data.newRole === ROLES.PARTICIPANT) {
          showToast('You are now a Participant', 'info');
          // Stop screen share if active
          if (btnScreen.dataset.active === 'true') {
            webrtc.stopScreenShare();
            btnScreen.dataset.active = 'false';
            screenVideo.srcObject = null;
          }
        }
      }
      // Update participant in list
      const peer = participants.get(data.targetId);
      if (peer) {
        peer.role = data.newRole;
        updateParticipantsList();
      }
      break;
      
    case 'screenStart':
      // Auto-enter focus mode when someone shares
      if (!focusMode) toggleFocusMode();
      break;
      
    case 'screenStop':
      break;
  }
}

// ============================================
// Media Controls
// ============================================
function toggleMic() {
  const isActive = btnMic.dataset.active === 'true';
  webrtc.toggleMic(!isActive);
  btnMic.dataset.active = String(!isActive);
}

function toggleCam() {
  const isActive = btnCam.dataset.active === 'true';
  webrtc.toggleCamera(!isActive);
  btnCam.dataset.active = String(!isActive);
}

async function toggleScreen() {
  if (!canShareScreen()) {
    showToast('Only hosts can share screen', 'error');
    return;
  }
  
  const isActive = btnScreen.dataset.active === 'true';
  
  if (isActive) {
    webrtc.stopScreenShare();
    btnScreen.dataset.active = 'false';
    screenVideo.srcObject = null;
    screenVideo.classList.remove('has-stream');
    screenPlaceholder?.classList.remove('hidden');
    webrtc.sendControlMessage({ type: 'screenStop' });
  } else {
    try {
      const stream = await webrtc.startScreenShare();
      screenVideo.srcObject = stream;
      screenVideo.classList.add('has-stream');
      screenPlaceholder?.classList.add('hidden');
      btnScreen.dataset.active = 'true';
      
      // Auto-enter focus mode
      if (!focusMode) toggleFocusMode();
      
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
  navigator.clipboard.writeText(`${window.location.origin}/${currentRoom}-${currentToken}`)
    .then(() => showToast('Link copied!', 'success'));
}

// ============================================
// Participants List
// ============================================
function updateParticipantsList() {
  const count = participants.size;
  participantCount.querySelector('span').textContent = count;
  
  participantsList.innerHTML = '';
  
  participants.forEach((p, peerId) => {
    const div = document.createElement('div');
    div.className = 'participant-item';
    const isSelf = peerId === currentUser.id;
    
    let roleTag = '';
    if (p.role === ROLES.SUPERHOST) roleTag = '<span class="participant-role superhost">👑</span>';
    else if (p.role === ROLES.HOST) roleTag = '<span class="participant-role host">🎬</span>';
    
    let actionsHtml = '';
    if (myRole === ROLES.SUPERHOST && !isSelf) {
      if (p.role === ROLES.PARTICIPANT) {
        actionsHtml = `<button class="btn-promote" data-peer="${peerId}" title="Make Host">🎬</button>`;
      } else if (p.role === ROLES.HOST) {
        actionsHtml = `<button class="btn-demote" data-peer="${peerId}" title="Remove Host">👤</button>`;
      }
      actionsHtml += `<button class="btn-kick" data-peer="${peerId}" title="Kick">✕</button>`;
    }
    
    div.innerHTML = `
      <div class="participant-info">
        ${roleTag}
        <span class="participant-name">${p.name}${isSelf ? ' (You)' : ''}</span>
      </div>
      <div class="participant-actions">${actionsHtml}</div>
    `;
    
    participantsList.appendChild(div);
  });
  
  // Event listeners
  participantsList.querySelectorAll('.btn-promote').forEach(btn => {
    btn.addEventListener('click', () => promoteToHost(btn.dataset.peer));
  });
  participantsList.querySelectorAll('.btn-demote').forEach(btn => {
    btn.addEventListener('click', () => demoteToParticipant(btn.dataset.peer));
  });
  participantsList.querySelectorAll('.btn-kick').forEach(btn => {
    btn.addEventListener('click', () => kickParticipant(btn.dataset.peer));
  });
}

function kickParticipant(peerId) {
  webrtc.sendControlMessage({ type: 'kick', targetId: peerId });
  participants.delete(peerId);
  updateParticipantsList();
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
  name.textContent = participants.get(peerId)?.name || lobbyPeers.get(peerId)?.name || 'Guest';
  
  tile.appendChild(video);
  tile.appendChild(name);
  webcamGrid?.appendChild(tile);
}

function removeRemoteVideo(peerId) {
  document.getElementById(`webcam-${peerId}`)?.remove();
}

function showRemoteScreenShare(peerId, stream) {
  console.log('📺 Remote screen share from:', peerId);
  screenVideo.srcObject = stream;
  screenVideo.classList.add('has-stream');
  screenPlaceholder?.classList.add('hidden');
  
  // Handle autoplay - browsers may block videos with audio
  const playPromise = screenVideo.play();
  if (playPromise !== undefined) {
    playPromise.catch(err => {
      console.log('Autoplay blocked, trying muted:', err);
      // Try playing muted first, then unmute after user interaction
      screenVideo.muted = true;
      screenVideo.play().then(() => {
        // Show toast to let user know they need to click for audio
        showToast('Click video for audio', 'info');
        // Add one-time click handler to unmute
        const unmuteHandler = () => {
          screenVideo.muted = false;
          screenVideo.removeEventListener('click', unmuteHandler);
        };
        screenVideo.addEventListener('click', unmuteHandler);
      }).catch(e => console.error('Video play failed:', e));
    });
  }
  
  if (!focusMode) toggleFocusMode();
}

// ============================================
// Utilities
// ============================================
async function fetchActiveSessionCount() {
  try {
    const result = await api.getActiveSessionCount();
    if (result.success && result.count > 0) {
      sessionCountEl.textContent = result.count;
      activeSessionsEl?.classList.remove('hidden');
    }
  } catch (err) {}
}

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
  container?.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
