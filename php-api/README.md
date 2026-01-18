# Watch Party - PHP Email API

This is an alternative email endpoint for Watch Party that can be hosted on any PHP-capable server (cPanel, shared hosting, VPS, etc.).

## Why Use This?

| Approach | Pros | Cons |
|----------|------|------|
| **Cloudflare + Resend** | Serverless, automatic scaling, 100 emails/day free | Requires Resend account, limited free tier |
| **PHP Endpoint** | Use your own domain email, no third-party, unlimited | Requires PHP hosting, manual setup |

## Setup Instructions

### 1. Upload the File

Upload `sendmail.php` to your web server:

```
https://yourdomain.com/api/sendmail.php
```

**Using cPanel:**
1. Open File Manager
2. Navigate to `public_html`
3. Create folder `api`
4. Upload `sendmail.php`
5. Set permissions to `644`

### 2. Configure the Script

Edit the configuration section in `sendmail.php`:

```php
define('API_KEY', 'your-unique-secret-key-here');  // CHANGE THIS!
define('FROM_EMAIL', 'noreply@yourdomain.com');    // Your domain email
define('FROM_NAME', 'Watch Party');
define('REPLY_TO', 'support@yourdomain.com');
```

### 3. Test the Endpoint

**Using curl:**
```bash
curl -X POST https://yourdomain.com/api/sendmail.php \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-unique-secret-key-here" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "html": "<h1>Hello!</h1><p>This is a test.</p>"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "message": "Email sent successfully",
  "sent": true,
  "to": "test@example.com"
}
```

### 4. Update Watch Party App

Update the API configuration in your app to use the PHP endpoint:

```javascript
// In src/js/api.js or config
const EMAIL_API = {
  endpoint: 'https://yourdomain.com/api/sendmail.php',
  apiKey: 'your-unique-secret-key-here'
};
```

## API Reference

### Endpoint
`POST /api/sendmail.php`

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `application/json` |
| `X-API-Key` | Yes | Your API key |

### Request Body
```json
{
  "to": "recipient@example.com",      // Required
  "subject": "Email Subject",          // Required
  "html": "<h1>HTML content</h1>",    // Optional (html or text required)
  "text": "Plain text content",        // Optional (fallback)
  "replyTo": "reply@example.com",      // Optional
  "fromName": "Custom Sender Name"     // Optional
}
```

### Response
```json
{
  "success": true,
  "message": "Email sent successfully",
  "sent": true,
  "to": "recipient@example.com"
}
```

### Error Codes
| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request (missing fields, invalid email) |
| 401 | Unauthorized (invalid API key) |
| 405 | Method not allowed (use POST) |
| 429 | Rate limit exceeded |
| 500 | Server error |

## Rate Limiting

By default, the endpoint allows 100 emails per hour. Configure in the script:

```php
define('RATE_LIMIT_ENABLED', true);
define('RATE_LIMIT_MAX', 100);  // emails per hour
```

## Using SMTP (Optional)

For better deliverability, configure SMTP:

```php
define('USE_SMTP', true);
define('SMTP_HOST', 'smtp.yourdomain.com');
define('SMTP_PORT', 587);
define('SMTP_USER', 'noreply@yourdomain.com');
define('SMTP_PASS', 'your-smtp-password');
```

You'll also need to install PHPMailer:
```bash
composer require phpmailer/phpmailer
```

## Security Notes

1. **Change the API key** - Never use the default key in production
2. **Use HTTPS** - Always serve over SSL
3. **File permissions** - Set to 644 (not writable by others)
4. **Hide rate limit file** - The `.rate_limit` file is created in the same directory

## Troubleshooting

### Email not sending
1. Check server mail configuration (`php -i | grep sendmail`)
2. Check server error logs
3. Try SMTP instead of mail()
4. Verify FROM_EMAIL matches an email account on your server

### CORS errors
The script includes proper CORS headers. If you still get errors:
1. Check your server isn't overriding headers
2. Verify the endpoint URL is correct (https vs http)

### Rate limit issues
Delete the `.rate_limit` file to reset, or increase `RATE_LIMIT_MAX`.
