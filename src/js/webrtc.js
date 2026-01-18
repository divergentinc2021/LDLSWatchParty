// ============================================
// WebRTC Module - PeerJS + Peer Discovery
// Lazy-loaded for better performance
// ============================================

import * as api from './api.js';

// Lazy load PeerJS for better initial load performance
let PeerClass = null;
async function loadPeerJS() {
  if (!PeerClass) {
    const module = await import('peerjs');
    PeerClass = module.Peer;
  }
  return PeerClass;
}

// PeerJS Configuration
const PEER_CONFIG = {
  debug: 1, // Reduced from 2 for production
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  }
};

const HEARTBEAT_INTERVAL = 25000;
const PEER_DISCOVERY_INTERVAL = 10000;

// State
let peer = null;
let roomCode = null;
let localStream = null;
let screenStream = null;
let connections = new Map();
let myPeerData = null;
let heartbeatTimer = null;
let discoveryTimer = null;
let connectedPeerIds = new Set();

// Callbacks
let callbacks = {
  onPeerOpen: null,
  onPeerError: null,
  onConnection: null,
  onDisconnection: null,
  onRemoteStream: null,
  onScreenStream: null,
  onChatMessage: null,
  onControlMessage: null
};

/**
 * Set callbacks
 */
export function setCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs };
}

/**
 * Initialize PeerJS and join room
 */
export async function initPeer(code, odId, peerData) {
  // Lazy load PeerJS when first needed (saves ~500KB on initial load)
  const Peer = await loadPeerJS();
  
  return new Promise(async (resolve, reject) => {
    roomCode = code.toUpperCase();
    const peerId = `${roomCode}-${odId}`;
    myPeerData = { ...peerData, odId, peerId };
    
    console.log('Initializing peer:', peerId);
    
    peer = new Peer(peerId, PEER_CONFIG);
    
    peer.on('open', async (id) => {
      console.log('✅ Peer connected with ID:', id);
      
      await api.registerPeer(roomCode, id, peerData.name, peerData.isHost);
      startHeartbeat();
      await discoverAndConnectPeers();
      startPeerDiscovery();
      
      if (callbacks.onPeerOpen) callbacks.onPeerOpen(id);
      resolve(id);
    });
    
    peer.on('error', (err) => {
      console.error('❌ Peer error:', err);
      if (callbacks.onPeerError) callbacks.onPeerError(err);
      if (!peer?.open) reject(err);
    });
    
    peer.on('call', handleIncomingCall);
    peer.on('connection', handleIncomingDataConnection);
    
    peer.on('disconnected', () => {
      console.log('⚠️ Peer disconnected, attempting reconnect...');
      peer.reconnect();
    });
  });
}

/**
 * Discover peers in the room and connect to them
 */
async function discoverAndConnectPeers() {
  console.log('🔍 Discovering peers in room:', roomCode);
  
  const result = await api.getActivePeers(roomCode);
  
  if (!result.success || !result.peers) {
    console.log('No peers found or error:', result);
    return;
  }
  
  console.log('Found peers:', result.peers);
  
  for (const peerInfo of result.peers) {
    if (peerInfo.peerId === peer.id) continue;
    if (connectedPeerIds.has(peerInfo.peerId)) continue;
    
    console.log('📞 Connecting to peer:', peerInfo.peerId, peerInfo.name);
    connectToPeer(peerInfo.peerId, peerInfo);
  }
}

/**
 * Connect to a specific peer
 */
function connectToPeer(remotePeerId, peerInfo = {}) {
  if (!peer || peer.disconnected) {
    console.warn('Cannot connect: peer not ready');
    return;
  }
  if (remotePeerId === peer.id) return;
  if (connections.has(remotePeerId)) {
    console.log('Already connected to:', remotePeerId);
    return;
  }
  
  console.log('🔗 Initiating connection to:', remotePeerId);
  
  const dataConn = peer.connect(remotePeerId, {
    reliable: true,
    metadata: myPeerData
  });
  
  setupDataConnection(dataConn, peerInfo);
}

/**
 * Setup data connection handlers
 */
