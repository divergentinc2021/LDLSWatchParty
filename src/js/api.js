// ============================================
// API - Apps Script Backend Communication
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbzGSfmG-uWUd-9WYc99JcBDcekFb4A8D4lv1JqKRUIHx3fI06dt4xd3R5oHR9Nm-gzfTA/exec';

async function apiCall(params) {
  try {
    const url = `${API_URL}?${new URLSearchParams(params)}`;
    console.log('API:', params.action);
    const response = await fetch(url, { method: 'GET', mode: 'cors' });
    const result = await response.json();
    console.log('API Response:', result);
    return result;
  } catch (err) {
    console.error('API Error:', err);
    return { success: false, error: 'Network error' };
  }
}

// Room Management
export const createRoom = (email, name, password = '') => 
  apiCall({ action: 'createRoom', email, name, password });

export const joinRoom = (code, email, name, password = '') => 
  apiCall({ action: 'joinRoom', code, email, name, password });

export const validateRoom = (code) => 
  apiCall({ action: 'validateRoom', code });

export const verifyAccess = (code, token, email) => 
  apiCall({ action: 'verifyAccess', code, token, email });

export const getRoomInfo = (code) => 
  apiCall({ action: 'getRoomInfo', code });

// Peer Discovery
export const registerPeer = (code, peerId, name, isHost) => 
  apiCall({ action: 'registerPeer', code, peerId, name, isHost: isHost ? 'true' : 'false' });

export const getActivePeers = (code) => 
  apiCall({ action: 'getActivePeers', code });

export const peerHeartbeat = (code, peerId) => 
  apiCall({ action: 'heartbeat', code, peerId });

export const unregisterPeer = (code, peerId) => 
  apiCall({ action: 'unregisterPeer', code, peerId });

// Stats
export const getActiveSessionCount = () => 
  apiCall({ action: 'getActiveSessionCount' });
