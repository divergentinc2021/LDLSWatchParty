// ============================================
// WebRTC Module
// Handles P2P connections via simple-peer
// Uses Firebase Realtime Database for signaling
// ============================================

import { 
  getDatabase, 
  ref, 
  set, 
  push, 
  onChildAdded,
  onChildRemoved,
  remove,
  onDisconnect
} from 'firebase/database';
import SimplePeer from 'simple-peer';
import { iceServers } from './firebase-config.js';

let rtdb;
let localStream = null;
let screenStream = null;
let peers = new Map(); // odId -> { peer, stream }
let roomCode = null;
let localUserId = null;
let isHost = false;

// Callbacks
let onRemoteStream = null;
let onRemoteDisconnect = null;
let onScreenStream = null;

export function initWebRTC(firebaseApp) {
  rtdb = getDatabase(firebaseApp);
}

export function setCallbacks({ onStream, onDisconnect, onScreen }) {
  onRemoteStream = onStream;
  onRemoteDisconnect = onDisconnect;
  onScreenStream = onScreen;
}

/**
 * Join the WebRTC mesh for a room
 */
export async function joinMesh(code, odId, host = false) {
  roomCode = code;
  localUserId = odId;
  isHost = host;
  
  // Reference to this room's signaling data
  const roomRef = ref(rtdb, `rooms/${roomCode}`);
  const userRef = ref(rtdb, `rooms/${roomCode}/users/${localUserId}`);
  
  // Announce our presence
  await set(userRef, {
    odId: localUserId,
    joinedAt: Date.now(),
    isHost: host
  });
  
  // Clean up on disconnect
  onDisconnect(userRef).remove();
  
  // Listen for other users joining
  const usersRef = ref(rtdb, `rooms/${roomCode}/users`);
  
  onChildAdded(usersRef, (snapshot) => {
    const userData = snapshot.val();
    const odId = snapshot.key;
    
    // Don't connect to ourselves
    if (odId === localUserId) return;
    
    // Don't duplicate connections
    if (peers.has(odId)) return;
    
    console.log('User joined:', odId);
    
    // Initiator is the user with "higher" ID (consistent ordering)
    const shouldInitiate = localUserId > odId;
    createPeer(odId, shouldInitiate);
  });
  
  // Listen for users leaving
  onChildRemoved(usersRef, (snapshot) => {
    const odId = snapshot.key;
    console.log('User left:', odId);
    removePeer(odId);
  });
  
  // Listen for signaling messages to us
  const signalRef = ref(rtdb, `rooms/${roomCode}/signals/${localUserId}`);
  
  onChildAdded(signalRef, async (snapshot) => {
    const data = snapshot.val();
    const fromId = data.from;
    const signal = data.signal;
    
    console.log('Received signal from:', fromId);
    
    // Get or create peer
    let peerData = peers.get(fromId);
    
    if (!peerData) {
      // They initiated, we respond
      createPeer(fromId, false);
      peerData = peers.get(fromId);
    }
    
    // Pass signal to peer
    if (peerData && peerData.peer) {
      peerData.peer.signal(signal);
    }
    
    // Clean up processed signal
    await remove(snapshot.ref);
  });
}

/**
 * Create a peer connection
 */
function createPeer(remoteId, initiator) {
  console.log(`Creating peer for ${remoteId}, initiator: ${initiator}`);
  
  const peer = new SimplePeer({
    initiator,
    trickle: true,
    config: { iceServers },
    stream: localStream || undefined
  });
  
  // Store peer
  peers.set(remoteId, { peer, stream: null });
  
  // Handle signaling data
  peer.on('signal', async (signal) => {
    // Send signal to remote peer via Firebase
    const signalRef = ref(rtdb, `rooms/${roomCode}/signals/${remoteId}`);
    await push(signalRef, {
      from: localUserId,
      signal,
      timestamp: Date.now()
    });
  });
  
  // Handle incoming stream
  peer.on('stream', (stream) => {
    console.log('Received stream from:', remoteId);
    
    const peerData = peers.get(remoteId);
    if (peerData) {
      peerData.stream = stream;
    }
    
    // Check if this is a screen share stream (has video but no audio typically)
    // or a webcam stream
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    
    // Screen shares typically have displaySurface property
    const isScreen = videoTracks.some(t => 
      t.getSettings().displaySurface !== undefined
    );
    
    if (isScreen && onScreenStream) {
      onScreenStream(remoteId, stream);
    } else if (onRemoteStream) {
      onRemoteStream(remoteId, stream);
    }
  });
  
  // Handle connection established
  peer.on('connect', () => {
    console.log('Connected to:', remoteId);
  });
  
  // Handle errors
  peer.on('error', (err) => {
    console.error('Peer error:', remoteId, err);
    removePeer(remoteId);
  });
  
  // Handle close
  peer.on('close', () => {
    console.log('Peer closed:', remoteId);
    removePeer(remoteId);
  });
  
  return peer;
}

/**
 * Remove a peer connection
 */
function removePeer(odId) {
  const peerData = peers.get(odId);
  if (peerData) {
    if (peerData.peer) {
      peerData.peer.destroy();
    }
    peers.delete(odId);
    
    if (onRemoteDisconnect) {
      onRemoteDisconnect(odId);
    }
  }
}

/**
 * Get or create local media stream
 */
export async function getLocalStream(audio = true, video = true) {
  if (localStream) {
    // Update existing stream
    if (audio) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = true;
    }
    if (video) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = true;
    }
    return localStream;
  }
  
  try {
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
    
    // Add stream to existing peers
    peers.forEach((peerData, odId) => {
      if (peerData.peer && !peerData.peer.destroyed) {
        localStream.getTracks().forEach(track => {
          peerData.peer.addTrack(track, localStream);
        });
      }
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
 * Start screen sharing (host only)
 */
export async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    
    // Send screen stream to all peers
    peers.forEach((peerData, odId) => {
      if (peerData.peer && !peerData.peer.destroyed) {
        screenStream.getTracks().forEach(track => {
          peerData.peer.addTrack(track, screenStream);
        });
      }
    });
    
    // Handle user stopping share via browser UI
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
 * Get screen stream (for local display)
 */
export function getScreenStream() {
  return screenStream;
}

/**
 * Leave the mesh
 */
export async function leaveMesh() {
  // Stop all tracks
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  
  // Destroy all peers
  peers.forEach((peerData, odId) => {
    if (peerData.peer) {
      peerData.peer.destroy();
    }
  });
  peers.clear();
  
  // Remove from Firebase
  if (roomCode && localUserId) {
    const userRef = ref(rtdb, `rooms/${roomCode}/users/${localUserId}`);
    await remove(userRef);
  }
  
  roomCode = null;
  localUserId = null;
}

/**
 * Get all connected peer IDs
 */
export function getConnectedPeers() {
  return Array.from(peers.keys());
}

/**
 * Get local stream
 */
export function getLocalMediaStream() {
  return localStream;
}
