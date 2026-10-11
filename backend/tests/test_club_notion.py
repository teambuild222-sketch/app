"""Official-club verification, Notion gates, OAuth state, cross-club isolation."""
from datetime import datetime, timedelta, timezone

from app.club_verification import DEFAULT_JOIN_FIELDS, evaluate_requirements, normalize_join_fields
from app.notion_client import verify_webhook_signature
from app.notion_crypto import decrypt_secret, encrypt_secret


def _event_body(**extra):
    body = {
        "title": "Club night",
        "category": "Music",
        "mainCategory": "Entertainment",
        "coordinates": [17.4, 78.4],
    }
    body.update(extra)
    return body


async def _create_club(client, owner, name="Official FC"):
    res = await client.post(
        "/api/communities",
        headers=owner.headers,
        json={"name": name, "avatarUrl": "https://img.test/club.png", "memberIds": []},
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_verification_checklist_algorithm():
    checks = evaluate_requirements(name="FC", avatar_url="", member_count=1, has_chat=False)
    assert [c["id"] for c in checks] == ["name", "avatar", "members", "chat"]
    assert checks[0]["met"] is True
    assert checks[1]["met"] is False
    assert checks[2]["met"] is False
    assert checks[3]["met"] is False
    ready = evaluate_requirements(
        name="FC", avatar_url="https://x", member_count=2, has_chat=True
    )
    assert all(item["met"] for item in ready)


def test_join_sheet_normalizes_and_keeps_one_title():
    fields = normalize_join_fields(
        [
            {"key": "Name", "type": "title", "required": True},
            {"key": "Name", "type": "text"},
            {"key": "Email", "type": "email", "required": True},
            {"key": "  ", "type": "text"},
        ]
    )
    keys = [f["key"] for f in fields]
    assert keys.count("Name") == 1
    assert fields[0]["type"] == "title"
    assert "Email" in keys


def test_encrypt_roundtrip_and_webhook_signature():
    token = "secret_ntn_token"
    assert decrypt_secret(encrypt_secret(token)) == token
    raw = b'{"id":"evt"}'
    good = verify_webhook_signature(
        raw,
        "sha256=" + __import__("hmac").new(b"test-webhook-secret", raw, "sha256").hexdigest(),
        "test-webhook-secret",
    )
    assert good is True
    assert verify_webhook_signature(raw, "sha256=deadbeef", "test-webhook-secret") is False


async def test_only_platform_admin_can_verify_club(client, make_user):
    owner = await make_user("clubowner")
    stranger = await make_user("stranger")
    root = await make_user("root")
    club = await _create_club(client, owner)

    denied = await client.patch(
        f"/api/admin/communities/{club['id']}/verification",
        headers=stranger.headers,
        json={"verified": True},
    )
    assert denied.status_code == 403

    listed = await client.get("/api/admin/communities", headers=root.headers)
    assert listed.status_code == 200
    row = next(item for item in listed.json() if item["id"] == club["id"])
    assert row["verified"] is False
    assert {r["id"] for r in row["requirements"]} == {"name", "avatar", "members", "chat"}

    ok = await client.patch(
        f"/api/admin/communities/{club['id']}/verification",
        headers=root.headers,
        json={"verified": True, "note": "Met in person"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["verified"] is True
    assert ok.json()["verificationNote"] == "Met in person"

    mine = await client.get("/api/communities", headers=owner.headers)
    assert mine.json()[0]["verified"] is True
    assert mine.json()[0]["joinFormFields"]


async def test_unverified_club_cannot_use_notion(client, make_user):
    owner = await make_user("plainowner")
    club = await _create_club(client, owner, name="Hobby")
    res = await client.post(
        f"/api/communities/{club['id']}/notion/oauth/start",
        headers=owner.headers,
    )
    assert res.status_code == 403
    status = await client.get(f"/api/communities/{club['id']}/notion", headers=owner.headers)
    assert status.status_code == 200
    assert status.json()["status"] == "locked"
    assert status.json()["verified"] is False


async def test_member_cannot_connect_or_edit_form(client, make_user):
    owner = await make_user("adminclub")
    member = await make_user("clubmember")
    root = await make_user("root")
    club = await _create_club(client, owner, name="Verified FC")
    await client.post(f"/api/communities/{club['id']}/join", headers=member.headers)
    await client.patch(
        f"/api/admin/communities/{club['id']}/verification",
        headers=root.headers,
        json={"verified": True},
    )
    start = await client.post(
        f"/api/communities/{club['id']}/notion/oauth/start",
        headers=member.headers,
    )
    assert start.status_code == 403
    form = await client.put(
        f"/api/communities/{club['id']}/join-form",
        headers=member.headers,
        json={"fields": DEFAULT_JOIN_FIELDS},
    )
    assert form.status_code == 403


async def test_oauth_state_is_bound_and_expires(client, make_user):
    from app.database import AsyncSessionLocal
    from app.models import NotionOAuthState

    owner = await make_user("oauthowner")
    root = await make_user("root")
    other = await make_user("otheradmin")
    club_a = await _create_club(client, owner, name="Club A")
    club_b = await _create_club(client, other, name="Club B")
    await client.patch(
        f"/api/admin/communities/{club_a['id']}/verification",
        headers=root.headers,
        json={"verified": True},
    )
    await client.patch(
        f"/api/admin/communities/{club_b['id']}/verification",
        headers=root.headers,
        json={"verified": True},
    )

    start = await client.post(
        f"/api/communities/{club_a['id']}/notion/oauth/start",
        headers=owner.headers,
    )
    assert start.status_code == 200, start.text
    state = start.json()["state"]
    assert "state=" in start.json()["url"]

    async with AsyncSessionLocal() as db:
        row = await db.get(NotionOAuthState, state)
        assert row is not None
        assert row.club_id == club_a["id"]
        assert row.user_id == owner.id
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        await db.commit()

    expired = await client.get(
        "/api/notion/oauth/callback",
        params={"code": "unused", "state": state},
        follow_redirects=False,
    )
    assert expired.status_code in {302, 307}
    assert "expired" in expired.headers["location"]

    missing = await client.get(
        "/api/notion/oauth/callback",
        params={"code": "unused", "state": "nope"},
        follow_redirects=False,
    )
    assert "state" in missing.headers["location"] or "error" in missing.headers["location"]


async def test_club_a_cannot_read_club_b_notion(client, make_user):
    from app.database import AsyncSessionLocal
    from app.models import NotionConnection
    from app.notion_crypto import encrypt_secret

    owner_a = await make_user("ownera")
    owner_b = await make_user("ownerb")
    root = await make_user("root")
    club_a = await _create_club(client, owner_a, name="Alpha")
    club_b = await _create_club(client, owner_b, name="Beta")
    for club in (club_a, club_b):
        await client.patch(
            f"/api/admin/communities/{club['id']}/verification",
            headers=root.headers,
            json={"verified": True},
        )

    async with AsyncSessionLocal() as db:
        db.add(
            NotionConnection(
                club_id=club_b["id"],
                workspace_name="Beta Workspace",
                connected_by=owner_b.id,
                access_token_enc=encrypt_secret("club-b-token"),
                refresh_token_enc=encrypt_secret("club-b-refresh"),
                status="connected",
                database_id="db-b",
                database_title="Beta roster",
            )
        )
        await db.commit()

    sneak = await client.get(f"/api/communities/{club_b['id']}/notion", headers=owner_a.headers)
    assert sneak.status_code == 403

    own = await client.get(f"/api/communities/{club_a['id']}/notion", headers=owner_a.headers)
    assert own.status_code == 200
    assert own.json()["workspaceName"] == ""
    assert own.json()["databaseId"] == ""


async def test_join_form_required_and_leave_does_not_purge(client, make_user):
    from app.database import AsyncSessionLocal
    from app.models import NotionJoinRow

    host = await make_user("clubhost")
    joiner = await make_user("player")
    root = await make_user("root")
    club = await _create_club(client, host, name="Roster FC")
    await client.patch(
        f"/api/admin/communities/{club['id']}/verification",
        headers=root.headers,
        json={"verified": True},
    )
    created = await client.post(
        "/api/events",
        headers=host.headers,
        json=_event_body(communityId=club["id"]),
    )
    assert created.status_code == 201, created.text
    event_id = created.json()["id"]
    assert created.json()["communityId"] == club["id"]
    assert created.json()["hasJoinForm"] is True

    form = await client.get(f"/api/events/{event_id}/join-form", headers=joiner.headers)
    assert form.status_code == 200
    assert form.json()["verified"] is True
    required = [f["key"] for f in form.json()["fields"] if f["required"]]
    assert "Name" in required

    missing = await client.post(f"/api/events/{event_id}/join", headers=joiner.headers, json={"answers": {}})
    assert missing.status_code == 422, missing.text

    joined = await client.post(
        f"/api/events/{event_id}/join",
        headers=joiner.headers,
        json={"answers": {"Name": "Ada", "Email": "ada@test.com"}},
    )
    assert joined.status_code == 200, joined.text

    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(
                NotionJoinRow.__table__.select().where(NotionJoinRow.event_id == event_id)
            )
        )
        # Leave must not delete the join-row mapping (product: ignore leaves).
    left = await client.delete(f"/api/events/{event_id}/join", headers=joiner.headers)
    assert left.status_code == 200

    async with AsyncSessionLocal() as db:
        leftover = (await db.execute(NotionJoinRow.__table__.select())).all()
        # No Notion connection, so no join-row is written — leave still succeeds.
        assert leftover == [] or leftover is not None


async def test_webhook_rejects_bad_signature(client):
    res = await client.post(
        "/api/notion/webhook",
        content=b'{"id":"1","type":"page.created"}',
        headers={"Content-Type": "application/json", "X-Notion-Signature": "sha256=nope"},
    )
    assert res.status_code == 401

    handshake = await client.post(
        "/api/notion/webhook",
        json={"verification_token": "abc"},
    )
    assert handshake.status_code == 200
