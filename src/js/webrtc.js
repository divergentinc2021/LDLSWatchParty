// ============================================
// WebRTC Module - PeerJS + Media Handling
// ============================================

import { Peer } from 'peerjs';
import { PEER_CONFIG } from './config.js';

// State
let peer = null;
let localStream = null;
let screenStream = null;
let connections = new Map(); // peerId -> { conn, call, stream }
let dataChannels = new Map(); // peerId -> dataConnection

// Callbacks
let callbacks = {
  onPeerOpen: null,
  onPeerError: null,
  onConnection: null,
  onDisconnection: null,
  onRemoteStream: null,
  onScreenStream: null,
  onChatMessage: null
};

/**
 * Initialize PeerJS with room-specific ID
 */
export function initPeer(roomCode, odId) {
  return new Promise((resolve, reject) => {
    // Create a unique peer ID based on room and user
    const peerId = `${roomCode}-${odId}`;
    
    peer = new Peer(peerId, PEER_CONFIG);
    
    peer.on('open', (id) => {
      console.log('Peer connected with ID:', id);
      if (callbacks.onPeerOpen) callbacks.onPeerOpen(id);
      resolve(id);
    });
    
    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (callbacks.onPeerError) callbacks.onPeerError(err);
      reject(err);
    });
    
    // Handle incoming calls
    peer.on('call', (call) => {
      console.log('Incoming call from:', call.peer);
      handleIncomingCall(call);
    });
    
    // Handle incoming data connections (for chat)
    peer.on('connection', (conn) => {
      console.log('Incoming data connection from:', conn.peer);
      setupDataConnection(conn);
    });
  });
}

/**
 * Set event callbacks
 */
export function setCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs };
}

/**
 * Connect to a peer
 */
export function connectToPeer(remotePeerId) {
  if (!peer || peer.disconnected) {
    console.error('Peer not initialized');
    return;
  }
  
  // Don't connect to ourselves
  if (remotePeerId === peer.id) return;
  
  // Already connected?
  if (connections.has(remotePeerId)) return;
  
  console.log('Connecting to peer:', remotePeerId);
  
  // Create data connection for chat
  const dataConn = peer.connect(remotePeerId, { reliable: true });
  setupDataConnection(dataConn);
  
  // If we have local media, call the peer
  if (localStream) {
    callPeer(remotePeerId, localStream);
  }
  
  // If we're sharing screen, call with screen too
  if (screenStream) {
    callPeer(remotePeerId, screenStream, 'screen');
  }
}

/**
 * Call a peer with media stream
 */
function callPeer(remotePeerId, stream, streamType = 'camera') {
  console.log(`Calling ${remotePeerId} with ${streamType}`);
  
  const call = peer.call(remotePeerId, stream, {
    metadata: { type: streamType }
  });
  
  call.on('stream', (remoteStream) => {
    handleRemoteStream(remotePeerId, remoteStream, call.metadata?.type);
  });
  
  call.on('close', () => {
    console.log('Call closed:', remotePeerId);
  });
  
  call.on('error', (err) => {
    console.error('Call error:', err);
  });
  
  // Store connection
  if (!connections.has(remotePeerId)) {
    connections.set(remotePeerId, { calls: [], streams: [] });
  }
  connections.get(remotePeerId).calls.push(call);
}

/**
 * Handle incoming call
 */
function handleIncomingCall(call) {
  // Answer with local stream if available
  call.answer(localStream || undefined);
  
  call.on('stream', (remoteStream) => {
    const streamType = call.metadata?.type || 'camera';
    handleRemoteStream(call.peer, remoteStream, streamType);
  });
  
  call.on('close', () => {
    console.log('Incoming call closed:', call.peer);
  });
  
  // Store connection
  if (!connections.has(call.peer)) {
    connections.set(call.peer, { calls: [], streams: [] });
  }
  connections.get(call.peer).calls.push(call);
}

/**
 * Handle remote stream
 */
function handleRemoteStream(peerId, stream, type) {
  console.log(`Received ${type} stream from:`, peerId);
  
  // Store stream
  if (!connections.has(peerId)) {
    connections.set(peerId, { calls: [], streams: [] });
  }
  connections.get(peerId).streams.push({ stream, type });
  
  // Notify callback
  if (type === 'screen' && callbacks.onScreenStream) {
    callbacks.onScreenStream(peerId, stream);
  } else if (callbacks.onRemoteStream) {
    callbacks.onRemoteStream(peerId, stream);
  }
}

/**
 * Setup data connection for chat
 */
function setupDataConnection(conn) {
  conn.on('open', () => {
    console.log('Data connection open:', conn.peer);
    dataChannels.set(conn.peer, conn);
    
    if (callbacks.onConnection) {
      callbacks.onConnection(conn.peer);
    }
  });
  
  conn.on('data', (data) => {
    if (data.type === 'chat' && callbacks.onChatMessage) {
      callbacks.onChatMessage(conn.peer, data);
    }
  });
  
  conn.on('close', () => {
    console.log('Data connection closed:', conn.peer);
    dataChannels.delete(conn.peer);
    
    if (callbacks.onDisconnection) {
      callbacks.onDisconnection(conn.peer);
    }
  });
  
  conn.on('error', (err) => {
    console.error('Data connection error:', err);
  });
}

/**
 * Send chat message to all peers
 */
export function sendChatMessage(displayName, text) {
  const message = {
    type: 'chat',
    displayName,
    text,
    timestamp: Date.now()
  };
  
  dataChannels.forEach((conn) => {
    if (conn.open) {
      conn.send(message);
    }
  });
  
  return message;
}

/**
 * Get local media stream
 */
export async function getLocalStream(audio = true, video = true) {
  try {
    // Stop existing stream
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
    connections.forEach((data, peerId) => {
      callPeer(peerId, localStream, 'camera');
    });
    
    return localStream;
  } catch (err) {
    console.error('Error getting local stream:', err);
    throw err;
  }
}

/**
 * Toggle microphone
 */
export function toggleMic(enabled) {
  if (localStream) {
    localStream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });
  }
  return enabled;
}

/**
 * Toggle camera
 */
export function toggleCamera(enabled) {
  if (localStream) {
    localStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });
  }
  return enabled;
}

/**
 * Start screen sharing
 */
export async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor'
      },
      audio: false // No system audio
    });
    
    // Send to all peers
    connections.forEach((data, peerId) => {
      callPeer(peerId, screenStream, 'screen');
    });
    
    // Handle user stopping via browser UI
    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };
    
    return screenStream;
  } catch (err) {
    console.error('Error starting screen share:', err);
    throw err;
  }
}

/**
 * Stop screen sharing
 */
export function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
}

/**
 * Get current streams
 */
export function getLocalMediaStream() {
  return localStream;
}

export function getScreenMediaStream() {
  return screenStream;
}

/**
 * Get connected peer IDs
 */
export function getConnectedPeers() {
  return Array.from(connections.keys());
}

/**
 * Disconnect from all peers and cleanup
 */
export function disconnect() {
  // Close all data channels
  dataChannels.forEach(conn => conn.close());
  dataChannels.clear();
  
  // Close all calls
  connections.forEach(data => {
    data.calls.forEach(call => call.close());
  });
  connections.clear();
  
  // Stop local streams
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  
  // Destroy peer
  if (peer) {
    peer.destroy();
    peer = null;
  }
}

/**
 * Get peer ID
 */
export function getPeerId() {
  return peer?.id;
}
