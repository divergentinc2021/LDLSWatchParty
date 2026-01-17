# Watch Party

A zero-cost watch party application using Google Apps Script for backend and PeerJS for WebRTC signaling.

## Architecture

- **Frontend**: Cloudflare Pages (static hosting + edge functions)
- **Backend**: Google Apps Script + Google Sheets
- **Signaling**: PeerJS Cloud (free)
- **Media**: WebRTC P2P (screen share, webcam, audio)
- **Chat**: WebRTC Data Channels (P2P, no server)
- **PWA**: Installable, works offline

## Features

- ✅ Create/join rooms with 5-character codes
- ✅ Screen sharing (host/superhost only)
- ✅ Webcam & microphone
- ✅ Real-time P2P chat
- ✅ Role system (Superhost → Host → Participant)
- ✅ Focus mode (theater-style viewing)
- ✅ Picture-in-Picture support
- ✅ Browser notifications
- ✅ PWA installable
- ✅ No Firebase, no quotas that matter

## Setup

### 1. Google Apps Script Setup

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it "Watch Party Rooms"
3. Create two sheets:
   - `Rooms` with headers: `code | hostEmail | hostName | createdAt | expiresAt | status`
   - `Participants` with headers: `code | email | name | joinedAt`
4. Go to **Extensions > Apps Script**
5. Replace the code with contents of `apps-script/Code.gs`
6. Deploy as Web App:
   - Click **Deploy > New deployment**
   - Select **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the URL
7. Update `src/js/api.js` with your Apps Script URL

### 2. Deploy to Cloudflare Pages

#### Option A: Via Dashboard
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages**
2. Click **Create** → **Pages** → **Connect to Git**
3. Select your repository
4. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Add environment variables (optional):
   - `RESEND_API_KEY` - For email functionality (get from [resend.com](https://resend.com))
6. Click **Save and Deploy**

#### Option B: Via Wrangler CLI
```bash
npm install -g wrangler
wrangler login
wrangler pages deploy dist
```

### 3. Local Development

```bash
npm install
npm run dev
```

### 4. Generate PWA Icons (if needed)

```bash
npm run generate-icons
```

## Project Structure

```
├── functions/           # Cloudflare Pages Functions
│   └── api/
│       └── send-email.js
├── public/
│   ├── icons/          # PWA icons
│   ├── _redirects      # SPA routing
│   ├── _headers        # Security headers
│   ├── manifest.json   # PWA manifest
│   └── index.html
├── src/
│   ├── css/
│   └── js/
│       ├── app.js      # Main application
│       ├── api.js      # Apps Script API
│       └── webrtc.js   # PeerJS/WebRTC
├── apps-script/        # Google Apps Script code
└── scripts/            # Build utilities
```

## Environment Variables (Cloudflare)

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | No | Resend API key for email feature |
| `APP_URL` | No | Custom domain (auto-detected if not set) |

## Free Tier Limits

| Service | Limit |
|---------|-------|
| Cloudflare Pages | Unlimited sites, 500 builds/month |
| Cloudflare Functions | 100,000 requests/day |
| Apps Script executions | 90 min/day |
| PeerJS connections | Unlimited (fair use) |
| Resend emails | 100/day |

## Keyboard Shortcuts (in room)

| Key | Action |
|-----|--------|
| `F` | Toggle focus mode |
| `M` | Toggle microphone |
| `V` | Toggle camera |
| `S` | Toggle screen share (hosts only) |
| `P` | Toggle Picture-in-Picture |
| `Esc` | Exit focus mode |

## License

MIT
