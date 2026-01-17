// ============================================
// API Module - Apps Script Communication
// ============================================

import { API_URL } from './config.js';

/**
 * Make API request to Apps Script
 */
async function apiRequest(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  
  try {
    const response = await fetch(url.toString());
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a new room
 * @param {string} email - Host email
 * @param {string} name - Host display name
 * @param {string} password - Optional room password
 * @returns {Promise<{success: boolean, code?: string, token?: string, error?: string}>}
 */
export async function createRoom(email, name, password = '') {
  return apiRequest('createRoom', { email, name, password });
}

/**
 * Join an existing room
 * @param {string} code - Room code
 * @param {string} email - Participant email
 * @param {string} name - Participant display name
 * @param {string} password - Room password (if required)
 * @returns {Promise<{success: boolean, code?: string, token?: string, error?: string}>}
 */
export async function joinRoom(code, email, name, password = '') {
  return apiRequest('joinRoom', { code, email, name, password });
}

/**
 * Validate room exists and is active
 * @param {string} code - Room code
 * @returns {Promise<{success: boolean, valid: boolean, hasPassword?: boolean, error?: string}>}
 */
export async function validateRoom(code) {
  return apiRequest('validateRoom', { code });
}

/**
 * Verify user has access to room (via email link)
 * @param {string} code - Room code
 * @param {string} token - Access token from URL
 * @param {string} email - User email
 * @returns {Promise<{success: boolean, hasAccess: boolean, isHost?: boolean, name?: string, error?: string}>}
 */
export async function verifyAccess(code, token, email) {
  return apiRequest('verifyAccess', { code, token, email });
}

/**
 * Get room info
 * @param {string} code - Room code
 * @returns {Promise<{success: boolean, room?: object, error?: string}>}
 */
export async function getRoomInfo(code) {
  return apiRequest('getRoomInfo', { code });
}