function setupDataConnection(conn, peerInfo = {}) {
  const remotePeerId = conn.peer;
  
  conn.on('open', () => {
    console.log('✅ Data connection open with:', remotePeerId);
    
    connectedPeerIds.add(remotePeerId);
    
    if (!connections.has(remotePeerId)) {
      connections.set(remotePeerId, { dataConn: conn, calls: [], peerInfo: peerInfo });
    } else {
      connections.get(remotePeerId).dataConn = conn;
    }
    
    conn.send({ type: 'peerInfo', data: myPeerData });
    
    const metadata = conn.metadata || peerInfo;
    if (callbacks.onConnection) {
      callbacks.onConnection(remotePeerId, metadata);
    }
    
    if (localStream) {
      console.log('📹 Sending camera stream to:', remotePeerId);
      callPeer(remotePeerId, localStream, 'camera');
    }
    if (screenStream) {
      console.log('🖥️ Sending screen stream to:', remotePeerId);
      callPeer(remotePeerId, screenStream, 'screen');
    }
  });
  
  conn.on('data', (message) => handleDataMessage(remotePeerId, message));
  
  conn.on('close', () => {
    console.log('❌ Data connection closed:', remotePeerId);
    handlePeerDisconnect(remotePeerId);
  });
  
  conn.on('error', (err) => {
    console.error('Data connection error:', remotePeerId, err);
  });
}

/**
 * Handle incoming data connection
 */
function handleIncomingDataConnection(conn) {
  console.log('📥 Incoming data connection from:', conn.peer);
  setupDataConnection(conn, conn.metadata || {});
}

/**
 * Handle data messages
 */
function handleDataMessage(peerId, message) {
  switch (message.type) {
    case 'peerInfo':
      if (connections.has(peerId)) {
        connections.get(peerId).peerInfo = message.data;
      }
      if (callbacks.onConnection) {
        callbacks.onConnection(peerId, message.data);
      }
      break;
      
    case 'chat':
      if (callbacks.onChatMessage) {
        callbacks.onChatMessage(peerId, message);
      }
      break;
      
    case 'control':
      if (callbacks.onControlMessage) {
        callbacks.onControlMessage(peerId, message.data);
      }
      break;
  }
}

/**
 * Call a peer with a media stream
 */
function callPeer(remotePeerId, stream, type = 'camera') {
  if (!peer || !stream) return;
  
  console.log(`📞 Calling ${remotePeerId} with ${type} stream`);
  
  const call = peer.call(remotePeerId, stream, {
    metadata: { type, ...myPeerData }
  });
  
  call.on('stream', (remoteStream) => {
    handleRemoteStream(remotePeerId, remoteStream, call.metadata?.type || type);
  });
  
  call.on('close', () => {
    console.log('Call closed with:', remotePeerId);
  });
  
  call.on('error', (err) => {
    console.error('Call error:', err);
  });
  
  if (!connections.has(remotePeerId)) {
    connections.set(remotePeerId, { calls: [call], peerInfo: {} });
  } else {
    connections.get(remotePeerId).calls.push(call);
  }
}

/**
 * Handle incoming call
 */
function handleIncomingCall(call) {
  console.log('📥 Incoming call from:', call.peer);
  console.log('📥 Call metadata:', JSON.stringify(call.metadata));
  
  call.answer(localStream || undefined);
  
  call.on('stream', (remoteStream) => {
    // Try to detect stream type from metadata first
    let type = call.metadata?.type;
    
    // If no metadata type, try to detect if it's a screen share from track settings
    if (!type) {
      const videoTrack = remoteStream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        // Screen shares typically have displaySurface set, or larger dimensions
        if (settings.displaySurface || 
            (settings.width && settings.width > 1000) ||
            videoTrack.label?.toLowerCase().includes('screen')) {
          type = 'screen';
          console.log('📺 Auto-detected screen share from track settings:', settings);
        } else {
          type = 'camera';
        }
      } else {
        type = 'camera';
      }
    }
    
    console.log(`📥 Stream received! Type: ${type}, Tracks: ${remoteStream.getTracks().length}`);
    handleRemoteStream(call.peer, remoteStream, type);
  });
  
  call.on('close', () => {
    console.log('Incoming call closed from:', call.peer);
  });
  
  call.on('error', (err) => {
    console.error('❌ Incoming call error:', err);
  });
  
  if (!connections.has(call.peer)) {
    connections.set(call.peer, { calls: [call], peerInfo: call.metadata || {} });
  } else {
    connections.get(call.peer).calls.push(call);
  }
}

