// ============================================
// Firebase Configuration
// Reads from environment variables (set in .env file)
// ============================================

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Validate that all required env vars are present
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID'
];

for (const envVar of requiredEnvVars) {
  if (!import.meta.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    console.error('Make sure you have a .env file with your Firebase config.');
  }
}

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
  
  // Optional: TURN server from environment variables
  ...(import.meta.env.VITE_TURN_SERVER_URL ? [{
    urls: import.meta.env.VITE_TURN_SERVER_URL,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL
  }] : [])
];
