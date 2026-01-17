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
const ROOM_EXPIRY_HOURS = 24;
const APP_URL = 'https://ldlswatchparty.netlify.app';

// ============================================
// SETUP & TEST FUNCTIONS
// ============================================

/**
 * Run this FIRST to set up the spreadsheet structure
 */
function initialize() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Create Rooms sheet
  let roomsSheet = ss.getSheetByName(ROOMS_SHEET);
  if (!roomsSheet) {
    roomsSheet = ss.insertSheet(ROOMS_SHEET);
    Logger.log('Created Rooms sheet');
  }
  
  // Set headers for Rooms
  const roomHeaders = ['Code', 'Token', 'HostEmail', 'HostName', 'PasswordHash', 'CreatedAt', 'ExpiresAt', 'Status'];
  roomsSheet.getRange(1, 1, 1, roomHeaders.length).setValues([roomHeaders]);
  roomsSheet.getRange(1, 1, 1, roomHeaders.length).setFontWeight('bold');
  roomsSheet.setFrozenRows(1);
  
  // Create Participants sheet
  let participantsSheet = ss.getSheetByName(PARTICIPANTS_SHEET);
  if (!participantsSheet) {
    participantsSheet = ss.insertSheet(PARTICIPANTS_SHEET);
    Logger.log('Created Participants sheet');
  }
  
  // Set headers for Participants
  const participantHeaders = ['RoomCode', 'Email', 'Name', 'JoinedAt'];
  participantsSheet.getRange(1, 1, 1, participantHeaders.length).setValues([participantHeaders]);
  participantsSheet.getRange(1, 1, 1, participantHeaders.length).setFontWeight('bold');
  participantsSheet.setFrozenRows(1);
  
  Logger.log(' Initialization complete!');
  Logger.log('Next steps:');
  Logger.log('1. Deploy > New deployment > Web app');
  Logger.log('2. Set "Who has access" to "Anyone"');
  Logger.log('3. Copy the URL to your frontend api.js file');
  
  return 'Initialization complete! Check the logs for next steps.';
}

/**
 * Test the entire flow without sending emails
 */
function testFlow() {
  Logger.log('=== TESTING WATCH PARTY FLOW ===\n');
  
  const testEmail = 'test@example.com';
  const testName = 'Test User';
  const testPassword = 'secret123';
  
  // Test 1: Create room
  Logger.log('TEST 1: Creating room...');
  const createResult = createRoomInternal(testEmail, testName, testPassword, false); // false = don't send email
  Logger.log('Result: ' + JSON.stringify(createResult));
  
  if (!createResult.success) {
    Logger.log(' Create room failed!');
    return;
  }
  Logger.log(' Room created: ' + createResult.code + '\n');
  
  const roomCode = createResult.code;
  const roomToken = createResult.token;
  
  // Test 2: Validate room
  Logger.log('TEST 2: Validating room...');
  const validateResult = validateRoom(roomCode);
  Logger.log('Result: ' + JSON.stringify(validateResult));
  Logger.log(validateResult.valid ? ' Room is valid\n' : ' Room validation failed!\n');
  
  // Test 3: Join room (wrong password)
  Logger.log('TEST 3: Joining with wrong password...');
  const joinWrongResult = joinRoomInternal(roomCode, 'guest@example.com', 'Guest', 'wrongpass', false);
  Logger.log('Result: ' + JSON.stringify(joinWrongResult));
  Logger.log(!joinWrongResult.success ? ' Correctly rejected wrong password\n' : ' Should have rejected!\n');
  
  // Test 4: Join room (correct password)
  Logger.log('TEST 4: Joining with correct password...');
  const joinResult = joinRoomInternal(roomCode, 'guest@example.com', 'Guest User', testPassword, false);
  Logger.log('Result: ' + JSON.stringify(joinResult));
  Logger.log(joinResult.success ? ' Guest joined successfully\n' : ' Join failed!\n');
  
  // Test 5: Verify access (host)
  Logger.log('TEST 5: Verifying host access...');
  const verifyHostResult = verifyAccess(roomCode, roomToken, testEmail);
  Logger.log('Result: ' + JSON.stringify(verifyHostResult));
  Logger.log(verifyHostResult.isHost ? ' Host verified correctly\n' : ' Host verification failed!\n');
  
  // Test 6: Verify access (guest)
  Logger.log('TEST 6: Verifying guest access...');
  const verifyGuestResult = verifyAccess(roomCode, roomToken, 'guest@example.com');
  Logger.log('Result: ' + JSON.stringify(verifyGuestResult));
  Logger.log(verifyGuestResult.hasAccess && !verifyGuestResult.isHost ? ' Guest verified correctly\n' : ' Guest verification failed!\n');
  
  // Test 7: Verify access (wrong token)
  Logger.log('TEST 7: Verifying with wrong token...');
  const verifyWrongResult = verifyAccess(roomCode, 'wrongtoken123', testEmail);
  Logger.log('Result: ' + JSON.stringify(verifyWrongResult));
  Logger.log(!verifyWrongResult.success ? ' Correctly rejected wrong token\n' : ' Should have rejected!\n');
  
  // Cleanup: Delete test data
  Logger.log('Cleaning up test data...');
  deleteRoom(roomCode);
  Logger.log(' Test data cleaned up\n');
  
  Logger.log('=== ALL TESTS COMPLETE ===');
}

