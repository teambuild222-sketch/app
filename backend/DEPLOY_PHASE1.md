# Deploy Phase 1 — Production foundation

Status: **in progress**. Postgres + JWT + migrations are done for local/Supabase.
Remaining: durable media + HTTPS host.

## Done when

- [x] Supabase Postgres + `alembic upgrade head`
- [x] `JWT_SECRET` = Supabase legacy JWT secret
- [x] Frontend `VITE_SUPABASE_*` for Realtime
- [ ] Durable uploads (Supabase Storage **or** R2)
- [ ] API on HTTPS (Render / Fly / Railway)
- [ ] `VITE_API_URL` points at that HTTPS URL for phone builds

## Durable media — Option A (recommended): Supabase Storage

You already have a Supabase project — no Cloudflare account needed for beta.

1. Supabase → **Settings → API** → copy **Project URL** and **`service_role`** key  
   (service_role is secret — backend only, never put in frontend `.env`).
2. In `backend/.env`:

   ```env
   SUPABASE_URL=https://YOUR_REF.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
   SUPABASE_STORAGE_BUCKET=media
   ```

3. Create the public bucket:

   ```powershell
   cd C:\Users\Adi\OneDrive\Documents\app\backend
   .\.venv\Scripts\python.exe scripts\setup_supabase_storage.py
   ```

4. Restart uvicorn. Upload an avatar/event photo — URL should start with  
   `https://...supabase.co/storage/v1/object/public/media/...`

## Durable media — Option B: Cloudflare R2

Set all five `R2_*` vars (see `.env.production.example`). Takes priority over Supabase Storage if both are set.

## Deploy API on Render (HTTPS)

**GitHub repo for Render:** [teambuild222-sketch/app](https://github.com/teambuild222-sketch/app) ([profile](https://github.com/teambuild222-sketch))

1. Push latest `main`: `git push origin main --force-with-lease` (or `.\scripts\push-teambuild-main.ps1`) as **teambuild222-sketch**
2. [Render](https://dashboard.render.com) → **New** → **Blueprint** → select **`teambuild222-sketch/app`**  
   (uses `backend/render.yaml`) **or** New Web Service → Docker → root `backend`.
3. Set secret env vars from `backend/render-secrets.env` (generate with `python scripts/export_render_env.py`) or `.env.production.example`  
   (`DATABASE_URL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS`).
4. Deploy → copy the `https://….onrender.com` URL.
5. In `frontend/.env` for phone/store builds:

   ```env
   VITE_API_URL=https://YOUR-SERVICE.onrender.com
   ```

6. Rebuild: `npm.cmd run cap:sync` (or `release:sync`).

Health check: `https://YOUR-SERVICE.onrender.com/api/health` → `{"ok":true}`

## Production add-ons (recommended before real users)

The API boots without these (startup logs a warning for each), but features degrade:

| Env var | Without it |
|---------|-----------|
| `RESEND_API_KEY` (+ `EMAIL_FROM`, `PUBLIC_APP_URL`) | Password-reset and verification emails are **not delivered** |
| `REDIS_URL` (Upstash/Redis) | Rate limits are per-process — **required** if you run >1 instance |
| `ADMIN_USERNAMES` | No one can use `/api/admin/*` until a user has `is_admin` set |
| `FCM_SERVICE_ACCOUNT_JSON` | No push notifications (see [PHASE4.md](./PHASE4.md)) |

Check them all with `python scripts/check_deploy_ready.py --production`.

## Local commands (Windows PowerShell)

```powershell
cd C:\Users\Adi\OneDrive\Documents\app\backend
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe scripts\setup_supabase_storage.py
.\.venv\Scripts\python.exe scripts\check_deploy_ready.py --production
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

## Next after Phase 1

Phases 2–4 (chat/Realtime, trust & safety, hardening) are built — see [PHASE4.md](./PHASE4.md)
for the remaining provider setup (Resend, Firebase, Redis) and the first-admin bootstrap.
Run `alembic upgrade head` on every deploy (current head: `0012`).
