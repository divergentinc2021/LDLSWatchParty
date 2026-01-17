// ============================================
// WebRTC Module - PeerJS + Media Handling
// ============================================

import { Peer } from 'peerjs';

// PeerJS Configuration
const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
};

// State
let peer = null;
let localStream = null;
let screenStream = null;
let connections = new Map();
let dataChannels = new Map();
let myPeerData = null;

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
 * Initialize PeerJS
 */
export function initPeer(roomCode, odId, peerData) {
  return new Promise((resolve, reject) => {
    const peerId = `${roomCode}-${odId}`;
    myPeerData = { ...peerData, odId };
    
    peer = new Peer(peerId, PEER_CONFIG);
    
    peer.on('open', (id) => {
      console.log('Peer connected:', id);
      if (callbacks.onPeerOpen) callbacks.onPeerOpen(id);
      resolve(id);
    });
    
    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (callbacks.onPeerError) callbacks.onPeerError(err);
      reject(err);
    });
    
    peer.on('call', handleIncomingCall);
    peer.on('connection', handleIncomingConnection);
  });
}

/**
 * Set callbacks
 */
export function setCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs };
}

/**
 * Connect to a peer
 */
export function connectToPeer(remotePeerId) {
  if (!peer || peer.disconnected) return;
  if (remotePeerId === peer.id) return;
  if (dataChannels.has(remotePeerId)) return;
  
  console.log('Connecting to:', remotePeerId);
  
  // Data connection with metadata
  const dataConn = peer.connect(remotePeerId, {
    reliable: true,
    metadata: myPeerData
  });
  setupDataConnection(dataConn);
  
  // Send media streams
  if (localStream) callPeer(remotePeerId, localStream, 'camera');
  if (screenStream) callPeer(remotePeerId, screenStream, 'screen');
}

/**
 * Call a peer with stream
 */
function callPeer(remotePeerId, stream, type = 'camera') {
  console.log(`Calling ${remotePeerId} with ${type}`);
  
  const call = peer.call(remotePeerId, stream, {
    metadata: { type, ...myPeerData }
  });
  
  call.on('stream', (remoteStream) => {
    handleRemoteStream(remotePeerId, remoteStream, call.metadata?.type);
  });
  
  call.on('close', () => console.log('Call closed:', remotePeerId));
  call.on('error', (err) => console.error('Call error:', err));
  
  if (!connections.has(remotePeerId)) {
    connections.set(remotePeerId, { calls: [], streams: [] });
  }
  connections.get(remotePeerId).calls.push(call);
}

/**
 * Handle incoming call
 */
function handleIncomingCall(call) {
  console.log('Incoming call from:', call.peer, call.metadata);
  call.answer(localStream || undefined);
  
  call.on('stream', (remoteStream) => {
    const type = call.metadata?.type || 'camera';
    handleRemoteStream(call.peer, remoteStream, type);
  });
  
  call.on('close', () => console.log('Incoming call closed'));
  
  if (!connections.has(call.peer)) {
    connections.set(call.peer, { calls: [], streams: [] });
  }
  connections.get(call.peer).calls.push(call);
}

/**
 * Handle incoming data connection
 */
function handleIncomingConnection(conn) {
  console.log('Incoming connection from:', conn.peer, conn.metadata);
  setupDataConnection(conn);
}

/**
 * Handle remote stream
 */
function handleRemoteStream(peerId, stream, type) {
  console.log(`Received ${type} from:`, peerId);
  
  if (!connections.has(peerId)) {
    connections.set(peerId, { calls: [], streams: [] });
  }
  connections.get(peerId).streams.push({ stream, type });
  
  if (type === 'screen') {
    if (callbacks.onScreenStream) callbacks.onScreenStream(peerId, stream);
  } else {
    if (callbacks.onRemoteStream) callbacks.onRemoteStream(peerId, stream);
  }
}

/**
 * Setup data connection
 */
function setupDataConnection(conn) {
  conn.on('open', () => {
    console.log('Data connection open:', conn.peer);
    dataChannels.set(conn.peer, conn);
    
    // Send our info
    conn.send({ type: 'peerInfo', data: myPeerData });
    
    if (callbacks.onConnection) {
      callbacks.onConnection(conn.peer, conn.metadata);
    }
  });
  
  conn.on('data', (message) => {
    if (message.type === 'chat' && callbacks.onChatMessage) {
      callbacks.onChatMessage(conn.peer, message);
    } else if (message.type === 'control' && callbacks.onControlMessage) {
      callbacks.onControlMessage(conn.peer, message.data);
    } else if (message.type === 'peerInfo' && callbacks.onConnection) {
      callbacks.onConnection(conn.peer, message.data);
    }
  });
  
  conn.on('close', () => {
    console.log('Data connection closed:', conn.peer);
    dataChannels.delete(conn.peer);
    if (callbacks.onDisconnection) callbacks.onDisconnection(conn.peer);
  });
  
  conn.on('error', (err) => console.error('Data error:', err));
}

/**
 * Send chat message
 */
export function sendChatMessage(displayName, text) {
  const message = {
    type: 'chat',
    displayName,
    text,
    timestamp: Date.now()
  };
  
  dataChannels.forEach((conn) => {
    if (conn.open) conn.send(message);
  });
  
  return message;
}

/**
 * Send control message
 */
export function sendControlMessage(data) {
  const message = { type: 'control', data };
  
  dataChannels.forEach((conn) => {
    if (conn.open) conn.send(message);
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
      audio: audio ? {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } : false,
      video: video ? {
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 15 }
      } : false
    });
    
    // Send to existing connections
    connections.forEach((_, peerId) => {
      callPeer(peerId, localStream, 'camera');
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
 * Start screen share with audio option
 */
export async function startScreenShare() {
  try {
    // Request screen share with audio
    // Using 'monitor' for entire screen (can minimize browser)
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor' // Entire screen
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 44100
      }
    });
    
    // Send to all peers
    connections.forEach((_, peerId) => {
      callPeer(peerId, screenStream, 'screen');
    });
    
    // Handle user stopping via browser
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
 * Get connected peers
 */
export function getConnectedPeers() {
  return Array.from(connections.keys());
}

/**
 * Disconnect and cleanup
 */
export function disconnect() {
  dataChannels.forEach(conn => conn.close());
  dataChannels.clear();
  
  connections.forEach(data => {
    data.calls.forEach(call => call.close());
  });
  connections.clear();
  
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
  
  myPeerData = null;
}

/**
 * Get peer ID
 */
export function getPeerId() {
  return peer?.id;
}
