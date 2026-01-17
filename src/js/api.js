// ============================================
// API - Apps Script Backend Communication
// ============================================

// Apps Script Web App URL
const API_URL = 'https://script.google.com/macros/s/AKfycbzGSfmG-uWUd-9WYc99JcBDcekFb4A8D4lv1JqKRUIHx3fI06dt4xd3R5oHR9Nm-gzfTA/exec';

// Check if API is configured
function checkApiConfig() {
  if (API_URL.includes('YOUR_DEPLOYMENT_ID')) {
    console.error('❌ API NOT CONFIGURED!');
    console.error('Please update API_URL in src/js/api.js with your Apps Script deployment URL');
    console.error('Example: https://script.google.com/macros/s/AKfycbw.../exec');
    return false;
  }
  return true;
}

/**
 * Create a new room
 */
export async function createRoom(email, name, password = '') {
  if (!checkApiConfig()) {
    return { success: false, error: 'API not configured. Check browser console (F12) for details.' };
  }
  
  const params = new URLSearchParams({
    action: 'createRoom',
    email: email,
    name: name,
    password: password
  });
  
  try {
    console.log('API Request: createRoom');
    const response = await fetch(`${API_URL}?${params}`, { method: 'GET', mode: 'cors' });
    const result = await response.json();
    console.log('API Response:', result);
    return result;
  } catch (err) {
    console.error('API Error:', err);
    return { success: false, error: 'Network error. Check browser console (F12) for details.' };
  }
}

/**
 * Join an existing room
 */
export async function joinRoom(code, email, name, password = '') {
  if (!checkApiConfig()) {
    return { success: false, error: 'API not configured. Check browser console (F12) for details.' };
  }
  
  const params = new URLSearchParams({
    action: 'joinRoom',
    code: code,
    email: email,
    name: name,
    password: password
  });
  
  try {
    console.log('API Request: joinRoom', code);
    const response = await fetch(`${API_URL}?${params}`, { method: 'GET', mode: 'cors' });
    const result = await response.json();
    console.log('API Response:', result);
    return result;
  } catch (err) {
    console.error('API Error:', err);
    return { success: false, error: 'Network error. Check browser console (F12) for details.' };
  }
}

/**
 * Validate if a room exists and check password requirement
 */
export async function validateRoom(code) {
  if (!checkApiConfig()) {
    return { success: false, error: 'API not configured' };
  }
  
  const params = new URLSearchParams({ action: 'validateRoom', code: code });
  
  try {
    const response = await fetch(`${API_URL}?${params}`, { method: 'GET', mode: 'cors' });
    return await response.json();
  } catch (err) {
    console.error('API Error:', err);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Verify user has access to room (for email link validation)
 */
export async function verifyAccess(code, token, email) {
  if (!checkApiConfig()) {
    return { success: false, error: 'API not configured' };
  }
  
  const params = new URLSearchParams({
    action: 'verifyAccess',
    code: code,
    token: token,
    email: email
  });
  
  try {
    console.log('API Request: verifyAccess', code);
    const response = await fetch(`${API_URL}?${params}`, { method: 'GET', mode: 'cors' });
    const result = await response.json();
    console.log('API Response:', result);
    return result;
  } catch (err) {
    console.error('API Error:', err);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Get room info
 */
export async function getRoomInfo(code) {
  if (!checkApiConfig()) {
    return { success: false, error: 'API not configured' };
  }
  
  const params = new URLSearchParams({ action: 'getRoomInfo', code: code });
  
  try {
    const response = await fetch(`${API_URL}?${params}`, { method: 'GET', mode: 'cors' });
    return await response.json();
  } catch (err) {
    console.error('API Error:', err);
    return { success: false, error: 'Network error' };
  }
}
