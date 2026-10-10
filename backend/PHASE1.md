# Phase 1 — Store-Review-Ready Backend

Status: **implemented and verified locally** (Python 3.12.10 installed via
winget, venv created, ran against local SQLite). All endpoints below were
smoke-tested end-to-end on 2026-07-24.

### Verified

| Check | Result |
|---|---|
| `GET /api/health` | `{"ok": true}` |
| `POST /api/auth/signup` | Creates user, returns JWT + `UserProfile` |
| `GET /api/me` with valid token | Returns the signed-up profile |
| `POST /api/auth/login` | Returns a fresh valid JWT |
| `PATCH /api/me` | Persists `bio`/`sports` updates, returns updated profile |
| Wrong password on login | `401` |
| Missing/invalid Bearer token | `401` |
| Duplicate username signup | `409 Conflict` |
| SQLite file (`backend/simsor.db`) | Created automatically, data persists across requests |

One bug found and fixed during verification: `SignupBody.email` uses
`EmailStr`, which needs the `email-validator` package — pydantic doesn't
install it by default. Added `pydantic[email]` to `requirements.txt`.

This document records exactly what Phase 1 built, why, and what's still left
before Phase 2 (events, feed, posts).

---

## 1. Goal

Replace the in-memory dev-token stub in `backend/app/main.py` with real
persistence and real auth, without changing the API contract the frontend
already codes against (`frontend/src/api/types.ts`, `API_CONTRACT.md`).

Scope (per the roadmap): `POST /api/auth/{login,signup,logout}`,
`GET /api/health`, `GET|PATCH /api/me`.

---

## 2. What changed

### Before
`backend/app/main.py` was a single file: Pydantic models + an in-memory
`dict` for "users" + fake `dev-token-{id}` strings. Restarting the server
wiped all users. No password check, no token validation.

### After
The backend is now a small package:

```
backend/
  app/
    main.py          FastAPI app: CORS + lifespan (creates tables) + routers
    config.py         Settings from env vars / .env (Pydantic Settings)
    database.py        Async SQLAlchemy engine/session, Base
    models.py          User ORM model
    schemas.py          Pydantic request/response models (camelCase, matches types.ts)
    security.py          Password hashing (bcrypt) + JWT create/decode
    deps.py                DB session + get_current_user (Bearer token) dependencies
    routers/
      health.py             GET /api/health
      auth.py                 POST /api/auth/signup, /login, /logout
      profile.py               GET/PATCH /api/me
      events.py                  Unchanged Phase-2 stub (kept out of main.py)
  alembic/                        Migration scaffolding (see below)
  alembic.ini
  legacy/simsor_hello_world.py       Archived old hello-world stub (was backend/main.py)
  .env.example
  requirements.txt
```

### Database
- **users** table: `id, username, email, password_hash, full_name, bio,
  location, avatar_url, sports (JSON), entertainment (JSON), created_at,
  updated_at`. Field names map 1:1 to `UserProfile` in `types.ts` (snake_case
  in the DB, camelCase over the wire via `schemas.py`).
- **Driver-agnostic by design.** `DATABASE_URL` picks the driver:
  - Local dev (default, zero setup): `sqlite+aiosqlite:///./simsor.db`
  - Staging/prod (Neon or Supabase): `postgresql+asyncpg://user:pass@host/db?ssl=require`
  
  Same models, same routers, same migrations work against either.

### Auth
- Passwords hashed with **bcrypt** directly (not `passlib`) — passlib's
  bcrypt backend has version-detection bugs against bcrypt ≥4.1; calling
  `bcrypt.hashpw`/`checkpw` directly sidesteps that entirely. Inputs are
  truncated to bcrypt's 72-byte limit before hashing.
- **JWT** via `python-jose`. Token payload is just `{sub: user_id, exp}`.
  Default expiry is 30 days (`JWT_EXPIRE_MINUTES=43200`) since this is a
  mobile app — short-lived web-style sessions would log users out constantly.
