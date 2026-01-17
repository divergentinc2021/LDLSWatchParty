// ============================================
// Authentication Module
// Handles email link (passwordless) auth
// ============================================

import { 
  getAuth, 
  sendSignInLinkToEmail, 
  isSignInWithEmailLink, 
  signInWithEmailLink,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { actionCodeSettings } from './firebase-config.js';

let auth;
let currentUser = null;
let authCallbacks = [];
let authReady = false;
let authReadyPromise = null;
let authReadyResolve = null;

/**
 * Initialize auth and return a promise that resolves when auth is ready
 */
export function initAuth(firebaseApp) {
  auth = getAuth(firebaseApp);
  
  // Create a promise that resolves when auth state is first determined
  authReadyPromise = new Promise((resolve) => {
    authReadyResolve = resolve;
  });
  
  // Listen for auth state changes
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    currentUser = user;
    console.log('Auth state changed:', user ? user.email : 'signed out');
    
    // First time auth state is determined, mark as ready
    if (!authReady) {
      authReady = true;
      authReadyResolve();
      console.log('Auth is ready');
    }
    
    authCallbacks.forEach(cb => cb(user));
  });
  
  return auth;
}

/**
 * Wait for auth to be ready
 */
export async function waitForAuthReady() {
  if (authReady) return;
  await authReadyPromise;
}

export function onAuthChange(callback) {
  authCallbacks.push(callback);
  // Immediately call with current state if auth is ready
  if (authReady) {
    callback(currentUser);
  }
}

export function getUser() {
  return currentUser;
}

export function getUserEmail() {
  return currentUser?.email || null;
}

export function getUserDisplayName() {
  if (!currentUser) return 'Guest';
  // Use email prefix as display name
  return currentUser.email?.split('@')[0] || 'Guest';
}

/**
 * Send sign-in link to email
 * Stores pending room info in localStorage for retrieval after redirect
 */
export async function sendAuthLink(email, roomCode = null, isHost = false) {
  // Make sure auth is ready
  await waitForAuthReady();
  
  // Store email for retrieval after redirect
  window.localStorage.setItem('emailForSignIn', email);
  
  // Always store isHost flag
  window.localStorage.setItem('pendingIsHost', isHost ? 'true' : 'false');
  
  // Store room context if joining existing room
  if (roomCode) {
    window.localStorage.setItem('pendingRoomCode', roomCode);
  } else {
    // Clear any stale room code
    window.localStorage.removeItem('pendingRoomCode');
  }
  
  // Build the URL with room context
  let redirectUrl = actionCodeSettings.url;
  
  // Always include host parameter, include room if joining
  const params = new URLSearchParams();
  params.set('host', isHost.toString());
  if (roomCode) {
    params.set('room', roomCode);
  }
  redirectUrl += '?' + params.toString();
  
  console.log('Sending auth link with redirect:', redirectUrl);
  console.log('isHost:', isHost, 'roomCode:', roomCode);
  
  const settings = {
    ...actionCodeSettings,
    url: redirectUrl
  };
  
  await sendSignInLinkToEmail(auth, email, settings);
}

/**
 * Check if current URL is a sign-in link (must be called after auth is ready)
 */
export function hasPendingAuth() {
  if (!auth) {
    console.warn('hasPendingAuth called before auth initialized');
    return false;
  }
  
  try {
    const isPending = isSignInWithEmailLink(auth, window.location.href);
    console.log('hasPendingAuth:', isPending);
    return isPending;
  } catch (err) {
    console.error('Error checking pending auth:', err);
    return false;
  }
}

/**
 * Check if current URL is a sign-in link and complete auth
 */
export async function handleEmailLinkRedirect() {
  // Make sure auth is ready
  await waitForAuthReady();
  
  const url = window.location.href;
  
  console.log('Checking for email link redirect:', url);
  
  if (!isSignInWithEmailLink(auth, url)) {
    console.log('Not an email sign-in link');
    return null;
  }
  
  console.log('Email sign-in link detected');
  
  // Get email from localStorage
  let email = window.localStorage.getItem('emailForSignIn');
  
  if (!email) {
    // Edge case: user opened link on different device
    throw new Error('Please use the same device/browser where you requested the link');
  }
  
  console.log('Signing in with email:', email);
  
  // Complete sign in
  const result = await signInWithEmailLink(auth, email, url);
  
  console.log('Sign in successful:', result.user.email);
  
  // Clean up email
  window.localStorage.removeItem('emailForSignIn');
  
  // Get pending room info from localStorage
  const storedRoomCode = window.localStorage.getItem('pendingRoomCode');
  const storedIsHost = window.localStorage.getItem('pendingIsHost') === 'true';
  
  // Also check URL params (more reliable)
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoom = urlParams.get('room');
  const urlHost = urlParams.get('host') === 'true';
  
  console.log('Stored values - roomCode:', storedRoomCode, 'isHost:', storedIsHost);
  console.log('URL values - room:', urlRoom, 'host:', urlHost);
  
  // Clean up localStorage
  window.localStorage.removeItem('pendingRoomCode');
  window.localStorage.removeItem('pendingIsHost');
  
  // Clean up URL
  window.history.replaceState({}, document.title, window.location.pathname);
  
  // Prefer URL params over localStorage
  const finalRoomCode = urlRoom || storedRoomCode || null;
  const finalIsHost = urlHost || storedIsHost;
  
  console.log('Final values - roomCode:', finalRoomCode, 'isHost:', finalIsHost);
  
  return {
    user: result.user,
    roomCode: finalRoomCode,
    isHost: finalIsHost
  };
}

/**
 * Sign out current user
 */
export async function logout() {
  await signOut(auth);
  currentUser = null;
}
