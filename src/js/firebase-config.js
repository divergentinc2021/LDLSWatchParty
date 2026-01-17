// ============================================
// Firebase Configuration
// Replace with your own Firebase project config
// ============================================

export const firebaseConfig = {
    apiKey: "AIzaSyAISgJTFkhaiIrVzmFOV_ulfc0DA5bglfk",
    authDomain: "ldls-watch-party.firebaseapp.com",
    databaseURL: "https://ldls-watch-party-default-rtdb.firebaseio.com",
    projectId: "ldls-watch-party",
    storageBucket: "ldls-watch-party.firebasestorage.app",
    messagingSenderId: "693262319561",
    appId: "1:693262319561:web:fd58eb8ccaa67f9765f218"
};

// Action code settings for email link auth
export const actionCodeSettings = {
  // URL to redirect back to after email link click
  // Update this to your deployed domain
  url: window.location.origin,
  handleCodeInApp: true
};

// STUN/TURN servers for WebRTC
export const iceServers = [
  // Google's free STUN servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  
  // Metered.ca free TURN (500MB/month)
  // Sign up at https://www.metered.ca/ and replace with your credentials
  // Uncomment if you need TURN fallback for restrictive networks
  /*
  {
    urls: 'turn:YOUR_TURN_SERVER:443',
    username: 'YOUR_USERNAME',
    credential: 'YOUR_CREDENTIAL'
  }
  */
];
