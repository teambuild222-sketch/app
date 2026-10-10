"""Push notification delivery via FCM HTTP v1.

FCM delivers to Android directly and to iOS through Firebase (APNs key uploaded
in the Firebase console), so one integration covers both mobile platforms. The
client registers its FCM token with `POST /api/me/device-token`.

Design notes
------------
* Fully optional: with no `FCM_SERVICE_ACCOUNT_JSON`, `notify_users` is a no-op.
* Fire-and-forget: sends run on a background task so an API request never waits
  on Google. Failures are logged, never raised into the request.
* No extra dependencies: the OAuth2 service-account JWT is signed with
  python-jose (RS256) and HTTP goes through urllib.
* Dead tokens (`UNREGISTERED`) are pruned automatically.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Iterable, Literal

from jose import jwt
from sqlalchemy import delete, select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import UserDeviceToken

logger = logging.getLogger("simsor.push")

_FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
_DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token"
_MOBILE_PLATFORMS = ("ios", "android")

SendResult = Literal["ok", "invalid", "error"]


@dataclass(frozen=True)
class PushMessage:
    title: str
    body: str
    data: dict[str, str] = field(default_factory=dict)


def preview(text: str | None, limit: int = 90) -> str:
    text = (text or "").strip().replace("\n", " ")
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


# ---------------------------------------------------------------------------
# HTTP transport (module-level so tests can replace it)
# ---------------------------------------------------------------------------


def _http_post(url: str, *, headers: dict[str, str], body: bytes, timeout: float = 15.0) -> tuple[int, str]:
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError) as exc:
        return 0, str(exc)


# ---------------------------------------------------------------------------
# FCM client
# ---------------------------------------------------------------------------


def _load_service_account(raw: str) -> dict | None:
    raw = raw.strip()
    try:
        if raw.startswith("{"):
            return json.loads(raw)
        with open(raw, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as exc:
        logger.error("FCM service account could not be loaded: %s", exc)
        return None


class FcmClient:
    def __init__(self, account: dict, project_override: str = "") -> None:
        self._account = account
        self.project_id = project_override.strip() or str(account.get("project_id", ""))
        self._lock = threading.Lock()
        self._token: str | None = None
        self._token_expiry = 0.0

    @property
    def usable(self) -> bool:
        return bool(self.project_id and self._account.get("client_email") and self._account.get("private_key"))

    def _access_token(self, *, force: bool = False) -> str | None:
        with self._lock:
            if not force and self._token and time.time() < self._token_expiry - 60:
                return self._token

            now = int(time.time())
            token_uri = str(self._account.get("token_uri") or _DEFAULT_TOKEN_URI)
            assertion = jwt.encode(
                {
                    "iss": self._account["client_email"],
                    "scope": _FCM_SCOPE,
                    "aud": token_uri,
                    "iat": now,
                    "exp": now + 3600,
                },
                self._account["private_key"],
                algorithm="RS256",
            )
            form = urllib.parse.urlencode(
                {"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}
            ).encode("utf-8")
            status, text = _http_post(
                token_uri, headers={"Content-Type": "application/x-www-form-urlencoded"}, body=form
            )
            if status != 200:
                logger.error("FCM OAuth token exchange failed (%s): %s", status, text[:300])
                return None
            try:
                payload = json.loads(text)
            except ValueError:
                return None
            self._token = payload.get("access_token")
            self._token_expiry = time.time() + float(payload.get("expires_in", 3600))
            return self._token

    def send(self, device_token: str, message: PushMessage) -> SendResult:
        url = f"https://fcm.googleapis.com/v1/projects/{self.project_id}/messages:send"
        body = json.dumps(
            {
                "message": {
                    "token": device_token,
                    "notification": {"title": message.title, "body": message.body},
                    "data": {k: str(v) for k, v in message.data.items()},
                    "android": {"priority": "HIGH"},
                    "apns": {"payload": {"aps": {"sound": "default"}}},
                }
            }
        ).encode("utf-8")

        for attempt in (0, 1):
            access = self._access_token(force=attempt == 1)
            if access is None:
                return "error"
            status, text = _http_post(
                url,
                headers={"Authorization": f"Bearer {access}", "Content-Type": "application/json"},
                body=body,
            )
            if status == 200:
                return "ok"
            if status == 401 and attempt == 0:
                continue  # cached token was rejected — mint a new one once
            return "invalid" if _is_dead_token_error(status, text) else "error"
        return "error"


def _is_dead_token_error(status: int, text: str) -> bool:
    if status == 404:
        return True
    lowered = text.lower()
    if "unregistered" in lowered or "registration token is not a valid" in lowered:
        return True
    return status == 400 and "invalid_argument" in lowered and "token" in lowered


_client_cache: tuple[tuple[str, str], FcmClient | None] | None = None


def get_client() -> FcmClient | None:
    """Builds (and caches) the FCM client from settings; None when not configured."""
    global _client_cache
    settings = get_settings()
    if not settings.fcm_configured:
        return None

    key = (settings.fcm_service_account_json, settings.fcm_project_id)
    if _client_cache is not None and _client_cache[0] == key:
        return _client_cache[1]

    account = _load_service_account(settings.fcm_service_account_json)
    client = FcmClient(account, settings.fcm_project_id) if account else None
    if client is not None and not client.usable:
        logger.error("FCM service account is missing project_id / client_email / private_key")
        client = None
    _client_cache = (key, client)
    return client


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_tasks: set[asyncio.Task] = set()


def _spawn(coro) -> None:
    task = asyncio.get_running_loop().create_task(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def drain() -> None:
    """Waits for in-flight deliveries (used by tests and graceful shutdown)."""
    if _tasks:
        await asyncio.gather(*list(_tasks), return_exceptions=True)


def _send_batch(client: FcmClient, targets: list[str], message: PushMessage) -> list[str]:
    dead: list[str] = []
    for token in targets:
        try:
            if client.send(token, message) == "invalid":
                dead.append(token)
        except Exception:  # noqa: BLE001 — one bad token must not stop the rest
            logger.exception("FCM send crashed")
    return dead


async def _deliver(tokens: list[str], message: PushMessage) -> None:
    client = get_client()
    if client is None:
        return
    try:
        dead = await asyncio.to_thread(_send_batch, client, tokens, message)
        if dead:
            async with AsyncSessionLocal() as session:
                await session.execute(delete(UserDeviceToken).where(UserDeviceToken.token.in_(dead)))
                await session.commit()
            logger.info("Pruned %d dead push token(s)", len(dead))
    except Exception:  # noqa: BLE001
        logger.exception("Push delivery failed")


async def notify_users(
    db,
    user_ids: Iterable[str],
    *,
    title: str,
    body: str,
    data: dict[str, str] | None = None,
) -> int:
    """Queues a push to every mobile device registered by `user_ids`.

    Returns the number of device tokens targeted (0 when push is not configured).
    Must be called inside a running event loop (i.e. from a request handler).
    """
    ids = list(dict.fromkeys(user_ids))
    if not ids:
        return 0

    # In-app notification feed: every push-worthy event is also stored so the
    # bell shows it even without a device token / FCM. Chat messages are
    # excluded: they already live in the conversation itself.
    payload = data or {}
    if payload.get("type") != "message":
        try:
            from app.models import Notification

            for uid in ids:
                db.add(Notification(user_id=uid, title=title, body=body, data=payload))
            await db.commit()
        except Exception:  # noqa: BLE001 - never fail the caller over a feed row
            logger.exception("could not record in-app notification")
            await db.rollback()

    if get_client() is None:
        return 0

    result = await db.execute(
        select(UserDeviceToken.token).where(
            UserDeviceToken.user_id.in_(ids),
            UserDeviceToken.platform.in_(_MOBILE_PLATFORMS),
        )
    )
    tokens = list(dict.fromkeys(result.scalars().all()))
    if not tokens:
        return 0

    _spawn(_deliver(tokens, PushMessage(title=title, body=body, data=data or {})))
    return len(tokens)
