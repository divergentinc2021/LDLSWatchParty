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

// Allowed origins for CORS (add your Netlify domain)
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://your-app.netlify.app' // Replace with your actual domain
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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars
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
  
  // Generate unique code
  let code = generateRoomCode();
  while (roomExists(code)) {
    code = generateRoomCode();
  }
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ROOM_EXPIRY_HOURS * 60 * 60 * 1000);
  
  // Save to spreadsheet
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ROOMS_SHEET);
  sheet.appendRow([code, email, displayName, now.toISOString(), expiresAt.toISOString(), 'active']);
  
  // Add host as participant
  addParticipant(code, email, displayName);
  
  // Send email with room code
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
  
  // Add as participant
  addParticipant(normalizedCode, email, displayName);
  
  // Send email with room access
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
  
  // Check if already a participant
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code && data[i][1].toLowerCase() === email.toLowerCase()) {
      return; // Already exists
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
    ? '🎬 Your Watch Party Room is Ready!'
    : '🎬 You\'re Invited to a Watch Party!';
  
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0f; color: #ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td style="text-align: center; padding-bottom: 32px;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff;">
          🎬 Watch Party
        </h1>
      </td>
    </tr>
    <tr>
      <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 32px; text-align: center;">
        <p style="margin: 0 0 8px 0; font-size: 16px; color: #a0a0a0;">
          Hey ${name}!
        </p>
        <p style="margin: 0 0 24px 0; font-size: 18px; color: #ffffff;">
          ${isHost ? 'Your room is ready. Share this code with friends:' : 'You\'ve been invited! Use this code to join:'}
        </p>
        
        <div style="background: #0a0a0f; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #666;">
            Room Code
          </p>
          <p style="margin: 0; font-size: 42px; font-weight: 700; letter-spacing: 8px; color: #6366f1; font-family: 'SF Mono', 'Fira Code', monospace;">
            ${code}
          </p>
        </div>
        
        <a href="https://your-app.netlify.app/?room=${code}&email=${encodeURIComponent(email)}" 
           style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
          Join Watch Party →
        </a>
        
        <p style="margin: 24px 0 0 0; font-size: 13px; color: #666;">
          Room expires in 24 hours
        </p>
      </td>
    </tr>
    <tr>
      <td style="text-align: center; padding-top: 24px;">
        <p style="margin: 0; font-size: 12px; color: #444;">
          Powered by Divergent Inc.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
  
  const textBody = `
Hey ${name}!

${isHost ? 'Your Watch Party room is ready!' : 'You\'ve been invited to a Watch Party!'}

Your Room Code: ${code}

Join here: https://your-app.netlify.app/?room=${code}&email=${encodeURIComponent(email)}

Room expires in 24 hours.

- Watch Party by Divergent Inc.
  `;
  
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
  
  // Find rows to delete (from bottom up to preserve indices)
  const rowsToDelete = [];
  for (let i = data.length - 1; i >= 1; i--) {
    const expiresAt = new Date(data[i][4]);
    if (expiresAt < now) {
      rowsToDelete.push(i + 1); // 1-indexed
    }
  }
  
  // Delete expired rooms
  rowsToDelete.forEach(row => sheet.deleteRow(row));
  
  Logger.log(`Cleaned up ${rowsToDelete.length} expired rooms`);
}

/**
 * Test function - create a test room
 */
function testCreateRoom() {
  const result = createRoom('test@example.com', 'Test User');
  Logger.log(result);
}
