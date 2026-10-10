"""
Async SQLAlchemy engine/session setup. Works with SQLite (dev) and
Postgres/asyncpg (staging/prod) via the same code path — only DATABASE_URL
changes between environments.
"""
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

# SQLite: threaded/async dev. Postgres (Supabase/Neon): SSL required from cloud hosts (e.g. Render).
_connect_args: dict = {}
if settings.database_url.startswith("sqlite"):
    _connect_args["check_same_thread"] = False
elif settings.database_url.startswith("postgresql"):
    _connect_args["ssl"] = True

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
