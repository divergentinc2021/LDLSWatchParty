/**
 * Watch Party - Google Apps Script Backend
 * 
 * SETUP:
 * 1. Run initialize() first to create sheets
 * 2. Deploy as Web App with "Anyone" access
 * 3. Copy the deployment URL to src/js/api.js
 */

const ROOMS_SHEET = 'Rooms';
const PARTICIPANTS_SHEET = 'Participants';
const ACTIVE_PEERS_SHEET = 'ActivePeers';
const ROOM_EXPIRY_HOURS = 24;
const PEER_TIMEOUT_SECONDS = 60;
const APP_URL = 'https://ldlswatchparty.pages.dev';

// ============================================
// SETUP
// ============================================

function initialize() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Rooms sheet
  let roomsSheet = ss.getSheetByName(ROOMS_SHEET);
  if (!roomsSheet) roomsSheet = ss.insertSheet(ROOMS_SHEET);
  const roomHeaders = ['Code', 'Token', 'HostEmail', 'HostName', 'PasswordHash', 'CreatedAt', 'ExpiresAt', 'Status'];
  roomsSheet.getRange(1, 1, 1, roomHeaders.length).setValues([roomHeaders]).setFontWeight('bold');
  roomsSheet.setFrozenRows(1);
  
  // Participants sheet
  let participantsSheet = ss.getSheetByName(PARTICIPANTS_SHEET);
  if (!participantsSheet) participantsSheet = ss.insertSheet(PARTICIPANTS_SHEET);
  const participantHeaders = ['RoomCode', 'Email', 'Name', 'JoinedAt'];
  participantsSheet.getRange(1, 1, 1, participantHeaders.length).setValues([participantHeaders]).setFontWeight('bold');
  participantsSheet.setFrozenRows(1);
  
  // ActivePeers sheet (real-time peer tracking)
  let activePeersSheet = ss.getSheetByName(ACTIVE_PEERS_SHEET);
  if (!activePeersSheet) activePeersSheet = ss.insertSheet(ACTIVE_PEERS_SHEET);
  const peerHeaders = ['RoomCode', 'PeerId', 'Name', 'IsHost', 'LastSeen'];
  activePeersSheet.getRange(1, 1, 1, peerHeaders.length).setValues([peerHeaders]).setFontWeight('bold');
  activePeersSheet.setFrozenRows(1);
  
  Logger.log('✅ Initialization complete! Sheets: Rooms, Participants, ActivePeers');
  return 'Done! Now deploy as Web App with "Anyone" access.';
}

// ============================================
// WEB APP
// ============================================

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const p = e.parameter || {};
    let result;
    
    switch (p.action) {
      // Room management
      case 'createRoom': result = createRoomInternal(p.email, p.name, p.password, true); break;
      case 'joinRoom': result = joinRoomInternal(p.code, p.email, p.name, p.password, true); break;
      case 'validateRoom': result = validateRoom(p.code); break;
      case 'getRoomInfo': result = getRoomInfo(p.code); break;
      case 'verifyAccess': result = verifyAccess(p.code, p.token, p.email); break;
      
      // Peer discovery (critical for WebRTC connections!)
      case 'registerPeer': result = registerPeer(p.code, p.peerId, p.name, p.isHost === 'true'); break;
      case 'getActivePeers': result = getActivePeers(p.code); break;
      case 'heartbeat': result = peerHeartbeat(p.code, p.peerId); break;
      case 'unregisterPeer': result = unregisterPeer(p.code, p.peerId); break;
      
      // Stats
      case 'getActiveSessionCount': result = getActiveSessionCount(); break;
      
      case 'test': result = { success: true, message: 'API working!', time: new Date().toISOString() }; break;
      default: result = { success: false, error: 'Unknown action: ' + (p.action || 'none') };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('ERROR: ' + err.message);
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// PEER DISCOVERY - This is what enables participants to find each other!
// ============================================

/**
 * Register a peer as active in a room
 * Called when someone enters the room
 */
function registerPeer(code, peerId, name, isHost) {
  if (!code || !peerId) return { success: false, error: 'Code and peerId required' };
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ACTIVE_PEERS_SHEET);
  if (!sheet) return { success: false, error: 'Run initialize() first' };
  
  const normalizedCode = (code + '').toUpperCase().trim();
  const now = new Date().toISOString();
  const data = sheet.getDataRange().getValues();
  
  // Update if peer already exists
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === normalizedCode && data[i][1] === peerId) {
      sheet.getRange(i + 1, 5).setValue(now); // Update LastSeen
      Logger.log('Updated peer: ' + peerId);
      return { success: true, updated: true };
    }
  }
  
  // Add new peer
  sheet.appendRow([normalizedCode, peerId, name || 'Guest', isHost ? 'true' : 'false', now]);
  Logger.log('Registered new peer: ' + peerId + ' in room ' + normalizedCode);
  return { success: true, registered: true };
}

/**
 * Get all active peers in a room
 * This is how participants discover each other!
 */