/**
 * Handle received remote stream
 */
function handleRemoteStream(peerId, stream, type) {
  console.log(`📺 Received ${type} stream from:`, peerId);
  
  if (type === 'screen') {
    if (callbacks.onScreenStream) callbacks.onScreenStream(peerId, stream);
  } else {
    if (callbacks.onRemoteStream) callbacks.onRemoteStream(peerId, stream);
  }
}

/**
 * Handle peer disconnect
 */
function handlePeerDisconnect(peerId) {
  console.log('👋 Peer disconnected:', peerId);
  
  connectedPeerIds.delete(peerId);
  
  const conn = connections.get(peerId);
  if (conn) {
    conn.calls?.forEach(call => call.close());
    conn.dataConn?.close();
  }
  connections.delete(peerId);
  
  if (callbacks.onDisconnection) {
    callbacks.onDisconnection(peerId);
  }
}

/**
 * Start heartbeat to stay registered
 */
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    if (peer?.id && roomCode) {
      await api.peerHeartbeat(roomCode, peer.id);
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * Start periodic peer discovery
 */
function startPeerDiscovery() {
  stopPeerDiscovery();
  discoveryTimer = setInterval(async () => {
    await discoverAndConnectPeers();
  }, PEER_DISCOVERY_INTERVAL);
}

function stopPeerDiscovery() {
  if (discoveryTimer) {
    clearInterval(discoveryTimer);
    discoveryTimer = null;
  }
}

/**
 * Send chat message to all connected peers
 */
export function sendChatMessage(displayName, text) {
  const message = {
    type: 'chat',
    displayName,
    text,
    timestamp: Date.now()
  };
  
  connections.forEach((conn) => {
    if (conn.dataConn?.open) {
      conn.dataConn.send(message);
    }
  });
  
  return message;
}

/**
 * Send control message to all connected peers
 */
export function sendControlMessage(data) {
  const message = { type: 'control', data };
  
  connections.forEach((conn) => {
    if (conn.dataConn?.open) {
      conn.dataConn.send(message);
    }
  });
}

/**
 * Get local media stream
 */
export async function getLocalStream(audio = true, video = true) {
  try {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
    }
    
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
      video: video ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } } : false
    });
    
    connections.forEach((conn, peerId) => {
      if (conn.dataConn?.open) {
        callPeer(peerId, localStream, 'camera');
      }
    });
    
    return localStream;
  } catch (err) {
    console.error('getUserMedia error:', err);
    throw err;
  }
}

/**
 * Toggle microphone
 */
export function toggleMic(enabled) {
  if (localStream) {
    localStream.getAudioTracks().forEach(t => t.enabled = enabled);
  }
  return enabled;
}

/**
 * Toggle camera
 */
export function toggleCamera(enabled) {
  if (localStream) {
    localStream.getVideoTracks().forEach(t => t.enabled = enabled);
  }
  return enabled;
}

/**
 * Start screen share
 */
export async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always', displaySurface: 'monitor' },
      audio: { echoCancellation: false, noiseSuppression: false }
    });
    
    connections.forEach((conn, peerId) => {
      if (conn.dataConn?.open) {
        callPeer(peerId, screenStream, 'screen');
      }
    });
    
    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };
    
    return screenStream;
  } catch (err) {
    console.error('Screen share error:', err);
    throw err;
  }
}

/**
 * Stop screen share
 */
export function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
}

/**
 * Get list of connected peer IDs
 */
export function getConnectedPeers() {
  return Array.from(connectedPeerIds);
}

/**
 * Get our peer ID
 */
export function getPeerId() {
  return peer?.id;
}

/**
 * Disconnect and cleanup everything
 */
export async function disconnect() {
  console.log('🔌 Disconnecting...');
  
  stopHeartbeat();
  stopPeerDiscovery();
  
  if (roomCode && peer?.id) {
    await api.unregisterPeer(roomCode, peer.id);
  }
  
  connections.forEach((conn, peerId) => {
    conn.calls?.forEach(call => call.close());
    conn.dataConn?.close();
  });
  connections.clear();
  connectedPeerIds.clear();
  
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  
  if (peer) {
    peer.destroy();
    peer = null;
  }
  
  roomCode = null;
  myPeerData = null;
}
