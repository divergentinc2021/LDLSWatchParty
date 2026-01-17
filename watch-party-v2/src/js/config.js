// ============================================
// Configuration
// ============================================

// Google Apps Script Web App URL
// Replace with your deployed Apps Script URL
export const API_URL = 'https://script.google.com/macros/s/AKfycbzGSfmG-uWUd-9WYc99JcBDcekFb4A8D4lv1JqKRUIHx3fI06dt4xd3R5oHR9Nm-gzfTA/exec';

// Your Netlify domain (used for email links)
export const APP_URL = window.location.origin;

// PeerJS configuration
export const PEER_CONFIG = {
  // Using PeerJS Cloud (free)
  // For production, consider running your own PeerJS server
  debug: 2, // 0 = none, 1 = errors, 2 = warnings, 3 = all
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  }
};

// Room settings
export const ROOM_SETTINGS = {
  codeLength: 5,
  maxParticipants: 5
};