/**
 * Test email sending (sends a real email to yourself)
 */
function testEmail() {
  const myEmail = Session.getActiveUser().getEmail();
  Logger.log('Sending test email to: ' + myEmail);
  
  sendRoomEmail(myEmail, 'Test User', 'TEST1', 'abc123xyz456', true, true);
  
  Logger.log(' Test email sent! Check your inbox.');
}

/**
 * Delete a specific room (for cleanup)
 */
function deleteRoom(code) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Delete from Rooms
  const roomsSheet = ss.getSheetByName(ROOMS_SHEET);
  const roomsData = roomsSheet.getDataRange().getValues();
  for (let i = roomsData.length - 1; i >= 1; i--) {
    if (roomsData[i][0] === code) {
      roomsSheet.deleteRow(i + 1);
    }
  }
  
  // Delete from Participants
  const participantsSheet = ss.getSheetByName(PARTICIPANTS_SHEET);
  const participantsData = participantsSheet.getDataRange().getValues();
  for (let i = participantsData.length - 1; i >= 1; i--) {
    if (participantsData[i][0] === code) {
      participantsSheet.deleteRow(i + 1);
    }
  }
}

// ============================================
// WEB APP ENTRY POINTS
// ============================================

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    const action = params.action || '';
    
    Logger.log('Request: action=' + action + ', params=' + JSON.stringify(params));
    
    let result;
    
    switch (action) {
      case 'createRoom':
        result = createRoomInternal(params.email, params.name, params.password, true);
        break;
      case 'joinRoom':
        result = joinRoomInternal(params.code, params.email, params.name, params.password, true);
        break;
      case 'validateRoom':
        result = validateRoom(params.code);
        break;
      case 'getRoomInfo':
        result = getRoomInfo(params.code);
        break;
      case 'verifyAccess':
        result = verifyAccess(params.code, params.token, params.email);
        break;
      case 'test':
        result = { success: true, message: 'API is working!', timestamp: new Date().toISOString() };
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
    
    Logger.log('Response: ' + JSON.stringify(result));
    return jsonResponse(result);
    
  } catch (error) {
    Logger.log('ERROR: ' + error.message + '\n' + error.stack);
    return jsonResponse({ success: false, error: error.message });
  }
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
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

// ============================================
// ROOM MANAGEMENT
// ============================================

