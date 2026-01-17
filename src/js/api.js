// ============================================
// API - Apps Script Backend Communication
// ============================================

// IMPORTANT: Replace with your deployed Apps Script URL
// Deploy the Apps Script as a Web App with "Anyone" access
const API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

/**
 * Create a new room
 */
export async function createRoom(email, name, password = '') {
  const params = new URLSearchParams({
    action: 'createRoom',
    email: email,
    name: name,
    password: password
  });
  
  try {
    const response = await fetch(`${API_URL}?${params}`, {
      method: 'GET',
      mode: 'cors'
    });
    return await response.json();
  } catch (err) {
    console.error('API Error:', err);
    throw new Error('Failed to connect to server');
  }
}

/**
 * Join an existing room
 */
export async function joinRoom(code, email, name, password = '') {
  const params = new URLSearchParams({
    action: 'joinRoom',
    code: code,
    email: email,
    name: name,
    password: password
  });
  
  try {
    const response = await fetch(`${API_URL}?${params}`, {
      method: 'GET',
      mode: 'cors'
    });
    return await response.json();
  } catch (err) {
    console.error('API Error:', err);
    throw new Error('Failed to connect to server');
  }
}

/**
 * Validate if a room exists and check password requirement
 */
export async function validateRoom(code) {
  const params = new URLSearchParams({
    action: 'validateRoom',
    code: code
  });
  
  try {
    const response = await fetch(`${API_URL}?${params}`, {
      method: 'GET',
      mode: 'cors'
    });
    return await response.json();
  } catch (err) {
    console.error('API Error:', err);
    throw new Error('Failed to connect to server');
  }
}

/**
 * Verify user has access to room (for email link validation)
 */
export async function verifyAccess(code, token, email) {
  const params = new URLSearchParams({
    action: 'verifyAccess',
    code: code,
    token: token,
    email: email
  });
  
  try {
    const response = await fetch(`${API_URL}?${params}`, {
      method: 'GET',
      mode: 'cors'
    });
    return await response.json();
  } catch (err) {
    console.error('API Error:', err);
    throw new Error('Failed to connect to server');
  }
}

/**
 * Get room info
 */
export async function getRoomInfo(code) {
  const params = new URLSearchParams({
    action: 'getRoomInfo',
    code: code
  });
  
  try {
    const response = await fetch(`${API_URL}?${params}`, {
      method: 'GET',
      mode: 'cors'
    });
    return await response.json();
  } catch (err) {
    console.error('API Error:', err);
    throw new Error('Failed to connect to server');
  }
}
