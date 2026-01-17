// ============================================
// Chat Module
// Handles real-time chat messages via Firestore
// ============================================

import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';

let db;
let chatUnsubscribe = null;

export function initChat(firebaseApp) {
  db = getFirestore(firebaseApp);
}

/**
 * Send a chat message
 */
export async function sendMessage(roomCode, userId, displayName, text) {
  if (!text.trim()) return;
  
  const messagesRef = collection(db, 'rooms', roomCode, 'messages');
  
  await addDoc(messagesRef, {
    userId,
    displayName,
    text: text.trim(),
    timestamp: serverTimestamp(),
    type: 'user'
  });
}

/**
 * Send a system message (join/leave notifications)
 */
export async function sendSystemMessage(roomCode, text) {
  const messagesRef = collection(db, 'rooms', roomCode, 'messages');
  
  await addDoc(messagesRef, {
    text,
    timestamp: serverTimestamp(),
    type: 'system'
  });
}

/**
 * Subscribe to chat messages
 */
export function subscribeToChat(roomCode, callback) {
  const messagesRef = collection(db, 'rooms', roomCode, 'messages');
  const messagesQuery = query(
    messagesRef, 
    orderBy('timestamp', 'asc'),
    limit(100) // Last 100 messages
  );
  
  chatUnsubscribe = onSnapshot(messagesQuery, (snapshot) => {
    const messages = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        ...data,
        // Convert Firestore timestamp to Date
        timestamp: data.timestamp?.toDate() || new Date()
      });
    });
    callback(messages);
  });
  
  return chatUnsubscribe;
}

/**
 * Unsubscribe from chat
 */
export function unsubscribeFromChat() {
  if (chatUnsubscribe) {
    chatUnsubscribe();
    chatUnsubscribe = null;
  }
}

/**
 * Format timestamp for display
 */
export function formatTime(date) {
  if (!date) return '';
  return date.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}
