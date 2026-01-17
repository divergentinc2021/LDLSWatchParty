/**
 * Watch Party - Google Apps Script Backend
 * 
 * Handles room creation, email invites, and access verification.
 * Deploy as Web App with "Anyone" access.
 */

// ============================================
// Configuration
// ============================================

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const ROOMS_SHEET = 'Rooms';
const PARTICIPANTS_SHEET = 'Participants';
const ROOM_EXPIRY_HOURS = 24;

// Your Netlify app URL
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
        result = createRoom(
          e.parameter.email, 
          e.parameter.name,
          e.parameter.password || ''
        );
        break;
      case 'joinRoom':
        result = joinRoom(
          e.parameter.code, 
          e.parameter.email, 
          e.parameter.name,
          e.parameter.password || ''
        );
        break;
      case 'validateRoom':
        result = validateRoom(e.parameter.code);
        break;
      case 'getRoomInfo':
        result = getRoomInfo(e.parameter.code);
        break;
      case 'verifyAccess':
        result = verifyAccess(
          e.parameter.code, 
          e.parameter.token,
          e.parameter.email
        );
        break;
      default:
        result = { success: false, error: 'Unknown action' };
    }
    
    return jsonResponse(result);
    
  } catch (error) {
    return jsonResponse({ success: false, error: error.message });
  }
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ============================================
// Utility Functions
// ============================================

function generateRoomCode() {
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
  for (let i = 0; i < 10; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function hashPassword(password) {
  if (!password) return '';
  // Simple hash for comparison
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// ============================================
// Room Management
// ============================================

function createRoom(email, name, password) {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Valid email required' };
  }
  
  const displayName = name || email.split('@')[0];
  
  // Generate unique code and token
  let code = generateRoomCode();
  while (roomExists(code)) {
    code = generateRoomCode();
  }
  
  const token = generateToken();
  const passwordHash = hashPassword(password);
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ROOM_EXPIRY_HOURS * 60 * 60 * 1000);
  
  // Save room to spreadsheet
  // Columns: code | hostEmail | hostName | token | passwordHash | createdAt | expiresAt | status
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ROOMS_SHEET);
  sheet.appendRow([
    code, 
    email, 
    displayName, 
    token,
    passwordHash,
    now.toISOString(), 
    expiresAt.toISOString(), 
    'active'
  ]);
  
  // Add host as participant
  addParticipant(code, email, displayName, token, true);
  
  // Send email with room link
  sendRoomEmail(email, displayName, code, token, true, !!password);
  
  return { 
    success: true, 
    code: code,
    token: token,
    message: 'Room created! Check your email for the access link.'
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
  if (room.passwordHash) {
    const providedHash = hashPassword(password);
    if (providedHash !== room.passwordHash) {
      return { success: false, error: 'Incorrect password' };
    }
  }
  
  const displayName = name || email.split('@')[0];
  const participantToken = generateToken();
  
  // Add as participant
  addParticipant(normalizedCode, email, displayName, participantToken, false);
  
  // Send email with room access
  sendRoomEmail(email, displayName, normalizedCode, participantToken, false, !!room.passwordHash);
  
  return { 
    success: true, 
    code: normalizedCode,
    token: participantToken,
    message: 'Check your email for the access link!'
  };
}

function validateRoom(code) {
  if (!code || code.length !== 5) {
    return { success: false, valid: false };
  }
  
  const normalizedCode = code.toUpperCase().trim();
  const room = getRoomByCode(normalizedCode);
  
  if (!room) {
    return { success: true, valid: false, error: 'Room not found' };
  }
  
  if (room.status !== 'active') {
    return { success: true, valid: false, error: 'Room is no longer active' };
  }
  
  if (new Date(room.expiresAt) < new Date()) {
    return { success: true, valid: false, error: 'Room has expired' };
  }
  
  return { 
    success: true, 
    valid: true,
    hasPassword: !!room.passwordHash
  };
}

function getRoomInfo(code) {
  const normalizedCode = code.toUpperCase().trim();
  const room = getRoomByCode(normalizedCode);
  
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  
  return { 
    success: true, 
    room: {
      code: room.code,
      hostName: room.hostName,
      createdAt: room.createdAt,
      status: room.status,
      hasPassword: !!room.passwordHash
    }
  };
}

function verifyAccess(code, token, email) {
  const normalizedCode = code.toUpperCase().trim();
  const participant = getParticipantByToken(normalizedCode, token);
  
  if (!participant) {
    return { success: true, hasAccess: false, error: 'Invalid access link' };
  }
  
  // Verify email matches (case insensitive)
  if (email && participant.email.toLowerCase() !== email.toLowerCase()) {
    return { success: true, hasAccess: false, error: 'Email mismatch' };
  }
  
  const room = getRoomByCode(normalizedCode);
  
  return { 
    success: true, 
    hasAccess: true,
    isHost: participant.isHost,
    name: participant.name,
    email: participant.email
  };
}

// ============================================
// Spreadsheet Helpers
// ============================================

function roomExists(code) {
  return getRoomByCode(code) !== null;
}

function getRoomByCode(code) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ROOMS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  // Columns: code | hostEmail | hostName | token | passwordHash | createdAt | expiresAt | status
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      return {
        code: data[i][0],
        hostEmail: data[i][1],
        hostName: data[i][2],
        token: data[i][3],
        passwordHash: data[i][4],
        createdAt: data[i][5],
        expiresAt: data[i][6],
        status: data[i][7]
      };
    }
  }
  return null;
}

