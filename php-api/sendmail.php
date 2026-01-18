<?php
/**
 * Watch Party - Email API Endpoint
 * 
 * A simple PHP proxy to send emails from your domain.
 * Upload this to your web hosting (cPanel, etc.) at:
 * https://yourdomain.com/api/sendmail.php
 * 
 * SETUP:
 * 1. Upload this file to your web server (e.g., public_html/api/sendmail.php)
 * 2. Update the configuration below
 * 3. Set file permissions to 644
 * 4. Test with the provided test function
 */

// ============ CONFIGURATION ============
define('API_KEY', 'watchparty-email-2026-secure'); // Change this to a unique secret key!
define('FROM_EMAIL', 'noreply@yourdomain.com');    // Your domain email
define('FROM_NAME', 'Watch Party');
define('REPLY_TO', 'support@yourdomain.com');      // Where replies should go

// SMTP Configuration (optional - set USE_SMTP to true to use)
define('USE_SMTP', false);
define('SMTP_HOST', 'smtp.yourdomain.com');
define('SMTP_PORT', 587);
define('SMTP_USER', 'noreply@yourdomain.com');
define('SMTP_PASS', 'your-smtp-password');

// Rate limiting (simple file-based)
define('RATE_LIMIT_ENABLED', true);
define('RATE_LIMIT_MAX', 100);        // Max emails per hour
define('RATE_LIMIT_FILE', __DIR__ . '/.rate_limit');

// ============ CORS HEADERS ============
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, 'Method not allowed. Use POST.');
}

// ============ HELPER FUNCTIONS ============
function respond($code, $message, $data = []) {
    http_response_code($code);
    echo json_encode(array_merge([
        'success' => $code >= 200 && $code < 300,
        'message' => $message
    ], $data));
    exit;
}

function sanitizeEmail($email) {
    return filter_var(trim($email), FILTER_SANITIZE_EMAIL);
}

function sanitizeString($str) {
    return htmlspecialchars(strip_tags(trim($str)), ENT_QUOTES, 'UTF-8');
}

function checkRateLimit() {
    if (!RATE_LIMIT_ENABLED) return true;
    
    $hour = date('Y-m-d-H');
    $data = [];
    
    if (file_exists(RATE_LIMIT_FILE)) {
        $data = json_decode(file_get_contents(RATE_LIMIT_FILE), true) ?: [];
    }
    
    // Reset if new hour
    if (!isset($data['hour']) || $data['hour'] !== $hour) {
        $data = ['hour' => $hour, 'count' => 0];
    }
    
    if ($data['count'] >= RATE_LIMIT_MAX) {
        return false;
    }
    
    $data['count']++;
    file_put_contents(RATE_LIMIT_FILE, json_encode($data));
    return true;
}

// ============ MAIN LOGIC ============

// Check rate limit
if (!checkRateLimit()) {
    respond(429, 'Rate limit exceeded. Try again later.');
}

// Validate API key
$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if (empty($apiKey)) {
    // Also check POST body for API key (fallback)
    $input = json_decode(file_get_contents('php://input'), true);
    $apiKey = $input['apiKey'] ?? '';
}

if ($apiKey !== API_KEY) {
    respond(401, 'Invalid or missing API key');
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !is_array($input)) {
    respond(400, 'Invalid JSON input');
}

// Required fields
$required = ['to', 'subject'];
foreach ($required as $field) {
    if (empty($input[$field])) {
        respond(400, "Missing required field: {$field}");
    }
}

// Extract and sanitize email data
$to = sanitizeEmail($input['to']);
$subject = sanitizeString($input['subject']);
$htmlBody = $input['html'] ?? $input['body'] ?? '';
$textBody = $input['text'] ?? strip_tags($htmlBody);
$replyTo = sanitizeEmail($input['replyTo'] ?? REPLY_TO);
$fromName = sanitizeString($input['fromName'] ?? FROM_NAME);

// Validate recipient email
if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
    respond(400, 'Invalid recipient email address');
}

// Build email
try {
    if (USE_SMTP && class_exists('PHPMailer\PHPMailer\PHPMailer')) {
        // Use PHPMailer if available and configured
        require_once 'vendor/autoload.php';
        $result = sendWithPHPMailer($to, $subject, $htmlBody, $textBody, $replyTo, $fromName);
    } else {
        // Use PHP's built-in mail() function
        $result = sendWithMail($to, $subject, $htmlBody, $textBody, $replyTo, $fromName);
    }
    
    if ($result) {
        respond(200, 'Email sent successfully', ['sent' => true, 'to' => $to]);
    } else {
        respond(500, 'Failed to send email. Check server mail configuration.');
    }
} catch (Exception $e) {
    error_log("Watch Party Email Error: " . $e->getMessage());
    respond(500, 'Email error: ' . $e->getMessage());
}

// ============ EMAIL SENDING FUNCTIONS ============

function sendWithMail($to, $subject, $htmlBody, $textBody, $replyTo, $fromName) {
    $boundary = md5(time());
    
    $headers = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = "From: {$fromName} <" . FROM_EMAIL . ">";
    $headers[] = "Reply-To: {$replyTo}";
    $headers[] = "X-Mailer: WatchParty-PHP/1.0";
    
    if (!empty($htmlBody)) {
        // Multipart email (HTML + plain text fallback)
        $headers[] = "Content-Type: multipart/alternative; boundary=\"{$boundary}\"";
        
        $body = "--{$boundary}\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $body .= $textBody . "\r\n\r\n";
        
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $body .= $htmlBody . "\r\n\r\n";
        
        $body .= "--{$boundary}--";
    } else {
        // Plain text only
        $headers[] = "Content-Type: text/plain; charset=UTF-8";
        $body = $textBody;
    }
    
    return mail($to, $subject, $body, implode("\r\n", $headers));
}

function sendWithPHPMailer($to, $subject, $htmlBody, $textBody, $replyTo, $fromName) {
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    
    // SMTP configuration
    $mail->isSMTP();
    $mail->Host = SMTP_HOST;
    $mail->Port = SMTP_PORT;
    $mail->SMTPAuth = true;
    $mail->Username = SMTP_USER;
    $mail->Password = SMTP_PASS;
    $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    
    // Email settings
    $mail->setFrom(FROM_EMAIL, $fromName);
    $mail->addAddress($to);
    $mail->addReplyTo($replyTo);
    
    $mail->isHTML(!empty($htmlBody));
    $mail->Subject = $subject;
    $mail->Body = !empty($htmlBody) ? $htmlBody : $textBody;
    $mail->AltBody = $textBody;
    $mail->CharSet = 'UTF-8';
    
    return $mail->send();
}
?>
