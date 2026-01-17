# Watch Party - Apps Script Edition

A zero-cost watch party application using Google Apps Script for backend and PeerJS for WebRTC signaling.

## Architecture

- **Frontend**: Netlify (static hosting)
- **Backend**: Google Apps Script + Google Sheets
- **Signaling**: PeerJS Cloud (free)
- **Media**: WebRTC P2P (screen share, webcam, audio)
- **Chat**: WebRTC Data Channels (P2P, no server)

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

### 2. Frontend Setup

1. Copy the Web App URL
2. Update `src/js/config.js` with your Apps Script URL
3. Deploy to Netlify:
   ```bash
   npm install
   npm run build
   netlify deploy --prod
   ```

### 3. Add Netlify Domain to Apps Script

1. In Apps Script, go to **Project Settings**
2. Add your Netlify domain to allowed origins

## Features

- ✅ Create/join rooms with 5-character codes
- ✅ HTML emails with room codes
- ✅ Screen sharing (host)
- ✅ Webcam & microphone
- ✅ Real-time chat (P2P)
- ✅ No Firebase, no quotas that matter

## Limits (All Free Tier)

| Service | Limit |
|---------|-------|
| Apps Script emails | 100/day (Gmail) |
| Apps Script executions | 90 min/day |
| PeerJS connections | Unlimited (reasonable use) |
| Netlify bandwidth | 100GB/month |
