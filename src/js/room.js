// ============================================
// Room Module
// Handles room creation, joining, and invites
// ============================================

import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  deleteDoc
} from 'firebase/firestore';

let db;
let currentRoom = null;
let roomUnsubscribe = null;
let participantsUnsubscribe = null;

export function initRoom(firebaseApp) {
  db = getFirestore(firebaseApp);
}

/**
 * Generate a random 5-character alphanumeric code
 */
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (I,O,0,1)
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new room
 */
export async function createRoom(hostEmail, hostId) {
  const code = generateRoomCode();
  const roomRef = doc(db, 'rooms', code);
  
  // Check if code already exists (unlikely but possible)
  const existing = await getDoc(roomRef);
  if (existing.exists()) {
    // Recursively try again
    return createRoom(hostEmail, hostId);
  }
  
  const roomData = {
    code,
    hostId,
    hostEmail,
    createdAt: serverTimestamp(),
    status: 'active'
  };
  
  await setDoc(roomRef, roomData);
  
  // Also create invite entry for easy lookup
  await setDoc(doc(db, 'invites', code), {
    roomCode: code,
    hostEmail,
    createdAt: serverTimestamp()
  });
  
  currentRoom = { code, isHost: true, ...roomData };
  
  return currentRoom;
}

/**
 * Join an existing room by code
 */
export async function joinRoom(code, userEmail, userId) {
  const normalizedCode = code.toUpperCase().trim();
  const roomRef = doc(db, 'rooms', normalizedCode);
  
  const roomSnap = await getDoc(roomRef);
  
  if (!roomSnap.exists()) {
    throw new Error('Room not found. Check your code and try again.');
  }
  
  const roomData = roomSnap.data();
  
  if (roomData.status !== 'active') {
    throw new Error('This room is no longer active.');
  }
  
  const isHost = roomData.hostId === userId;
  
  currentRoom = {
    code: normalizedCode,
    isHost,
    ...roomData
  };
  
  return currentRoom;
}

/**
 * Check if a room code is valid
 */
export async function validateRoomCode(code) {
  const normalizedCode = code.toUpperCase().trim();
  const inviteRef = doc(db, 'invites', normalizedCode);
  const inviteSnap = await getDoc(inviteRef);
  return inviteSnap.exists();
}

/**
 * Add participant to room
 */
export async function addParticipant(roomCode, participantId, participantEmail) {
  const participantRef = doc(db, 'rooms', roomCode, 'participants', participantId);
  
  await setDoc(participantRef, {
    odId: participantId,
    email: participantEmail,
    displayName: participantEmail.split('@')[0],
    joinedAt: serverTimestamp(),
    isOnline: true
  });
}

/**
 * Remove participant from room
 */
export async function removeParticipant(roomCode, participantId) {
  const participantRef = doc(db, 'rooms', roomCode, 'participants', participantId);
  await deleteDoc(participantRef);
}

/**
 * Update participant status
 */
export async function updateParticipantStatus(roomCode, participantId, isOnline) {
  const participantRef = doc(db, 'rooms', roomCode, 'participants', participantId);
  await updateDoc(participantRef, { isOnline });
}

/**
 * Listen to room changes
 */
export function subscribeToRoom(roomCode, callback) {
  const roomRef = doc(db, 'rooms', roomCode);
  
  roomUnsubscribe = onSnapshot(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data());
    }
  });
  
  return roomUnsubscribe;
}

/**
 * Listen to participants changes
 */
export function subscribeToParticipants(roomCode, callback) {
  const participantsRef = collection(db, 'rooms', roomCode, 'participants');
  
  participantsUnsubscribe = onSnapshot(participantsRef, (snapshot) => {
    const participants = [];
    snapshot.forEach(doc => {
      participants.push({ id: doc.id, ...doc.data() });
    });
    callback(participants);
  });
  
  return participantsUnsubscribe;
}

/**
 * Clean up subscriptions
 */
export function unsubscribeFromRoom() {
  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }
  if (participantsUnsubscribe) {
    participantsUnsubscribe();
    participantsUnsubscribe = null;
  }
}

/**
 * Get current room
 */
export function getCurrentRoom() {
  return currentRoom;
}

/**
 * Leave room (cleanup)
 */
export async function leaveRoom(roomCode, participantId) {
  await removeParticipant(roomCode, participantId);
  unsubscribeFromRoom();
  currentRoom = null;
}

/**
 * Send email invite (opens mailto: link)
 * For a production app, you'd use Firebase Functions or a service like SendGrid
 */
export function sendEmailInvite(recipientEmail, roomCode, senderName) {
  const subject = encodeURIComponent(`${senderName} invited you to Watch Party`);
  const body = encodeURIComponent(
    `${senderName} wants to watch something with you!\n\n` +
    `Join the watch party:\n` +
    `${window.location.origin}?room=${roomCode}\n\n` +
    `Or enter this code: ${roomCode}`
  );
  
  window.open(`mailto:${recipientEmail}?subject=${subject}&body=${body}`, '_blank');
}
