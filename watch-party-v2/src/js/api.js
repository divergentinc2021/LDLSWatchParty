// ============================================
// API Module - Google Apps Script Backend
// ============================================

import { API_URL } from './config.js';

/**
 * Make a request to the Apps Script backend
 */
async function apiRequest(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  
  // Add all params to URL
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      mode: 'cors'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success && data.error) {
      throw new Error(data.error);
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Create a new room
 * @param {string} email - Host email
 * @param {string} name - Display name (optional)
 * @returns {Promise<{success: boolean, code: string, message: string}>}
 */
export async function createRoom(email, name) {
  return apiRequest('createRoom', { email, name });
}

/**
 * Join an existing room
 * @param {string} code - 5-character room code
 * @param {string} email - User email
 * @param {string} name - Display name (optional)
 * @returns {Promise<{success: boolean, code: string, message: string}>}
 */
export async function joinRoom(code, email, name) {
  return apiRequest('joinRoom', { code, email, name });
}

/**
 * Validate if a room exists and is active
 * @param {string} code - 5-character room code
 * @returns {Promise<{success: boolean, valid: boolean}>}
 */
export async function validateRoom(code) {
  return apiRequest('validateRoom', { code });
}

/**
 * Get room info
 * @param {string} code - 5-character room code
 * @returns {Promise<{success: boolean, room: object}>}
 */
export async function getRoomInfo(code) {
  return apiRequest('getRoomInfo', { code });
}

/**
 * Verify if user has access to room
 * @param {string} code - 5-character room code
 * @param {string} email - User email
 * @returns {Promise<{success: boolean, hasAccess: boolean, isHost: boolean}>}
 */
export async function verifyAccess(code, email) {
  return apiRequest('verifyAccess', { code, email });
}
