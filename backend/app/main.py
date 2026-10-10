import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import init_models
from app.rate_limit import RateLimitMiddleware
from app.routers import (
    admin,
    affinity,
    auth,
    chat,
    communities,
    dab_ups,
    events,
    follows,
    health,
    moderation,
    people_lists,
    posts,
    profile,
    uploads,
    users,
)
from app.startup_checks import validate_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    validate_settings(settings)
    if settings.should_auto_create_tables:
        # Dev convenience: auto-create tables on SQLite. Staging/production: run
        # `alembic upgrade head` (see DEPLOY_PHASE1.md) — no create_all here.
        await init_models()
    yield


app = FastAPI(title="SIMSOR API", version="0.4.0", lifespan=lifespan)

# Rate limit before CORS so abused IPs still get a proper JSON 429.
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=(
        r"https?://("
        r"localhost|127\.0\.0\.1|10\.0\.2\.2"
        r"|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
        r")(:\d+)?|capacitor://localhost|ionic://localhost"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(events.router)
app.include_router(users.router)
app.include_router(posts.router)
app.include_router(follows.router)
app.include_router(affinity.router)
app.include_router(uploads.router)
app.include_router(chat.router)
app.include_router(chat.messages_router)
app.include_router(moderation.router)
app.include_router(admin.router)
app.include_router(dab_ups.router)
app.include_router(people_lists.router)
app.include_router(communities.router)

# Local-disk upload fallback (see app/storage.py) — a no-op once R2 is
# configured, since save_upload() then returns R2 URLs instead of /uploads/...
# paths and nothing ever gets written here.
os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
