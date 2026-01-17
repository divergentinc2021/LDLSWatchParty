/**
 * Watch Party - Google Apps Script Backend
 * 
 * SETUP:
 * 1. Create a new Google Sheet
 * 2. Add two sheets named "Rooms" and "Participants"
 * 3. In "Rooms" sheet, add headers: Code | Token | HostEmail | HostName | PasswordHash | CreatedAt | ExpiresAt | Status
 * 4. In "Participants" sheet, add headers: Code | Email | Name | JoinedAt
 * 5. Go to Extensions > Apps Script
 * 6. Paste this code
 * 7. Deploy as Web App with "Anyone" access
 * 8. Copy the deployment URL to src/js/api.js
 */

const ROOMS_SHEET = 'Rooms';
const PARTICIPANTS_SHEET = 'Participants';
const ROOM_EXPIRY_HOURS = 24;
const APP_URL = 'https://ldlswatchparty.netlify.app';

// ============================================
// Web App Entry Points
// ============================================

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const action = e.parameter.action;
    let result;
    
    switch (action) {
      case 'createRoom':
        result = createRoom(e.parameter.email, e.parameter.name, e.parameter.password);
        break;
      case 'joinRoom':
        result = joinRoom(e.parameter.code, e.parameter.email, e.parameter.name, e.parameter.password);
        break;
      case 'validateRoom':
        result = validateRoom(e.parameter.code);
        break;
      case 'getRoomInfo':
        result = getRoomInfo(e.parameter.code);
        break;
      case 'verifyAccess':
        result = verifyAccess(e.parameter.code, e.parameter.token, e.parameter.email);
        break;
      default:
        result = { success: false, error: 'Unknown action' };
    }
    
    return jsonResponse(result);
  } catch (error) {
    Logger.log('Error: ' + error.message);
    return jsonResponse({ success: false, error: error.message });
  }
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ============================================
// Helper Functions
// ============================================

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateToken() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function hashPassword(password) {
  if (!password) return '';
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return hash.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// ============================================
// Room Management
// ============================================

function createRoom(email, name, password) {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Valid email required' };
  }
  
  const displayName = name || email.split('@')[0];
  
  // Generate unique room code
  let code = generateCode();
  while (roomExists(code)) {
    code = generateCode();
  }
  
  const token = generateToken();
  const passwordHash = hashPassword(password || '');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ROOM_EXPIRY_HOURS * 60 * 60 * 1000);
  
  // Save room to sheet
  const sheet = getSpreadsheet().getSheetByName(ROOMS_SHEET);
  sheet.appendRow([
    code,
    token,
    email,
    displayName,
    passwordHash,
    now.toISOString(),
    expiresAt.toISOString(),
    'active'
  ]);
  
  // Add host as first participant
  addParticipant(code, email, displayName);
  
  // Send email to host
  sendRoomEmail(email, displayName, code, token, true, !!password);
  
  return {
    success: true,
    code: code,
    token: token,
    message: 'Room created! Check your email.'
  };
}

function joinRoom(code, email, name, password) {
  if (!code || code.length !== 5) {
    return { success: false, error: 'Invalid room code' };
  }
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Valid email required' };
  }
  
  const normalizedCode = code.toUpperCase().trim();
  const room = getRoomByCode(normalizedCode);
  
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  if (room.status !== 'active') {
    return { success: false, error: 'Room is no longer active' };
  }
  if (new Date(room.expiresAt) < new Date()) {
    return { success: false, error: 'Room has expired' };
  }
  
  // Check password if room has one
  if (room.passwordHash && room.passwordHash !== hashPassword(password || '')) {
    return { success: false, error: 'Incorrect password' };
  }
  
  const displayName = name || email.split('@')[0];
  
  // Add participant
  addParticipant(normalizedCode, email, displayName);
  
  // Send email with link
  sendRoomEmail(email, displayName, normalizedCode, room.token, false, !!room.passwordHash);
  
  return {
    success: true,
    code: normalizedCode,
    token: room.token,
    message: 'Check your email!'
  };
}

function validateRoom(code) {
  if (!code || code.length !== 5) {
    return { success: false, valid: false, error: 'Invalid code format' };
  }
  
  const room = getRoomByCode(code.toUpperCase().trim());
  
  if (!room) {
    return { success: true, valid: false, error: 'Room not found' };
  }
  if (room.status !== 'active') {
    return { success: true, valid: false, error: 'Room inactive' };
  }
  if (new Date(room.expiresAt) < new Date()) {
    return { success: true, valid: false, error: 'Room expired' };
  }
  
  return {
    success: true,
    valid: true,
    hasPassword: !!room.passwordHash
  };
}

function getRoomInfo(code) {
  const room = getRoomByCode(code.toUpperCase().trim());
  
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  
  return {
    success: true,
    room: {
      code: room.code,
      hostName: room.hostName,
      hasPassword: !!room.passwordHash
    }
  };
}

function verifyAccess(code, token, email) {
  const normalizedCode = code.toUpperCase().trim();
  const room = getRoomByCode(normalizedCode);
  
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  
  if (room.token !== token) {
    return { success: false, error: 'Invalid access link' };
  }
  
  // Check if user is a participant
  const participants = getParticipants(normalizedCode);
  const participant = participants.find(function(p) {
    return p.email.toLowerCase() === email.toLowerCase();
  });
  
  if (!participant) {
    return { success: false, hasAccess: false, error: 'Not a participant' };
  }
  
  const isHost = room.hostEmail.toLowerCase() === email.toLowerCase();
  
  return {
    success: true,
    hasAccess: true,
    isHost: isHost,
    name: participant.name,
    hasPassword: !!room.passwordHash
  };
}

