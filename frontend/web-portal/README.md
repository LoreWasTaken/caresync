# CareSync Web Portal (React + Vite)

## What’s included
- Medication, schedule, caregivers, devices, notifications, reports pages.
- PWA support (manifest + service worker + install prompt).
- SNS PDF import flow (proxy to backend → FastAPI parser).
- NFC Transfer page (Web NFC read/write demo).

## Prerequisites
- Node 18+ (frontend)
- Backend API running at `http://localhost:5000/api` (see `/backend`)
- SNS FastAPI parser running at `http://127.0.0.1:8000/parse`

## Install & run
```bash
cd frontend/web-portal
npm install
npm run dev        # dev server
npm run build      # production build
npm run preview    # preview build output
```

### API base URL (desktop + mobile/LAN)
- The axios client reads `VITE_API_BASE_URL`; if not set it defaults to `window.location.origin + /api`.
- For LAN/mobile testing: start backend on `0.0.0.0:5000` and run frontend with `npm run dev -- --host`.
- Optionally set `VITE_API_BASE_URL=http://<pc-ip>:5000/api` in a `.env` for clarity.
- On mobile, open `http://<pc-ip>:5173` (dev) or `http://<pc-ip>:4173` (preview) so the API calls target your PC, not the phone’s localhost.

## PWA
- Manifest: `public/manifest.webmanifest`
- Service worker: `public/service-worker.js` (registered in `src/main.tsx`)
- Offline fallback: `public/offline.html`
- Install prompt: shown when `beforeinstallprompt` fires (see `PwaInstallBanner`)

To test install on mobile, expose the dev server on LAN (`npm run dev -- --host`) and visit from Chrome/Android or Safari/iOS, then “Install app”/“Add to Home Screen”.
For a real install prompt/standalone experience use a production build served over HTTPS or localhost:
```bash
npm run build
npm run preview -- --host   # optional --https with a local cert for mobile
```
Open `http://<pc-ip>:4173` (or `https://...`) on your phone; check Application → Manifest/Service Workers in dev tools for installability.

## SNS PDF import
- Backend proxy: `POST /api/sns/parse-pdf` (authenticated) forwards multipart PDF to FastAPI.
- Frontend: Medications page → “Import from SNS PDF” button.
  1) Upload PDF
  2) Review/edit parsed meds
  3) Save (creates medications via existing API)
   - Required fields: name, dosage, unit, times per day/frequency, total quantity, start date.
   - “Valid until” is prefetched from the PDF when present and editable.

## NFC Transfer (Web NFC)
- Page: `/dashboard/nfc`
- Hook: `useWebNfc` handles read/write with graceful unsupported messaging.
- Writes a compact JSON summary of the first 5 medications to an NDEF text record; can read tags and display the payload.

## SNS parser dependency
- FastAPI parser runs separately (default `http://127.0.0.1:8000/parse`).
- Backend proxy target configurable via `SNS_PARSER_URL` (see backend `.env`).
- No Internet required if parser and backend run locally.

## Environment tips
- Service worker/manifest served from `/public`.
- Base API URL comes from `src/api/client.ts` (default `http://localhost:5000/api`).
- SNS parser URL is proxied server-side; configure backend `SNS_PARSER_URL` if needed.
