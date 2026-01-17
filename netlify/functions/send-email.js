// ============================================
// Netlify Function: Send Email
// Uses Resend API (free tier: 100 emails/day)
// ============================================

// To use this:
// 1. Sign up at resend.com
// 2. Get API key
// 3. Add RESEND_API_KEY to Netlify environment variables
// 4. Verify your domain or use onboarding@resend.dev for testing

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { to, name, code, token, isHost, hasPassword } = JSON.parse(event.body);

    if (!to || !code || !token) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      // Return success anyway - email is optional backup
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Email skipped (not configured)' }) };
    }

    const APP_URL = process.env.URL || 'https://ldlswatchparty.netlify.app';
    const joinUrl = `${APP_URL}/${code}-${token}?email=${encodeURIComponent(to)}`;
    
    const subject = isHost ? 'Your Watch Party - Rejoin Link' : 'Watch Party - Rejoin Link';
    
    const htmlBody = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:40px;font-family:sans-serif;background:#111;color:#fff">
  <div style="max-width:400px;margin:0 auto;text-align:center">
    <h1 style="color:#818cf8">Watch Party</h1>
    <p>Hey ${name || 'there'}!</p>
    <p>Here's your rejoin link for the watch party:</p>
    <div style="background:#222;padding:20px;border-radius:8px;margin:20px 0">
      <p style="margin:0;font-size:12px;color:#888">ROOM CODE</p>
      <p style="margin:10px 0;font-size:28px;font-weight:bold;color:#818cf8;letter-spacing:4px">${code}</p>
      ${hasPassword ? '<p style="color:#f59e0b;font-size:12px">🔒 Password Protected</p>' : ''}
    </div>
    <a href="${joinUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold">Rejoin Watch Party</a>
    <p style="margin-top:30px;font-size:12px;color:#666">Use this link if you get disconnected</p>
  </div>
</body>
</html>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Watch Party <onboarding@resend.dev>', // Change to your verified domain
        to: [to],
        subject: subject,
        html: htmlBody
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend error:', result);
      // Return success anyway - email is optional
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Email send attempted' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, emailId: result.id }) };

  } catch (error) {
    console.error('Email function error:', error);
    // Return success - email is optional backup feature
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Email skipped' }) };
  }
};
