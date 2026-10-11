# SIMSOR Backend

The mobile/web app talks to this API when `VITE_API_URL` is set in `frontend/.env`.

Until then the app runs on **local mocks** — no backend required.

**Phases 1–4 are implemented**: auth/profile/events/chat, media uploads, trust & safety
(reports, blocks, password reset, account deletion), and the hardening pass — email
verification, admin moderation, push notifications, Redis rate limiting, session
revocation, geo prefilter, and an automated test suite. See [PHASE1.md](./PHASE1.md),
[PHASE2.md](./PHASE2.md), [PHASE3.md](./PHASE3.md), [PHASE4.md](./PHASE4.md).

## Tests

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest
```

Tests run against a throwaway SQLite file and pin every external credential (email, FCM,
Redis, Supabase) to empty, so they never touch real services or your `.env`.

## Deploy (Phase 1 — production foundation)

Postgres + durable media (Supabase Storage or R2) + HTTPS API: **[DEPLOY_PHASE1.md](./DEPLOY_PHASE1.md)**.

```powershell
.\.venv\Scripts\python.exe scripts\check_deploy_ready.py --production
.\.venv\Scripts\python.exe scripts\setup_supabase_storage.py
```

## Quick start

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Defaults use a local SQLite file (`backend/simsor.db`, auto-created) — no
Postgres install needed for dev. Then in `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
```

Restart the Vite / Capacitor app. Auth and profile now hit this API instead of mocks.

### Switching to real Postgres (Neon/Supabase)

Set `DATABASE_URL` in `backend/.env` (see `.env.example`), then run:

```bash
alembic upgrade head
```

## Contract

See [API_CONTRACT.md](./API_CONTRACT.md) — keep backend responses aligned with `frontend/src/api/types.ts`.

## App integration points

| Feature | Frontend module | Route |
|---------|-----------------|-------|
| Login / signup | `frontend/src/api/auth.ts` | `/api/auth/*` |
| Profile | `frontend/src/api/profileApi.ts` | `/api/me` |
| Events | `frontend/src/api/eventsApi.ts` | `/api/events` |
| Dab ups / chat | `frontend/src/api/socialApi.ts` | `/api/dab-ups`, `/api/conversations` |
| Reports / blocks | — | `/api/reports`, `/api/blocks` |
| Moderation (admins) | — | `/api/admin/*` |
| Official club Notion | [NOTION.md](./NOTION.md) | `/api/communities/{id}/notion`, `/api/notion/*` |
| Push registration | — | `/api/me/device-token` |