function getActivePeers(code) {
  if (!code) return { success: false, peers: [] };
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ACTIVE_PEERS_SHEET);
  if (!sheet) return { success: true, peers: [] };
  
  const normalizedCode = (code + '').toUpperCase().trim();
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  const peers = [];
  const staleRows = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === normalizedCode) {
      const lastSeen = new Date(data[i][4]);
      const ageSeconds = (now - lastSeen) / 1000;
      
      if (ageSeconds < PEER_TIMEOUT_SECONDS) {
        peers.push({ 
          peerId: data[i][1], 
          name: data[i][2], 
          isHost: data[i][3] === 'true' 
        });
      } else {
        staleRows.push(i + 1); // Mark for cleanup
      }
    }
  }
  
  // Cleanup stale peers (in reverse order to maintain row indices)
  for (let i = staleRows.length - 1; i >= 0; i--) {
    sheet.deleteRow(staleRows[i]);
  }
  
  Logger.log('Active peers in ' + normalizedCode + ': ' + peers.length);
  return { success: true, peers: peers };
}

/**
 * Heartbeat - keeps a peer registered as active
 * Should be called every ~25 seconds
 */
function peerHeartbeat(code, peerId) {
  if (!code || !peerId) return { success: false };
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ACTIVE_PEERS_SHEET);
  if (!sheet) return { success: false };
  
  const normalizedCode = (code + '').toUpperCase().trim();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === normalizedCode && data[i][1] === peerId) {
      sheet.getRange(i + 1, 5).setValue(new Date().toISOString());
      return { success: true };
    }
  }
  
  // Peer not found - re-register
  return { success: false, error: 'Peer not found, re-register' };
}

/**
 * Unregister a peer when they leave
 */
function unregisterPeer(code, peerId) {
  if (!code || !peerId) return { success: true };
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ACTIVE_PEERS_SHEET);
  if (!sheet) return { success: true };
  
  const normalizedCode = (code + '').toUpperCase().trim();
  const data = sheet.getDataRange().getValues();
  
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === normalizedCode && data[i][1] === peerId) {
      sheet.deleteRow(i + 1);
      Logger.log('Unregistered peer: ' + peerId);
    }
  }
  return { success: true };
}

/**
 * Get count of rooms with active peers (for landing page)
 */
function getActiveSessionCount() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ACTIVE_PEERS_SHEET);
  if (!sheet) return { success: true, count: 0, rooms: [] };
  
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  const activeRooms = new Map();
  
  for (let i = 1; i < data.length; i++) {
    const lastSeen = new Date(data[i][4]);
    const ageSeconds = (now - lastSeen) / 1000;
    
    if (ageSeconds < PEER_TIMEOUT_SECONDS) {
      const roomCode = data[i][0];
      if (!activeRooms.has(roomCode)) {
        activeRooms.set(roomCode, { code: roomCode, peerCount: 0 });
      }
      activeRooms.get(roomCode).peerCount++;
    }
  }
  
  const rooms = Array.from(activeRooms.values());
  return { success: true, count: rooms.length, rooms: rooms };
}

// ============================================
// HELPERS
// ============================================

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function generateToken() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 12; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

function hashPassword(password) {
  if (!password) return '';
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password)
    .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function roomExists(code) { return getRoomByCode(code) !== null; }

function getRoomByCode(code) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ROOMS_SHEET);
  if (!sheet) return null;
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      return { code: data[i][0], token: data[i][1], hostEmail: data[i][2], hostName: data[i][3],
        passwordHash: data[i][4], createdAt: data[i][5], expiresAt: data[i][6], status: data[i][7] };
    }
  }
  return null;
}

function addParticipant(code, email, name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANTS_SHEET);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code && data[i][1].toLowerCase() === email.toLowerCase()) return;
  }
  sheet.appendRow([code, email, name, new Date().toISOString()]);
}

function getParticipants(code) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANTS_SHEET);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const participants = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code) participants.push({ email: data[i][1], name: data[i][2] });
  }
  return participants;
}

// ============================================
// ROOM MANAGEMENT
// ============================================

function createRoomInternal(email, name, password, sendEmail) {
  if (!email || !email.includes('@')) return { success: false, error: 'Valid email required' };
  
  const displayName = (name || '').trim() || email.split('@')[0];
  let code = generateCode();
  while (roomExists(code)) code = generateCode();
  
  const token = generateToken();
  const passwordHash = hashPassword(password || '');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ROOM_EXPIRY_HOURS * 60 * 60 * 1000);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheetByName(ROOMS_SHEET).appendRow([code, token, email, displayName, passwordHash, now.toISOString(), expiresAt.toISOString(), 'active']);
  
  addParticipant(code, email, displayName);
  if (sendEmail) sendRoomEmail(email, displayName, code, token, true, !!password);
  
  Logger.log('Created room: ' + code + ' for ' + email);
  return { success: true, code: code, token: token };
}

