# Render — connect teambuild222-sketch/app

Repo: **https://github.com/teambuild222-sketch/app** (branch `main`)

Account: **https://github.com/teambuild222-sketch**

## 1. Push code to GitHub

From repo root (must be logged in as **teambuild222-sketch**):

```powershell
git push origin main --force-with-lease
```

Or run (no PowerShell policy needed): `scripts\push-teambuild-main.cmd`

Or paste directly:

```powershell
cd C:\Users\Adi\OneDrive\Documents\app
git checkout main
git push origin main --force-with-lease
```

Confirm: [backend/render.yaml](https://github.com/teambuild222-sketch/app/blob/main/backend/render.yaml) exists on `main`.

## 2. Render Blueprint

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Blueprint**
2. Connect GitHub → allow **teambuild222-sketch** → choose **`app`**
3. Approve **`backend/render.yaml`** → service **`simsor-api`**

## 3. Environment

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\export_render_env.py
```

Paste **`render-secrets.env`** into Render → **Environment**.

Required: `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS`, `ADMIN_USERNAMES`.

## 4. Verify

`https://simsor-api.onrender.com/api/health` → `{"ok":true}`

## 5. Frontend

```env
VITE_API_URL=https://simsor-api.onrender.com
```

Then `npm run build` and `npx cap sync`.
