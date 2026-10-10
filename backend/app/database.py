"""
Async SQLAlchemy engine/session setup. Works with SQLite (dev) and
Postgres/asyncpg (staging/prod) via the same code path — only DATABASE_URL
changes between environments.
"""
import ssl
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()


def _postgres_connect_args() -> dict:
    if not settings.database_url.startswith("postgresql"):
        return {}
    # Supabase from cloud hosts (Render) needs TLS; local dev often connects without extra ssl args.
    if settings.is_production:
        return {"ssl": ssl.create_default_context()}
    return {}


_connect_args: dict = {}
if settings.database_url.startswith("sqlite"):
    _connect_args["check_same_thread"] = False
else:
    _connect_args.update(_postgres_connect_args())

engine = create_async_engine(settings.database_url, echo=False, connect_args=_connect_args)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


async def init_models() -> None:
    """Create tables if they don't exist yet.

    Convenient for local SQLite dev. In staging/production, use Alembic
    migrations instead (see backend/alembic/) so schema changes are tracked.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
