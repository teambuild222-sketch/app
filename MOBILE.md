# SIMSOR Mobile App

SIMSOR is a **mobile-first** sports and entertainment events app. The UI is built for phones (bottom navigation, full-screen map, touch targets). Native Android and iOS builds use [Capacitor](https://capacitorjs.com/).

## Requirements

### Frontend (mobile client)
- Node.js 20+
- npm 10+

### Backend (API)
- Python 3.11+
- See `backend/requirements.txt`

### Native builds
- **Android:** Android Studio, JDK 17+
- **iOS (Mac only):** Xcode 15+

## Quick start (mobile preview in browser)

```bash
cd frontend
npm install
npm run dev
```

Open on your phone (same Wi‑Fi): `http://<your-pc-ip>:5173`

## Build for Android / iOS

```bash
cd frontend
npm install
npm run cap:sync          # build web assets + copy to native projects
npm run cap:android       # open Android Studio
npm run cap:ios           # open Xcode (Mac only)
```

First time only, add platforms:

```bash
cd frontend
npm run build:mobile
npx cap add android
npx cap add ios
npx cap sync
```

## Backend for mobile devices

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate    # Windows
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

On a **real phone**, set your PC's LAN IP in `frontend/.env`:

```env
VITE_API_URL=http://192.168.1.10:8000
```

Then rebuild: `npm run cap:sync`

## Project structure

| Path | Purpose |
|------|---------|
| `frontend/src/mobile/` | Capacitor init, status bar |
| `frontend/src/config/api.ts` | API URL for native builds |
| `frontend/capacitor.config.ts` | App ID, splash, status bar |
| `frontend/public/manifest.webmanifest` | Installable PWA manifest |
| `backend/main.py` | Mobile-friendly CORS API |

## App ID

- **Bundle ID:** `com.simsor.app`
- **Display name:** SIMSOR
