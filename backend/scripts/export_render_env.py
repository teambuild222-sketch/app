"""
Build a Render-ready env file from backend/.env (never commit the output).

  python scripts/export_render_env.py

Writes: backend/render-secrets.env (gitignored) — import keys in Render dashboard
or paste each line under Environment → Secret Files / env vars.
"""
from __future__ import annotations

import os
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BACKEND, ".env")
OUT_PATH = os.path.join(BACKEND, "render-secrets.env")

# Keys Render blueprint expects (sync: false in render.yaml)
RENDER_KEYS = [
    "ENVIRONMENT",
    "DATABASE_URL",
    "JWT_SECRET",
    "JWT_ALGORITHM",
    "JWT_EXPIRE_MINUTES",
    "CORS_ORIGINS",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_BUCKET",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "PUBLIC_APP_URL",
    "REDIS_URL",
    "ADMIN_USERNAMES",
    "FCM_SERVICE_ACCOUNT_JSON",
    "GOOGLE_CLIENT_ID",
    "APPLE_CLIENT_ID",
    "NOTION_CLIENT_ID",
    "NOTION_CLIENT_SECRET",
    "NOTION_REDIRECT_URI",
    "NOTION_WEBHOOK_SECRET",
    "TOKEN_ENCRYPTION_KEY",
]


def load_dotenv(path: str) -> dict[str, str]:
    out: dict[str, str] = {}
    if not os.path.isfile(path):
        return out
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            out[key.strip()] = val.strip().strip('"').strip("'")
    return out


def main() -> int:
    src = load_dotenv(ENV_PATH)
    if not src:
        print(f"No {ENV_PATH} — copy .env.production.example to .env first.", file=sys.stderr)
        return 1

    lines: list[str] = [
        "# Generated for Render — do not commit. See DEPLOY_PHASE1.md",
        "ENVIRONMENT=production",
    ]

    for key in RENDER_KEYS:
        if key == "ENVIRONMENT":
            continue
        val = src.get(key, "")
        if not val and key in ("SUPABASE_STORAGE_BUCKET",):
            val = "media"
        if not val and key in ("JWT_ALGORITHM",):
            val = "HS256"
        if not val and key in ("JWT_EXPIRE_MINUTES",):
            val = "43200"
        if val:
            # Render accepts multiline JSON if quoted; keep one line for FCM JSON
            if "\n" in val:
                val = val.replace("\n", "").replace("\r", "")
            lines.append(f"{key}={val}")

    # Production CORS: ensure Capacitor + local dev if missing from .env
    cors = src.get("CORS_ORIGINS", "")
    if cors.strip() in ("", "*"):
        lines.append(
            "CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,"
            "capacitor://localhost,ionic://localhost,https://simsor-api.onrender.com"
        )
    elif "CORS_ORIGINS=" not in "\n".join(lines):
        lines.append(f"CORS_ORIGINS={cors}")

    if not any(l.startswith("ADMIN_USERNAMES=") for l in lines):
        admin = src.get("ADMIN_USERNAMES", "admin")
        if admin:
            lines.append(f"ADMIN_USERNAMES={admin}")

    os.makedirs(BACKEND, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"Wrote {OUT_PATH} ({len(lines)} lines).")
    print("Render: Dashboard -> simsor-api -> Environment -> paste each KEY=VALUE.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
