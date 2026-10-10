"""
Centralized settings, read from environment variables (or backend/.env).

Local dev needs zero setup: DATABASE_URL defaults to a SQLite file so you can
run the API without installing Postgres. Point DATABASE_URL at Neon/Supabase
Postgres for staging/production — the rest of the code is driver-agnostic.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # `development` (default): SQLite OK, auto-create tables on SQLite.
    # `production`: Postgres + Alembic only, R2 required — see DEPLOY_PHASE1.md.
    environment: str = "development"

    # Async SQLAlchemy URL. Examples:
    #   sqlite+aiosqlite:///./simsor.db                          (local dev, default)
    #   postgresql+asyncpg://user:pass@host/dbname?ssl=require   (Neon/Supabase)
    database_url: str = "sqlite+aiosqlite:///./simsor.db"

    # JWT
    jwt_secret: str = "dev-secret-change-me-before-deploying"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 30  # 30 days — mobile apps stay logged in

    # CORS: comma-separated list of allowed origins for the production web/app build.
    # "*" is fine for local dev only.
    cors_origins: str = "*"

    # --- Media storage ---
    # Preference order in app/storage.py:
    #   1) Cloudflare R2 (all five R2_* set)
    #   2) Supabase Storage (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — easiest
    #      when you already use Supabase for Postgres / Realtime
    #   3) Local disk ./uploads (dev only)
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    r2_public_url_base: str = ""

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "media"

    upload_dir: str = "./uploads"
    max_image_upload_mb: int = 25
    max_video_upload_mb: int = 100

    # Phase 3 — email + abuse controls
    resend_api_key: str = ""
    email_from: str = "SIMSOR <onboarding@resend.dev>"
    password_reset_expire_minutes: int = 60
    rate_limit_enabled: bool = True

    # OAuth — set in production for social login buttons
    google_client_id: str = ""
    apple_client_id: str = ""

    # --- Email verification ---
    email_verify_expire_minutes: int = 60 * 24
    # When true, password/OAuth-less users with an email must verify it before login.
    require_email_verification: bool = False
    # Optional web/deep-link base (e.g. https://app.example.com) — used to put a
    # clickable link in verification emails. The raw token is always included too.
    public_app_url: str = ""

    # --- Moderation ---
    # Comma-separated usernames that always count as admins (bootstrap), in
    # addition to users whose `is_admin` column is set.
    admin_usernames: str = ""

    # --- Rate limiting ---
    # Set to a Redis/Upstash URL (redis:// or rediss://) to share rate-limit
    # counters across multiple API instances. Empty = in-memory (single instance).
    redis_url: str = ""

    # --- Push notifications (FCM HTTP v1; also delivers to iOS via Firebase) ---
    push_enabled: bool = True
    # Firebase service-account JSON — either the raw JSON string or a path to the file.
    fcm_service_account_json: str = ""
    # Optional override; defaults to `project_id` inside the service account JSON.
    fcm_project_id: str = ""

    @property
    def admin_username_list(self) -> list[str]:
        return [u.strip().lower() for u in self.admin_usernames.split(",") if u.strip()]

    @property
    def fcm_configured(self) -> bool:
        return bool(self.push_enabled and self.fcm_service_account_json.strip())

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod"}

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def should_auto_create_tables(self) -> bool:
        """SQLite dev convenience only — never in production."""
        return self.is_sqlite and not self.is_production

    @property
    def r2_configured(self) -> bool:
        return bool(
            self.r2_account_id
            and self.r2_access_key_id
            and self.r2_secret_access_key
            and self.r2_bucket_name
            and self.r2_public_url_base
        )

    @property
    def supabase_storage_configured(self) -> bool:
        return bool(self.supabase_url.strip() and self.supabase_service_role_key.strip())

    @property
    def durable_media_configured(self) -> bool:
        """True when uploads won't vanish on redeploy (R2 or Supabase Storage)."""
        return self.r2_configured or self.supabase_storage_configured

    @property
    def r2_endpoint_url(self) -> str:
        return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"

    @property
    def supabase_url_normalized(self) -> str:
        return self.supabase_url.strip().rstrip("/")

    @property
    def cors_origin_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if raw == "*":
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