// ============================================
// Spreadsheet Helpers
// ============================================

function roomExists(code) {
  return getRoomByCode(code) !== null;
}

function getRoomByCode(code) {
  const sheet = getSpreadsheet().getSheetByName(ROOMS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      return {
        code: data[i][0],
        token: data[i][1],
        hostEmail: data[i][2],
        hostName: data[i][3],
        passwordHash: data[i][4],
        createdAt: data[i][5],
        expiresAt: data[i][6],
        status: data[i][7]
      };
    }
  }
  return null;
}

function addParticipant(code, email, name) {
  const sheet = getSpreadsheet().getSheetByName(PARTICIPANTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  // Check if already exists
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code && data[i][1].toLowerCase() === email.toLowerCase()) {
      return; // Already a participant
    }
  }
  
  sheet.appendRow([code, email, name, new Date().toISOString()]);
}

function getParticipants(code) {
  const sheet = getSpreadsheet().getSheetByName(PARTICIPANTS_SHEET);
  const data = sheet.getDataRange().getValues();
  const participants = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      participants.push({
        email: data[i][1],
        name: data[i][2],
        joinedAt: data[i][3]
      });
    }
  }
  return participants;
}

// ============================================
// Email
// ============================================

function sendRoomEmail(email, name, code, token, isHost, hasPassword) {
  const subject = isHost ? 'Your Watch Party Room is Ready' : "You're Invited to a Watch Party";
  const actionText = isHost
    ? 'Your room is ready. Share this code with friends:'
    : "You've been invited to watch together!";
  
  const joinUrl = APP_URL + '/' + code + '-' + token + '?email=' + encodeURIComponent(email);
  
  const htmlBody = '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#111111">' +
    '<table width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#111111">' +
    '<tr><td align="center" style="padding:48px 24px">' +
    '<table width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:420px">' +
    
    // Logo
    '<tr><td align="center" style="padding-bottom:40px">' +
    '<table cellspacing="0" cellpadding="0" border="0">' +
    '<tr>' +
    '<td style="background:#6366f1;width:44px;height:44px;border-radius:10px;text-align:center;vertical-align:middle;font-size:20px;color:#ffffff">&#9654;</td>' +
    '<td style="padding-left:14px;font-size:22px;font-weight:700;color:#ffffff">Watch Party</td>' +
    '</tr>' +
    '</table>' +
    '</td></tr>' +
    
    // Card
    '<tr><td style="background:#1c1c1c;border-radius:16px;border:1px solid #2a2a2a">' +
    '<table width="100%" cellspacing="0" cellpadding="0" border="0">' +
    '<tr><td style="padding:40px 32px">' +
    
    // Greeting
    '<p style="margin:0 0 8px;font-size:14px;color:#888888;text-align:center">Hey ' + name + ',</p>' +
    '<p style="margin:0 0 32px;font-size:17px;color:#ffffff;text-align:center;line-height:1.6">' + actionText + '</p>' +
    
    // Room Code Box
    '<table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:32px">' +
    '<tr><td style="background:#111111;border-radius:12px;padding:28px 24px;text-align:center;border:1px solid #333333">' +
    '<p style="margin:0 0 12px;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#666666;font-weight:600">Room Code</p>' +
    '<p style="margin:0;font-size:32px;font-weight:700;letter-spacing:6px;color:#818cf8;font-family:monospace">' + code + '</p>' +
    (hasPassword ? '<p style="margin:12px 0 0;font-size:11px;color:#f59e0b">Password Protected</p>' : '') +
    '</td></tr></table>' +
    
    // Join Button
    '<table width="100%" cellspacing="0" cellpadding="0" border="0">' +
    '<tr><td align="center">' +
    '<a href="' + joinUrl + '" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:14px;font-weight:600">Join Watch Party</a>' +
    '</td></tr></table>' +
    
    // Expiry note
    '<p style="margin:28px 0 0;font-size:12px;color:#555555;text-align:center">This room expires in 24 hours</p>' +
    
    '</td></tr></table>' +
    '</td></tr>' +
    
    // Footer
    '<tr><td align="center" style="padding-top:24px">' +
    '<p style="margin:0;font-size:11px;color:#444444">Powered by <a href="https://divergentbiz.com" style="color:#6366f1;text-decoration:none">Divergent Inc.</a></p>' +
    '</td></tr>' +
    
    '</table></td></tr></table>' +
    '</body></html>';
  
  const textBody = 'Hey ' + name + ',\n\n' +
    actionText + '\n\n' +
    'Room Code: ' + code + '\n\n' +
    'Join here: ' + joinUrl + '\n\n' +
    'This room expires in 24 hours.\n\n' +
    '---\nWatch Party by Divergent Inc.';
  
  GmailApp.sendEmail(email, subject, textBody, {
    htmlBody: htmlBody,
    name: 'Watch Party'
  });
}

// ============================================
// Scheduled Cleanup
// ============================================

function cleanupExpiredRooms() {
  const sheet = getSpreadsheet().getSheetByName(ROOMS_SHEET);
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  const rowsToDelete = [];
  
  for (let i = data.length - 1; i >= 1; i--) {
    if (new Date(data[i][6]) < now) {
      rowsToDelete.push(i + 1);
    }
  }
  
  rowsToDelete.forEach(function(row) {
    sheet.deleteRow(row);
  });
  
  Logger.log('Cleaned up ' + rowsToDelete.length + ' expired rooms');
}

// To set up cleanup trigger, run this once:
function setupCleanupTrigger() {
  ScriptApp.newTrigger('cleanupExpiredRooms')
    .timeBased()
    .everyHours(6)
    .create();
}
