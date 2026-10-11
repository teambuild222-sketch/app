"""Notion public API (version 2026-03-11). Never logs tokens or page content."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import logging
from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import get_settings

logger = logging.getLogger("simsor.notion")

NOTION_VERSION = "2026-03-11"
AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize"
TOKEN_URL = "https://api.notion.com/v1/oauth/token"
API_BASE = "https://api.notion.com/v1"


class NotionAuthError(Exception):
    def __init__(self, code: str, message: str = "") -> None:
        self.code = code
        super().__init__(message or code)


class NotionApiError(Exception):
    def __init__(self, status_code: int, code: str = "", retry_after: float | None = None) -> None:
        self.status_code = status_code
        self.code = code
        self.retry_after = retry_after
        super().__init__(f"notion_{status_code}_{code}")


def verify_webhook_signature(raw_body: bytes, signature: str, verification_token: str) -> bool:
    if not verification_token or not signature:
        return False
    digest = hmac.new(verification_token.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    expected = f"sha256={digest}"
    return hmac.compare_digest(expected, signature.strip())


def authorize_url(*, client_id: str, redirect_uri: str, state: str) -> str:
    query = urlencode(
        {
            "client_id": client_id,
            "response_type": "code",
            "owner": "user",
            "redirect_uri": redirect_uri,
            "state": state,
        }
    )
    return f"{AUTHORIZE_URL}?{query}"


def _basic_auth() -> str:
    settings = get_settings()
    raw = f"{settings.notion_client_id}:{settings.notion_client_secret}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("ascii")


async def exchange_code(code: str, redirect_uri: str) -> dict[str, Any]:
    return await _token_request(
        {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri}
    )


async def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    return await _token_request({"grant_type": "refresh_token", "refresh_token": refresh_token})


async def _token_request(body: dict[str, str]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            TOKEN_URL,
            headers={
                "Authorization": _basic_auth(),
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Notion-Version": NOTION_VERSION,
            },
            json=body,
        )
    data = _json(response)
    if response.status_code >= 400:
        err = str(data.get("error") or data.get("code") or "token_error")
        logger.info("notion_token_error status=%s code=%s", response.status_code, err)
        raise NotionAuthError(err)
    return data


async def notion_request(
    method: str,
    path: str,
    access_token: str,
    *,
    json: dict[str, Any] | None = None,
    retries: int = 3,
) -> dict[str, Any]:
    url = path if path.startswith("http") else f"{API_BASE}{path}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Notion-Version": NOTION_VERSION,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    delay = 1.0
    async with httpx.AsyncClient(timeout=20) as client:
        for attempt in range(retries):
            response = await client.request(method, url, headers=headers, json=json)
            if response.status_code in {429, 529}:
                retry_after = float(response.headers.get("Retry-After") or delay)
                logger.info("notion_rate_limited attempt=%s retry_after=%s", attempt + 1, retry_after)
                if attempt == retries - 1:
                    raise NotionApiError(response.status_code, "rate_limited", retry_after)
                await asyncio.sleep(retry_after)
                delay = min(delay * 2, 30)
                continue
            data = _json(response)
            if response.status_code >= 400:
                code = str(data.get("code") or "api_error")
                logger.info("notion_api_error status=%s code=%s", response.status_code, code)
                raise NotionApiError(response.status_code, code)
            return data
    raise NotionApiError(599, "exhausted")


async def search_databases(access_token: str) -> list[dict[str, str]]:
    data = await notion_request(
        "POST",
        "/search",
        access_token,
        json={"filter": {"value": "database", "property": "object"}, "page_size": 50},
    )
    out: list[dict[str, str]] = []
    for item in data.get("results") or []:
        if item.get("object") != "database":
            continue
        out.append(
            {
                "id": str(item.get("id") or ""),
                "title": _plain_title(item.get("title")),
            }
        )
    return [row for row in out if row["id"]]


async def retrieve_database(access_token: str, database_id: str) -> dict[str, Any]:
    return await notion_request("GET", f"/databases/{database_id}", access_token)


async def update_database_properties(
    access_token: str, database_id: str, properties: dict[str, Any]
) -> dict[str, Any]:
    return await notion_request(
        "PATCH",
        f"/databases/{database_id}",
        access_token,
        json={"properties": properties},
    )


async def create_database_page(
    access_token: str, database_id: str, properties: dict[str, Any]
) -> dict[str, Any]:
    return await notion_request(
        "POST",
        "/pages",
        access_token,
        json={"parent": {"database_id": database_id}, "properties": properties},
    )


def _plain_title(value: Any) -> str:
    if isinstance(value, str):
        return value
    if not isinstance(value, list):
        return ""
    parts: list[str] = []
    for block in value:
        if isinstance(block, dict):
            parts.append(str(block.get("plain_text") or ""))
    return "".join(parts).strip()


def _json(response: httpx.Response) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}
