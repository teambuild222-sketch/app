# Web app on Cloudflare Pages

Hosts the React app at `https://<project>.pages.dev` so it opens on any phone or
computer, anywhere. The API stays on Render; `functions/api/[[path]].js` forwards
`/api/*` to it, so the browser only ever talks to the Pages domain (no CORS setup).

```
phone browser ──► Cloudflare Pages (static app + /api function) ──► simsor-api.onrender.com
              └─► Supabase (Realtime chat, media URLs)
```

## One-time setup (Cloudflare dashboard)

1. Push this repo to GitHub (`teambuild222-sketch/app`, branch `main`).
2. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick the repo.
3. Build settings:

   | Setting | Value |
   |---|---|
   | Framework preset | None |
   | Root directory | `frontend` |
   | Build command | `npm run build:web` |
   | Build output directory | `dist` |

4. **Environment variables** (Settings → Variables and Secrets, for Production and Preview).
   Copy the values from `frontend/.env`:

   | Name | Value |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `VITE_SUPABASE_URL` | your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase **anon** key (never the service_role key) |
   | `VITE_GOOGLE_CLIENT_ID` | only if Google sign-in is used |
   | `API_ORIGIN` | optional; defaults to `https://simsor-api.onrender.com` |

   `VITE_API_URL` is set to `/` by `.env.web`; don't override it.

5. **Save and Deploy.** Every push to `main` redeploys automatically.

## After the first deploy

- Open `https://<project>.pages.dev/api/health` → should return `{"ok":true}` (the proxy works).
- Google sign-in: Google Cloud Console → OAuth client → add `https://<project>.pages.dev`
  under **Authorized JavaScript origins**.
- Password-reset emails: on Render set `PUBLIC_APP_URL=https://<project>.pages.dev`.
- Add to home screen: open the site in Safari/Chrome → Share → **Add to Home Screen**.

## Notes

- Render's free plan sleeps after ~15 min idle; the first request then takes 30–60 s.
- Native app builds are unaffected: `npm run cap:sync` still uses `build:mobile`
  (relative asset paths, `VITE_API_URL` from `.env`).
- Web push in phone browsers is limited (especially iOS); full push needs the native app.
