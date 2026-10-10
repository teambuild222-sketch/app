# Render — connect Aditya-skar/Zennex

Repo: **https://github.com/Aditya-skar/Zennex** (branch `main`)

## 1. Blueprint

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Blueprint**
2. Connect GitHub → choose **Aditya-skar/Zennex**
3. Approve **`backend/render.yaml`** → service name **`simsor-api`**

## 2. Environment (required)

From your machine:

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\export_render_env.py
```

Open **`render-secrets.env`** and add each line in Render → **simsor-api** → **Environment**.

Minimum keys: `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS`, `ADMIN_USERNAMES`.

## 3. Deploy & verify

- Wait until status **Live**
- `https://simsor-api.onrender.com/api/health` → `{"ok":true}`

## 4. App

In `frontend/.env`:

```env
VITE_API_URL=https://simsor-api.onrender.com
```

Then: `npm run build` and `npx cap sync`.
