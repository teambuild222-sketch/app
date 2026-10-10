from tests.test_moderation import make_event, make_post


async def test_comment_flow_and_counts(client, make_user):
    author = await make_user("author")
    fan = await make_user("fan")
    event = await make_event(client, author)
    post = await make_post(client, author, event["id"])

    res = await client.post(
        f"/api/posts/{post['id']}/comments", headers=fan.headers, json={"text": "  see you there!  "}
    )
    assert res.status_code == 201, res.text
    comment = res.json()
    assert comment["text"] == "see you there!"
    assert comment["authorUsername"] == "fan"

    listing = await client.get(f"/api/posts/{post['id']}/comments")
    assert [c["id"] for c in listing.json()] == [comment["id"]]

    feed = await client.get("/api/posts", headers=fan.headers)
    assert feed.json()[0]["comments"] == 1

    # Only the author of a comment can delete it.
    assert (
        await client.delete(f"/api/posts/{post['id']}/comments/{comment['id']}", headers=author.headers)
    ).status_code == 403
    assert (
        await client.delete(f"/api/posts/{post['id']}/comments/{comment['id']}", headers=fan.headers)
    ).status_code == 200

    # Empty comments are rejected.
    bad = await client.post(f"/api/posts/{post['id']}/comments", headers=fan.headers, json={"text": "   "})
    assert bad.status_code == 422


async def test_notifications_feed_for_like_comment_and_follow(client, make_user):
    author = await make_user("author")
    fan = await make_user("fan")
    event = await make_event(client, author)
    post = await make_post(client, author, event["id"])

    await client.post(f"/api/posts/{post['id']}/like", headers=fan.headers)
    await client.post(f"/api/posts/{post['id']}/comments", headers=fan.headers, json={"text": "nice"})
    await client.post(f"/api/follows/{author.id}", headers=fan.headers)

    res = await client.get("/api/notifications", headers=author.headers)
    assert res.status_code == 200
    body = res.json()
    kinds = {n["data"].get("type") for n in body["items"]}
    assert {"like", "comment"} <= kinds
    assert body["unread"] == len(body["items"]) >= 3

    # Fan's own actions never notify the fan.
    assert (await client.get("/api/notifications", headers=fan.headers)).json()["items"] == []

    assert (await client.post("/api/notifications/read", headers=author.headers)).status_code == 200
    after = (await client.get("/api/notifications", headers=author.headers)).json()
    assert after["unread"] == 0
    assert all(n["read"] for n in after["items"])

    assert (await client.get("/api/notifications")).status_code == 401