function createRoomInternal(email, name, password, sendEmail) {
  // Validate
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Valid email required' };
  }
  
  const displayName = (name || '').trim() || email.split('@')[0];
  
  // Generate unique code
  let code = generateCode();
  let attempts = 0;
  while (roomExists(code) && attempts < 10) {
    code = generateCode();
    attempts++;
  }
  
  const token = generateToken();
  const passwordHash = hashPassword(password || '');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ROOM_EXPIRY_HOURS * 60 * 60 * 1000);
  
  // Save to sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ROOMS_SHEET);
  sheet.appendRow([code, token, email, displayName, passwordHash, now.toISOString(), expiresAt.toISOString(), 'active']);
  
  // Add host as participant
  addParticipant(code, email, displayName);
  
  // Send email
  if (sendEmail) {
    sendRoomEmail(email, displayName, code, token, true, !!password);
  }
  
  return { success: true, code: code, token: token, message: 'Room created! Check your email.' };
}

function joinRoomInternal(code, email, name, password, sendEmail) {
  // Validate inputs
  if (!code || (code + '').length !== 5) {
    return { success: false, error: 'Invalid room code' };
  }
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Valid email required' };
  }
  
  const normalizedCode = (code + '').toUpperCase().trim();
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
  
  // Check password
  if (room.passwordHash && room.passwordHash !== hashPassword(password || '')) {
    return { success: false, error: 'Incorrect password' };
  }
  
  const displayName = (name || '').trim() || email.split('@')[0];
  
  // Add participant
  addParticipant(normalizedCode, email, displayName);
  
  // Send email
  if (sendEmail) {
    sendRoomEmail(email, displayName, normalizedCode, room.token, false, !!room.passwordHash);
  }
  
  return { success: true, code: normalizedCode, token: room.token, message: 'Check your email!' };
}

function validateRoom(code) {
  if (!code || (code + '').length !== 5) {
    return { success: false, valid: false, error: 'Invalid room code format' };
  }
  
  const normalizedCode = (code + '').toUpperCase().trim();
  const room = getRoomByCode(normalizedCode);
  
  if (!room) {
    return { success: true, valid: false, error: 'Room not found' };
  }
  if (room.status !== 'active') {
    return { success: true, valid: false, error: 'Room inactive' };
  }
  if (new Date(room.expiresAt) < new Date()) {
    return { success: true, valid: false, error: 'Room expired' };
  }
  
  return { success: true, valid: true, hasPassword: !!room.passwordHash };
}

function getRoomInfo(code) {
  if (!code) {
    return { success: false, error: 'Room code required' };
  }
  
  const normalizedCode = (code + '').toUpperCase().trim();
  const room = getRoomByCode(normalizedCode);
  
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
  // Validate inputs
  if (!code) {
    return { success: false, error: 'Room code required' };
  }
  if (!token) {
    return { success: false, error: 'Token required' };
  }
  if (!email) {
    return { success: false, error: 'Email required' };
  }
  
  const normalizedCode = (code + '').toUpperCase().trim();
  const room = getRoomByCode(normalizedCode);
  
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  if (room.token !== token) {
    return { success: false, error: 'Invalid access link' };
  }
  if (room.status !== 'active') {
    return { success: false, error: 'Room is no longer active' };
  }
  if (new Date(room.expiresAt) < new Date()) {
    return { success: false, error: 'Room has expired' };
  }
  
  const participants = getParticipants(normalizedCode);
  const participant = participants.find(p => p.email.toLowerCase() === email.toLowerCase());
  
  if (!participant) {
    return { success: false, hasAccess: false, error: 'You are not a participant in this room' };
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
// SPREADSHEET HELPERS
// ============================================

function roomExists(code) {
  return getRoomByCode(code) !== null;
}

function getRoomByCode(code) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ROOMS_SHEET);
  
  if (!sheet) {
    Logger.log('ERROR: Rooms sheet not found! Run initialize() first.');
    return null;
  }
  
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANTS_SHEET);
  
  if (!sheet) {
    Logger.log('ERROR: Participants sheet not found! Run initialize() first.');
    return;
  }
  
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANTS_SHEET);
  
  if (!sheet) return [];
  
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
// EMAIL
// ============================================

