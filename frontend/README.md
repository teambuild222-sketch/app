# SIMSOR Mobile Frontend

React + Vite mobile client for **SIMSOR** (sports & entertainment events).

This is **not a desktop website** — the UI is mobile-only (bottom nav, full-screen map, touch layout). Native Android/iOS builds use Capacitor.

See **[../MOBILE.md](../MOBILE.md)** for full setup, backend, and store build instructions.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Mobile preview in browser |
| `npm run build:mobile` | Production build for Capacitor |
| `npm run cap:sync` | Build + sync to native projects |
| `npm run cap:android` | Open Android Studio |
| `npm run cap:ios` | Open Xcode (Mac) |

## Environment

Copy `.env.example` to `.env` and set `VITE_API_URL` when testing on a physical device.
