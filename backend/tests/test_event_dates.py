from datetime import datetime, timedelta, timezone


def _event_body(**extra):
    body = {
        "title": "Morning run",
        "category": "Running",
        "mainCategory": "Sports",
        "coordinates": [17.4, 78.4],
    }
    body.update(extra)
    return body


async def test_rejects_starts_at_before_today(client, make_user):
    host = await make_user("hoster")
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    res = await client.post("/api/events", headers=host.headers, json=_event_body(startsAt=yesterday.isoformat()))
    assert res.status_code == 422, res.text


async def test_rejects_calendar_date_before_today(client, make_user):
    host = await make_user("hoster")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    res = await client.post("/api/events", headers=host.headers, json=_event_body(date=yesterday))
    assert res.status_code == 422, res.text


async def test_allows_today_and_future(client, make_user):
    host = await make_user("hoster")
    tomorrow = datetime.now(timezone.utc) + timedelta(days=1)
    res = await client.post(
        "/api/events",
        headers=host.headers,
        json=_event_body(date=tomorrow.date().isoformat(), startsAt=tomorrow.isoformat()),
    )
    assert res.status_code == 201, res.text