function sendRoomEmail(email, name, code, token, isHost, hasPassword) {
  const subject = isHost ? 'Your Watch Party Room is Ready' : 'You\'re Invited to a Watch Party';
  const actionText = isHost ? 'Your room is ready. Share this code with friends:' : 'You\'ve been invited to watch together!';
  const joinUrl = APP_URL + '/' + code + '-' + token + '?email=' + encodeURIComponent(email);
  
  const htmlBody = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#111">' +
    '<table width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#111">' +
    '<tr><td align="center" style="padding:48px 24px">' +
    '<table width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:420px">' +
    '<tr><td align="center" style="padding-bottom:40px">' +
    '<table cellspacing="0" cellpadding="0" border="0"><tr>' +
    '<td style="background:#6366f1;width:44px;height:44px;border-radius:10px;text-align:center;vertical-align:middle;font-size:20px;color:#fff">&#9654;</td>' +
    '<td style="padding-left:14px;font-size:22px;font-weight:700;color:#fff">Watch Party</td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="background:#1c1c1c;border-radius:16px;border:1px solid #2a2a2a">' +
    '<table width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:40px 32px">' +
    '<p style="margin:0 0 8px;font-size:14px;color:#888;text-align:center">Hey ' + name + ',</p>' +
    '<p style="margin:0 0 32px;font-size:17px;color:#fff;text-align:center;line-height:1.6">' + actionText + '</p>' +
    '<table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:32px"><tr>' +
    '<td style="background:#111;border-radius:12px;padding:28px 24px;text-align:center;border:1px solid #333">' +
    '<p style="margin:0 0 12px;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#666;font-weight:600">Room Code</p>' +
    '<p style="margin:0;font-size:32px;font-weight:700;letter-spacing:6px;color:#818cf8;font-family:monospace">' + code + '</p>' +
    (hasPassword ? '<p style="margin:12px 0 0;font-size:11px;color:#f59e0b">Password Protected</p>' : '') +
    '</td></tr></table>' +
    '<table width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center">' +
    '<a href="' + joinUrl + '" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:14px;font-weight:600">Join Watch Party</a>' +
    '</td></tr></table>' +
    '<p style="margin:28px 0 0;font-size:12px;color:#555;text-align:center">This room expires in 24 hours</p>' +
    '</td></tr></table></td></tr>' +
    '<tr><td align="center" style="padding-top:24px">' +
    '<p style="margin:0;font-size:11px;color:#444">Powered by <a href="https://divergentbiz.com" style="color:#6366f1;text-decoration:none">Divergent Inc.</a></p>' +
    '</td></tr></table></td></tr></table></body></html>';
  
  const textBody = 'Hey ' + name + ',\n\n' + actionText + '\n\nRoom Code: ' + code + '\n\nJoin here: ' + joinUrl + '\n\nExpires in 24 hours.\n\n---\nWatch Party by Divergent Inc.';
  
  GmailApp.sendEmail(email, subject, textBody, { htmlBody: htmlBody, name: 'Watch Party' });
}

// ============================================
// CLEANUP (Run daily via trigger)
// ============================================

function cleanupExpiredRooms() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ROOMS_SHEET);
  
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  const rowsToDelete = [];
  
  for (let i = data.length - 1; i >= 1; i--) {
    const expiresAt = new Date(data[i][6]);
    if (expiresAt < now) {
      rowsToDelete.push(i + 1);
      // Also delete participants
      deleteRoom(data[i][0]);
    }
  }
  
  Logger.log('Cleaned up ' + rowsToDelete.length + ' expired rooms');
}

/**
 * Set up automatic cleanup trigger (run once)
 */
function setupCleanupTrigger() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'cleanupExpiredRooms') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create daily trigger at 3 AM
  ScriptApp.newTrigger('cleanupExpiredRooms')
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .create();
    
  Logger.log(' Daily cleanup trigger set for 3 AM');
}
