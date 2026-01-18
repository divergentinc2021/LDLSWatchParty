// ============================================
// API - Apps Script Backend Communication
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbzGSfmG-uWUd-9WYc99JcBDcekFb4A8D4lv1JqKRUIHx3fI06dt4xd3R5oHR9Nm-gzfTA/exec';

// ============================================
// Email API Configuration
// ============================================
// Option 1: Cloudflare Pages function (uses Resend API) - RECOMMENDED
// Option 2: PHP endpoint (host on your own server)
const EMAIL_CONFIG = {
  // Set to 'cloudflare', 'php', or 'disabled'
  provider: 'cloudflare',
  
  // Cloudflare endpoint (uses Resend API - needs RESEND_API_KEY env var)
  cloudflare: {
    endpoint: '/api/send-email'
  },
  
  // PHP endpoint settings (alternative if you have PHP hosting)
  php: {
    endpoint: 'https://yourdomain.com/api/sendmail.php',
    apiKey: 'watchparty-email-2026-secure'
  }
};

// ============================================
// Apps Script API Calls
// ============================================
async function apiCall(params) {
  try {
    const url = `${API_URL}?${new URLSearchParams(params)}`;
    console.log('API:', params.action);
    const response = await fetch(url, { method: 'GET', mode: 'cors' });
    const result = await response.json();
    console.log('API Response:', result);
    return result;
  } catch (err) {
    console.error('API Error:', err);
    return { success: false, error: 'Network error' };
  }
}

// Room Management
export const createRoom = (email, name, password = '') => 
  apiCall({ action: 'createRoom', email, name, password });

export const joinRoom = (code, email, name, password = '') => 
  apiCall({ action: 'joinRoom', code, email, name, password });

export const validateRoom = (code) => 
  apiCall({ action: 'validateRoom', code });

export const verifyAccess = (code, token, email) => 
  apiCall({ action: 'verifyAccess', code, token, email });

export const getRoomInfo = (code) => 
  apiCall({ action: 'getRoomInfo', code });

// Peer Discovery
export const registerPeer = (code, peerId, name, isHost) => 
  apiCall({ action: 'registerPeer', code, peerId, name, isHost: isHost ? 'true' : 'false' });

export const getActivePeers = (code) => 
  apiCall({ action: 'getActivePeers', code });

export const peerHeartbeat = (code, peerId) => 
  apiCall({ action: 'heartbeat', code, peerId });

export const unregisterPeer = (code, peerId) => 
  apiCall({ action: 'unregisterPeer', code, peerId });

// Stats
export const getActiveSessionCount = () => 
  apiCall({ action: 'getActiveSessionCount' });

// ============================================
// Email API
// ============================================

/**
 * Send a rejoin email to the user
 * @param {Object} data - Email data
 * @param {string} data.to - Recipient email
 * @param {string} data.name - User's name
 * @param {string} data.code - Room code
 * @param {string} data.token - Access token
 * @param {boolean} data.isHost - Whether user is host
 * @param {boolean} data.hasPassword - Whether room has password
 */
export async function sendRejoinEmail(data) {
  if (EMAIL_CONFIG.provider === 'disabled') {
    console.log('Email disabled - skipping');
    return { success: true, message: 'Email disabled' };
  }
  
  try {
    const { to, name, code, token, isHost, hasPassword } = data;
    
    if (!to || !code || !token) {
      return { success: false, error: 'Missing required fields' };
    }
    
    if (EMAIL_CONFIG.provider === 'php') {
      return await sendViaPhp(data);
    } else if (EMAIL_CONFIG.provider === 'cloudflare') {
      return await sendViaCloudflare(data);
    }
    
    return { success: false, error: 'Invalid email provider' };
  } catch (err) {
    console.error('Email error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send email via PHP endpoint
 */
async function sendViaPhp(data) {
  const { to, name, code, token, isHost, hasPassword } = data;
  const joinUrl = `${window.location.origin}/${code}-${token}`;
  
  const htmlBody = generateEmailHtml(name, code, joinUrl, hasPassword);
  
  const response = await fetch(EMAIL_CONFIG.php.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': EMAIL_CONFIG.php.apiKey
    },
    body: JSON.stringify({
      to,
      subject: isHost ? 'Your Watch Party - Rejoin Link' : 'Watch Party - Rejoin Link',
      html: htmlBody
    })
  });
  
  const result = await response.json();
  console.log('PHP Email Response:', result);
  return result;
}

/**
 * Send email via Cloudflare Pages function
 */
async function sendViaCloudflare(data) {
  const response = await fetch(EMAIL_CONFIG.cloudflare.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  
  const result = await response.json();
  console.log('Cloudflare Email Response:', result);
  return result;
}

/**
 * Generate HTML email body
 */
function generateEmailHtml(name, code, joinUrl, hasPassword) {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#09090b;color:#fafafa">
  <div style="max-width:400px;margin:0 auto;text-align:center">
    <div style="margin-bottom:24px">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
    </div>
    <h1 style="color:#fafafa;font-size:24px;margin:0 0 8px">Watch Party</h1>
    <p style="color:#a1a1aa;margin:0 0 24px">Hey ${name || 'there'}! Here's your rejoin link.</p>
    
    <div style="background:#18181b;padding:24px;border-radius:12px;margin:0 0 24px;border:1px solid #27272a">
      <p style="margin:0 0 8px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px">Room Code</p>
      <p style="margin:0;font-size:32px;font-weight:bold;color:#6366f1;letter-spacing:6px;font-family:monospace">${code}</p>
      ${hasPassword ? '<p style="margin:12px 0 0;color:#f59e0b;font-size:12px">🔒 Password Protected</p>' : ''}
    </div>
    
    <a href="${joinUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">
      Rejoin Watch Party
    </a>
    
    <p style="margin:32px 0 0;font-size:12px;color:#52525b">
      Use this link if you get disconnected or want to rejoin later.
    </p>
  </div>
</body>
</html>`;
}