- `GET /api/me`, `PATCH /api/me`, and `POST /api/auth/logout` now require a
  valid `Authorization: Bearer <token>` header. Missing/invalid/expired
  tokens return `401`, which is exactly what `frontend/src/api/client.ts`
  already expects — it clears the stored token and fires
  `simsor-auth-expired` on any 401.
- Login/signup error messages don't reveal whether a username exists (both
  "no such user" and "wrong password" return the same 401 message).

### Migrations
Alembic is wired up (`backend/alembic/`) with an async-engine-aware `env.py`
(reads `DATABASE_URL` from `app.config`, not from `alembic.ini`, so it always
targets the same DB as the running app). One migration exists:
`0001_create_users_table.py`.

For local SQLite dev, tables are also auto-created on startup
(`init_models()` in `main.py`'s lifespan) so you don't have to run Alembic
just to try things out. **Always use Alembic for Postgres** (staging/prod) —
never point `init_models`-only workflows at a database you care about.

### CORS
Kept the existing mobile-aware origin list from the old `backend/main.py`
(Capacitor/Ionic schemes, localhost, `10.0.2.2` for the Android emulator) and
added `CORS_ORIGINS` as an env var for the production web origin(s). Still
defaults to `*` for local dev — **must be set to real origins before public
launch** (see `API_CONTRACT.md` / the shipping checklist).

### Repo cleanup done alongside this
- `backend/main.py` (the old SIMSOR "hello world" stub, unrelated to
  `backend/app/main.py`) moved to `backend/legacy/simsor_hello_world.py` and
  marked archived, per the cleanup checklist. It is not imported or run by
  anything.
- `.gitignore` updated to ignore the local `backend/*.db` SQLite file.

---

## 3. Environment variables

See `backend/.env.example`. Copy it to `backend/.env` for local dev:

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./simsor.db` | Swap for Neon/Supabase Postgres URL in staging/prod |
| `JWT_SECRET` | `dev-secret-change-me-before-deploying` | **Must** be replaced before any real deploy |
| `JWT_ALGORITHM` | `HS256` | |
| `JWT_EXPIRE_MINUTES` | `43200` (30 days) | |
| `CORS_ORIGINS` | `*` | Comma-separated real origins in production |

Generate a real secret:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## 4. Running it locally

This dev machine doesn't have Python installed, so none of this has been
executed yet — install Python 3.11+ first, then:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env         # defaults are fine for local dev (SQLite)
uvicorn app.main:app --reload --port 8000
```

Tables are created automatically on first run (SQLite). Then in
`frontend/.env`:
```env
VITE_API_URL=http://localhost:8000
```

### Smoke test
```bash
curl http://localhost:8000/api/health
curl -X POST http://localhost:8000/api/auth/signup -H "Content-Type: application/json" -d "{\"username\":\"testuser\",\"password\":\"password123\",\"fullName\":\"Test User\"}"
# copy the returned token, then:
curl http://localhost:8000/api/me -H "Authorization: Bearer <token>"
```

### Using real Postgres (Neon) instead of SQLite
1. Create a free Neon project, copy the connection string.
2. In `backend/.env`: `DATABASE_URL=postgresql+asyncpg://...`
3. Run the migration instead of relying on auto-create:
   ```bash
   alembic upgrade head
   ```

---

## 5. What's deliberately NOT in Phase 1

- `GET/POST /api/events` — untouched stub, still returns `[]` / echoes input.
  That's Phase 2 (events table + PostGIS radius queries).
- Rate limiting on auth endpoints (Upstash/slowapi) — Phase 4 / pre-launch item.
- Token revocation / refresh tokens — not needed at this scale; add a
  Redis-backed denylist later if you need instant logout-everywhere.
- Email verification / password reset (Resend or Brevo) — later phase.

---

## 6. Next steps

See [PHASE2.md](./PHASE2.md) — events backend is done; frontend wiring and
posts/follow/dab-ups are next.
