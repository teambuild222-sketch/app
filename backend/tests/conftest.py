"""Test harness.

Environment variables are set BEFORE `app` is imported: `Settings()` reads
`backend/.env` (which may hold real credentials), but real env vars win, so we
pin everything that could touch the outside world to a safe value.
"""
import os
import shutil
import tempfile

_TMP = tempfile.mkdtemp(prefix="simsor-tests-")

os.environ.update(
    {
        "ENVIRONMENT": "development",
        "DATABASE_URL": "sqlite+aiosqlite:///" + os.path.join(_TMP, "test.db").replace("\\", "/"),
        "JWT_SECRET": "test-secret-" + "x" * 40,
        "CORS_ORIGINS": "*",
        "UPLOAD_DIR": os.path.join(_TMP, "uploads"),
        "RATE_LIMIT_ENABLED": "false",
        "REDIS_URL": "",
        "RESEND_API_KEY": "",
        "FCM_SERVICE_ACCOUNT_JSON": "",
        "FCM_PROJECT_ID": "",
        "PUSH_ENABLED": "true",
        "SUPABASE_URL": "",
        "SUPABASE_SERVICE_ROLE_KEY": "",
        "R2_ACCOUNT_ID": "",
        "R2_ACCESS_KEY_ID": "",
        "R2_SECRET_ACCESS_KEY": "",
        "R2_BUCKET_NAME": "",
        "R2_PUBLIC_URL_BASE": "",
        "GOOGLE_CLIENT_ID": "",
        "APPLE_CLIENT_ID": "",
        "ADMIN_USERNAMES": "root",
        "REQUIRE_EMAIL_VERIFICATION": "false",
        "PUBLIC_APP_URL": "http://localhost:5173",
        "NOTION_CLIENT_ID": "test-notion-id",
        "NOTION_CLIENT_SECRET": "test-notion-secret",
        "NOTION_REDIRECT_URI": "http://test/api/notion/oauth/callback",
        "NOTION_WEBHOOK_SECRET": "test-webhook-secret",
        "TOKEN_ENCRYPTION_KEY": "test-token-encryption-key-32chars",
    }
)

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from sqlalchemy import delete  # noqa: E402

from app import rate_limit  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.database import AsyncSessionLocal, Base, engine, init_models  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _schema():
    await init_models()
    yield
    await engine.dispose()
    shutil.rmtree(_TMP, ignore_errors=True)


@pytest_asyncio.fixture(autouse=True)
async def _clean_db(_schema):
    yield
    async with AsyncSessionLocal() as session:
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(delete(table))
        await session.commit()
    rate_limit.reset_memory()
    rate_limit.set_redis_client(None)


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def settings():
    return get_settings()


class Account:
    def __init__(self, id: str, username: str, token: str, email: str | None) -> None:
        self.id = id
        self.username = username
        self.token = token
        self.email = email

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


async def register(client: httpx.AsyncClient, username: str, *, email: str | None = None,
                   password: str = "secret123") -> Account:
    body = {"username": username, "password": password, "fullName": username.title()}
    if email:
        body["email"] = email
    res = await client.post("/api/auth/signup", json=body)
    assert res.status_code == 200, res.text
    data = res.json()
    return Account(data["user"]["id"], data["user"]["username"], data["token"], email)


@pytest.fixture
def make_user(client):
    async def _make(username: str, **kw) -> Account:
        return await register(client, username, **kw)

    return _make


async def tick(ms: int = 15) -> None:
    """Ensures the next token's millisecond `iat` is strictly after a cutoff."""
    import asyncio

    await asyncio.sleep(ms / 1000)