function addParticipant(code, email, name, token, isHost) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PARTICIPANTS_SHEET);
  
  // Check if already a participant with same email
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code && data[i][1].toLowerCase() === email.toLowerCase()) {
      // Update existing participant's token
      sheet.getRange(i + 1, 4).setValue(token);
      return;
    }
  }
  
  // Columns: code | email | name | token | isHost | joinedAt
  sheet.appendRow([code, email, name, token, isHost, new Date().toISOString()]);
}

function getParticipantByToken(code, token) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PARTICIPANTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code && data[i][3] === token) {
      return {
        email: data[i][1],
        name: data[i][2],
        token: data[i][3],
        isHost: data[i][4],
        joinedAt: data[i][5]
      };
    }
  }
  return null;
}

function getParticipants(code) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PARTICIPANTS_SHEET);
  const data = sheet.getDataRange().getValues();
  const participants = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      participants.push({
        email: data[i][1],
        name: data[i][2],
        isHost: data[i][4],
        joinedAt: data[i][5]
      });
    }
  }
  
  return participants;
}

// ============================================
// Email Templates
// ============================================

function sendRoomEmail(email, name, code, token, isHost, hasPassword) {
  const subject = isHost 
    ? 'Your Watch Party Room is Ready'
    : 'You\'re Invited to a Watch Party';
  
  const actionText = isHost 
    ? 'Your room is ready! Click below to enter as host:'
    : 'You\'ve been invited to watch together! Click below to join:';
  
  const joinUrl = APP_URL + '/' + code + '-' + token;
  
  const passwordNote = hasPassword 
    ? '<p style="margin: 16px 0 0 0; font-size: 12px; color: #888888; text-align: center;">This room is password protected</p>'
    : '';
  
  const htmlBody = '<!DOCTYPE html>' +
'<html>' +
'<head>' +
'  <meta charset="utf-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'</head>' +
'<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif; background-color: #111111;">' +
'  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #111111;">' +
'    <tr>' +
'      <td align="center" style="padding: 48px 24px;">' +
'        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 420px;">' +
'          <tr>' +
'            <td align="center" style="padding-bottom: 40px;">' +
'              <table role="presentation" cellspacing="0" cellpadding="0" border="0">' +
'                <tr>' +
'                  <td style="background-color: #6366f1; width: 44px; height: 44px; border-radius: 10px; text-align: center; vertical-align: middle; font-size: 20px; color: #ffffff;">&#9654;</td>' +
'                  <td style="padding-left: 14px; font-size: 22px; font-weight: 700; color: #ffffff;">Watch Party</td>' +
'                </tr>' +
'              </table>' +
'            </td>' +
'          </tr>' +
'          <tr>' +
'            <td style="background-color: #1c1c1c; border-radius: 16px; border: 1px solid #2a2a2a;">' +
'              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">' +
'                <tr>' +
'                  <td style="padding: 40px 32px;">' +
'                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #888888; text-align: center;">Hey ' + name + ',</p>' +
'                    <p style="margin: 0 0 32px 0; font-size: 17px; color: #ffffff; text-align: center; line-height: 1.6;">' + actionText + '</p>' +
'                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 32px;">' +
'                      <tr>' +
'                        <td style="background-color: #111111; border-radius: 12px; padding: 28px 24px; text-align: center; border: 1px solid #333333;">' +
'                          <p style="margin: 0 0 12px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #666666; font-weight: 600;">Room Code</p>' +
'                          <p style="margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #818cf8; font-family: \'Courier New\', Courier, monospace;">' + code + '</p>' +
'                        </td>' +
'                      </tr>' +
'                    </table>' +
'                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">' +
'                      <tr>' +
'                        <td align="center">' +
'                          <a href="' + joinUrl + '" style="display: inline-block; background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 14px; font-weight: 600;">' + (isHost ? 'Enter as Host' : 'Join Watch Party') + '</a>' +
'                        </td>' +
'                      </tr>' +
'                    </table>' +
                    passwordNote +
'                    <p style="margin: 28px 0 0 0; font-size: 12px; color: #555555; text-align: center;">This room expires in 24 hours</p>' +
'                  </td>' +
'                </tr>' +
'              </table>' +
'            </td>' +
'          </tr>' +
'          <tr>' +
'            <td align="center" style="padding-top: 32px;">' +
'              <p style="margin: 0; font-size: 11px; color: #444444;">Powered by <a href="https://divergentbiz.com" style="color: #6366f1; text-decoration: none;">Divergent Inc.</a></p>' +
'            </td>' +
'          </tr>' +
'        </table>' +
'      </td>' +
'    </tr>' +
'  </table>' +
'</body>' +
'</html>';
  
  const textBody = 'Hey ' + name + ',\n\n' + 
    actionText + '\n\n' +
    'Room Code: ' + code + '\n\n' +
    'Join here: ' + joinUrl + '\n\n' +
    (hasPassword ? 'This room is password protected.\n\n' : '') +
    'This room expires in 24 hours.\n\n' +
    '---\n' +
    'Watch Party by Divergent Inc.\n' +
    'https://divergentbiz.com';
  
  GmailApp.sendEmail(email, subject, textBody, {
    htmlBody: htmlBody,
    name: 'Watch Party'
  });
}

// ============================================
// Cleanup
// ============================================

function cleanupExpiredRooms() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ROOMS_SHEET);
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  
  const rowsToDelete = [];
  for (let i = data.length - 1; i >= 1; i--) {
    const expiresAt = new Date(data[i][6]);
    if (expiresAt < now) {
      rowsToDelete.push(i + 1);
    }
  }
  
  rowsToDelete.forEach(row => sheet.deleteRow(row));
  Logger.log('Cleaned up ' + rowsToDelete.length + ' expired rooms');
}

function testCreateRoom() {
  const result = createRoom('test@example.com', 'Test User', 'secret123');
  Logger.log(result);
}
