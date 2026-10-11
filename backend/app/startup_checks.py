"""Production startup validation (Deploy Phase 1).

Fails fast when ENVIRONMENT=production but SQLite, dev JWT, etc. are still set.
"""
import logging
import sys

from app.config import Settings

logger = logging.getLogger("simsor.startup")

DEV_JWT_PLACEHOLDER = "dev-secret-change-me-before-deploying"


def validate_settings(settings: Settings) -> None:
    if not settings.is_production:
        if settings.is_sqlite:
            logger.info("Development mode: SQLite + optional auto-create tables.")
        else:
            logger.info("Development mode: Postgres — prefer `alembic upgrade head` for schema.")
        return

    errors: list[str] = []
    if settings.is_sqlite:
        errors.append("DATABASE_URL must be Postgres in production (SQLite is dev-only).")
    if settings.jwt_secret.strip() == DEV_JWT_PLACEHOLDER or len(settings.jwt_secret.strip()) < 32:
        errors.append("JWT_SECRET must be a strong secret (32+ chars), not the dev placeholder.")
    if settings.cors_origins.strip() == "*":
        errors.append("CORS_ORIGINS must list real origins in production (not '*').")
    if not settings.durable_media_configured:
        errors.append(
            "Set Supabase Storage (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) or all R2_* "
            "vars — local /uploads disk is not deploy-safe."
        )

    for msg in errors:
        logger.error("Production config: %s", msg)

    if errors:
        sys.exit(
            "Refusing to start in production with invalid config. "
            "See backend/DEPLOY_PHASE1.md and backend/.env.production.example."
        )

    # Soft requirements — the app runs without them, but features degrade.
    if not settings.redis_url.strip():
        logger.warning(
            "REDIS_URL not set: rate limits are per-process (fine for ONE instance only)."
        )
    if not settings.resend_api_key.strip():
        logger.warning(
            "RESEND_API_KEY not set: password-reset and verification emails won't be delivered."
        )
    if not settings.fcm_configured:
        logger.warning("FCM_SERVICE_ACCOUNT_JSON not set: push notifications are disabled.")
    if not settings.admin_username_list:
        logger.warning("ADMIN_USERNAMES empty: nobody can use /api/admin until a user has is_admin.")
    if not settings.notion_client_id or not settings.notion_client_secret:
        logger.warning("NOTION_CLIENT_ID/SECRET unset: Connect Notion stays disabled.")
    if not settings.token_encryption_key.strip():
        logger.warning("TOKEN_ENCRYPTION_KEY unset: Notion tokens are encrypted with JWT_SECRET.")

    media = "R2" if settings.r2_configured else "Supabase Storage"
    logger.info("Production config checks passed (Postgres, JWT, CORS, %s).", media)
