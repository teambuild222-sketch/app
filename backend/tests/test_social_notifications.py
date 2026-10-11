async def _feed(client, user):
    return (await client.get("/api/notifications", headers=user.headers)).json()["items"]


async def test_dab_up_confirm_resolves_request(client, make_user):
    me = await make_user("myself")
    friend = await make_user("friend")

    await client.post("/api/dab-ups/request", headers=friend.headers, json={"userId": me.id})
    status = await client.get(f"/api/dab-ups/{friend.id}", headers=me.headers)
    assert status.json()["status"] == "incoming"
    request = next(n for n in await _feed(client, me) if n["data"]["type"] == "dab_up_request")
    assert request["data"]["userId"] == friend.id
    assert "status" not in request["data"]

    res = await client.post(f"/api/dab-ups/{friend.id}/accept", headers=me.headers)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "dabbed_up"

    resolved = next(n for n in await _feed(client, me) if n["data"]["type"] == "dab_up_request")
    assert resolved["data"]["status"] == "accepted"
    assert (await client.get(f"/api/dab-ups/{me.id}", headers=friend.headers)).json()["status"] == "dabbed_up"
    assert any(n["data"]["type"] == "dab_up" for n in await _feed(client, friend))
    mine = (await client.get("/api/me/stats", headers=me.headers)).json()
    theirs = (await client.get("/api/me/stats", headers=friend.headers)).json()
    assert mine["dabUps"] == 1
    assert theirs["dabUps"] == 1


async def test_dab_up_deny_clears_request(client, make_user):
    me = await make_user("myself")
    stranger = await make_user("stranger")

    await client.post("/api/dab-ups/request", headers=stranger.headers, json={"userId": me.id})
    res = await client.post(f"/api/dab-ups/{stranger.id}/deny", headers=me.headers)
    assert res.json()["status"] == "none"

    assert (await client.get(f"/api/dab-ups/{stranger.id}", headers=me.headers)).json()["status"] == "none"
    assert (await client.get(f"/api/dab-ups/{me.id}", headers=stranger.headers)).json()["status"] == "none"
    request = next(n for n in await _feed(client, me) if n["data"]["type"] == "dab_up_request")
    assert request["data"]["status"] == "denied"

    # Nothing to accept once denied.
    assert (await client.post(f"/api/dab-ups/{stranger.id}/accept", headers=me.headers)).status_code == 404


async def test_new_booster_notification(client, make_user):
    star = await make_user("star")
    fan = await make_user("fan")
    await client.post(f"/api/follows/{star.id}", headers=fan.headers)
    follow = next(n for n in await _feed(client, star) if n["data"]["type"] == "follow")
    assert follow["title"] == "New booster"
    assert follow["data"]["userId"] == fan.id


async def test_club_join_and_creator_updates_notify(client, make_user):
    owner = await make_user("owner")
    member = await make_user("member")

    club = (await client.post("/api/communities", headers=owner.headers, json={"name": "Night Runners"})).json()
    await client.post(f"/api/communities/{club['id']}/join", headers=member.headers)
    join = next(n for n in await _feed(client, owner) if n["data"]["type"] == "club_join")
    assert join["data"]["userId"] == member.id

    conv_id = club["conversationId"]
    await client.post(f"/api/conversations/{conv_id}/messages", headers=owner.headers, json={"text": "Run at 6am"})
    update = next(n for n in await _feed(client, member) if n["data"]["type"] == "club_update")
    assert update["title"] == "Night Runners"
    assert "Run at 6am" in update["body"]

    # A regular member's message is chat, not a club update.
    await client.post(f"/api/conversations/{conv_id}/messages", headers=member.headers, json={"text": "in!"})
    assert not any(n["data"]["type"] == "club_update" for n in await _feed(client, owner))
