/**
 * Watch Party - Google Apps Script Backend
 * 
 * Handles room creation, email invites, and simple authentication.
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

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  APP_URL
];

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
  const origin = e.parameter.origin || '*';
  
  try {
    const action = e.parameter.action;
    let result;
    
    switch (action) {
      case 'createRoom':
        result = createRoom(e.parameter.email, e.parameter.name);
        break;
      case 'joinRoom':
        result = joinRoom(e.parameter.code, e.parameter.email, e.parameter.name);
        break;
      case 'validateRoom':
        result = validateRoom(e.parameter.code);
        break;
      case 'getRoomInfo':
        result = getRoomInfo(e.parameter.code);
        break;
      case 'verifyAccess':
        result = verifyAccess(e.parameter.code, e.parameter.email);
        break;
      default:
        result = { success: false, error: 'Unknown action' };
    }
    
    return jsonResponse(result, origin);
    
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, origin);
  }
}

function jsonResponse(data, origin) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ============================================
// Room Management
// ============================================

/**
 * Generate a random 5-character alphanumeric code
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new room and send email with code
 */
function createRoom(email, name) {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Valid email required' };
  }
  
  const displayName = name || email.split('@')[0];
  
  let code = generateRoomCode();
  while (roomExists(code)) {
    code = generateRoomCode();
  }
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ROOM_EXPIRY_HOURS * 60 * 60 * 1000);
  
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ROOMS_SHEET);
  sheet.appendRow([code, email, displayName, now.toISOString(), expiresAt.toISOString(), 'active']);
  
  addParticipant(code, email, displayName);
  sendRoomEmail(email, displayName, code, true);
  
  return { 
    success: true, 
    code: code,
    message: 'Room created! Check your email for the access link.'
  };
}

/**
 * Join an existing room
 */
function joinRoom(code, email, name) {
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
  
  const displayName = name || email.split('@')[0];
  
  addParticipant(normalizedCode, email, displayName);
  sendRoomEmail(email, displayName, normalizedCode, false);
  
  return { 
    success: true, 
    code: normalizedCode,
    message: 'Check your email for the access link!'
  };
}

/**
 * Validate if a room code exists and is active
 */
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
  
  return { success: true, valid: true };
}

/**
 * Get room info
 */
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
      status: room.status
    }
  };
}

/**
 * Verify user has access to room
 */
function verifyAccess(code, email) {
  const normalizedCode = code.toUpperCase().trim();
  const participants = getParticipants(normalizedCode);
  
  const hasAccess = participants.some(p => 
    p.email.toLowerCase() === email.toLowerCase()
  );
  
  const room = getRoomByCode(normalizedCode);
  const isHost = room && room.hostEmail.toLowerCase() === email.toLowerCase();
  
  return { 
    success: true, 
    hasAccess,
    isHost
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
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code) {
      return {
        code: data[i][0],
        hostEmail: data[i][1],
        hostName: data[i][2],
        createdAt: data[i][3],
        expiresAt: data[i][4],
        status: data[i][5]
      };
    }
  }
  return null;
}

function addParticipant(code, email, name) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PARTICIPANTS_SHEET);
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code && data[i][1].toLowerCase() === email.toLowerCase()) {
      return;
    }
  }
  
  sheet.appendRow([code, email, name, new Date().toISOString()]);
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
        joinedAt: data[i][3]
      });
    }
  }
  
  return participants;
}

// ============================================
// Email Templates
// ============================================

function sendRoomEmail(email, name, code, isHost) {
  const subject = isHost 
    ? 'Your Watch Party Room is Ready'
    : 'You\'re Invited to a Watch Party';
  
  const actionText = isHost 
    ? 'Your room is ready. Share this code with your friends:'
    : 'You\'ve been invited to watch together!';
  
  const joinUrl = APP_URL + '/?room=' + code + '&email=' + encodeURIComponent(email);
  
  const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #111111;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #111111;">
    <tr>
      <td align="center" style="padding: 48px 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 420px;">
          
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="background-color: #6366f1; width: 44px; height: 44px; border-radius: 10px; text-align: center; vertical-align: middle; font-size: 20px; color: #ffffff;">
                    &#9654;
                  </td>
                  <td style="padding-left: 14px; font-size: 22px; font-weight: 700; color: #ffffff;">
                    Watch Party
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Main Card -->
          <tr>
            <td style="background-color: #1c1c1c; border-radius: 16px; border: 1px solid #2a2a2a;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding: 40px 32px;">
                    
                    <!-- Greeting -->
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #888888; text-align: center;">
                      Hey ${name},
                    </p>
                    <p style="margin: 0 0 32px 0; font-size: 17px; color: #ffffff; text-align: center; line-height: 1.6;">
                      ${actionText}
                    </p>
                    
                    <!-- Code Box -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 32px;">
                      <tr>
                        <td style="background-color: #111111; border-radius: 12px; padding: 28px 24px; text-align: center; border: 1px solid #333333;">
                          <p style="margin: 0 0 12px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #666666; font-weight: 600;">
                            Room Code
                          </p>
                          <p style="margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #818cf8; font-family: 'Courier New', Courier, monospace;">
                            ${code}
                          </p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- CTA Button -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center">
                          <a href="${joinUrl}" style="display: inline-block; background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 14px; font-weight: 600;">
                            Join Watch Party
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Expiry -->
                    <p style="margin: 28px 0 0 0; font-size: 12px; color: #555555; text-align: center;">
                      This room expires in 24 hours
                    </p>
                    
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top: 32px;">
              <p style="margin: 0; font-size: 11px; color: #444444;">
                Powered by <a href="https://divergentbiz.com" style="color: #6366f1; text-decoration: none;">Divergent Inc.</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  
  const textBody = 'Hey ' + name + ',\n\n' + 
    actionText + '\n\n' +
    'Room Code: ' + code + '\n\n' +
    'Join here: ' + joinUrl + '\n\n' +
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
// Utility Functions
// ============================================

/**
 * Clean up expired rooms (run daily via trigger)
 */
function cleanupExpiredRooms() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ROOMS_SHEET);
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  
  const rowsToDelete = [];
  for (let i = data.length - 1; i >= 1; i--) {
    const expiresAt = new Date(data[i][4]);
    if (expiresAt < now) {
      rowsToDelete.push(i + 1);
    }
  }
  
  rowsToDelete.forEach(row => sheet.deleteRow(row));
  Logger.log('Cleaned up ' + rowsToDelete.length + ' expired rooms');
}

/**
 * Test function
 */
function testCreateRoom() {
  const result = createRoom('test@example.com', 'Test User');
  Logger.log(result);
}