function joinRoomInternal(code, email, name, password, sendEmail) {
  if (!code || (code + '').length !== 5) return { success: false, error: 'Invalid room code' };
  if (!email || !email.includes('@')) return { success: false, error: 'Valid email required' };
  
  const normalizedCode = (code + '').toUpperCase().trim();
  const room = getRoomByCode(normalizedCode);
  
  if (!room) return { success: false, error: 'Room not found' };
  if (room.status !== 'active') return { success: false, error: 'Room inactive' };
  if (new Date(room.expiresAt) < new Date()) return { success: false, error: 'Room expired' };
  if (room.passwordHash && room.passwordHash !== hashPassword(password || '')) return { success: false, error: 'Incorrect password' };
  
  const displayName = (name || '').trim() || email.split('@')[0];
  addParticipant(normalizedCode, email, displayName);
  if (sendEmail) sendRoomEmail(email, displayName, normalizedCode, room.token, false, !!room.passwordHash);
  
  Logger.log('User joined room: ' + normalizedCode + ' - ' + email);
  return { success: true, code: normalizedCode, token: room.token };
}

function validateRoom(code) {
  if (!code) return { success: false, valid: false };
  const room = getRoomByCode((code + '').toUpperCase().trim());
  if (!room) return { success: true, valid: false, error: 'Room not found' };
  if (room.status !== 'active' || new Date(room.expiresAt) < new Date()) return { success: true, valid: false, error: 'Room expired' };
  return { success: true, valid: true, hasPassword: !!room.passwordHash };
}

function getRoomInfo(code) {
  if (!code) return { success: false, error: 'Code required' };
  const room = getRoomByCode((code + '').toUpperCase().trim());
  if (!room) return { success: false, error: 'Room not found' };
  return { success: true, room: { code: room.code, hostName: room.hostName, hasPassword: !!room.passwordHash }};
}

function verifyAccess(code, token, email) {
  if (!code || !token || !email) return { success: false, error: 'Missing parameters' };
  
  const normalizedCode = (code + '').toUpperCase().trim();
  const room = getRoomByCode(normalizedCode);
  
  if (!room) return { success: false, error: 'Room not found' };
  if (room.token !== token) return { success: false, error: 'Invalid link' };
  if (room.status !== 'active' || new Date(room.expiresAt) < new Date()) return { success: false, error: 'Room expired' };
  
  const participants = getParticipants(normalizedCode);
  const participant = participants.find(p => p.email.toLowerCase() === email.toLowerCase());
  if (!participant) return { success: false, error: 'Not a participant' };
  
  return { success: true, hasAccess: true, isHost: room.hostEmail.toLowerCase() === email.toLowerCase(), name: participant.name, hasPassword: !!room.passwordHash };
}

// ============================================
// EMAIL
// ============================================

function sendRoomEmail(email, name, code, token, isHost, hasPassword) {
  const subject = isHost ? 'Your Watch Party Room is Ready' : 'You\'re Invited to a Watch Party';
  const joinUrl = APP_URL + '/' + code + '-' + token + '?email=' + encodeURIComponent(email);
  
  const htmlBody = '<!DOCTYPE html><html><body style="margin:0;padding:40px;font-family:sans-serif;background:#111;color:#fff">' +
    '<div style="max-width:400px;margin:0 auto;text-align:center">' +
    '<h1 style="color:#818cf8">Watch Party</h1>' +
    '<p>Hey ' + name + '!</p>' +
    '<p>' + (isHost ? 'Your room is ready. Share the code with friends:' : 'You\'ve been invited!') + '</p>' +
    '<div style="background:#222;padding:20px;border-radius:8px;margin:20px 0">' +
    '<p style="margin:0;font-size:12px;color:#888">ROOM CODE</p>' +
    '<p style="margin:10px 0;font-size:28px;font-weight:bold;color:#818cf8;letter-spacing:4px">' + code + '</p>' +
    (hasPassword ? '<p style="color:#f59e0b;font-size:12px">🔒 Password Protected</p>' : '') +
    '</div>' +
    '<a href="' + joinUrl + '" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold">Join Watch Party</a>' +
    '<p style="margin-top:30px;font-size:12px;color:#666">Room expires in 24 hours</p>' +
    '</div></body></html>';
  
  GmailApp.sendEmail(email, subject, 'Join: ' + joinUrl, { htmlBody: htmlBody, name: 'Watch Party' });
}

// ============================================
// CLEANUP
// ============================================

function cleanupStalePeers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ACTIVE_PEERS_SHEET);
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  
  for (let i = data.length - 1; i >= 1; i--) {
    const lastSeen = new Date(data[i][4]);
    const ageSeconds = (now - lastSeen) / 1000;
    if (ageSeconds > PEER_TIMEOUT_SECONDS) {
      sheet.deleteRow(i + 1);
    }
  }
}

function cleanupExpiredRooms() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Cleanup expired rooms
  const roomsSheet = ss.getSheetByName(ROOMS_SHEET);
  if (roomsSheet) {
    const data = roomsSheet.getDataRange().getValues();
    const now = new Date();
    for (let i = data.length - 1; i >= 1; i--) {
      if (new Date(data[i][6]) < now) {
        roomsSheet.deleteRow(i + 1);
      }
    }
  }
  
  // Also cleanup stale peers
  cleanupStalePeers();
}
