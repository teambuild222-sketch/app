# Official clubs → Notion

Verified community pages can send event join-form answers into that club’s Notion database.

This is **SIMSOR → Notion** (write a row). Leaving an event does not change Notion.

## Team verification

1. A club is created in the app as usual.
2. Review the checklist on **Profile → Communities → Team review** (platform admins only: `is_admin` or `ADMIN_USERNAMES`).
3. When the club has personally met your requirements, tap **Mark verified**.
4. Un-verifying pauses Notion writes and hides the integration. Data is not deleted.

Only verified clubs can connect Notion or attach events as official club events.

## Notion setup

1. Create a **public** connection at [notion.so/profile/integrations](https://www.notion.so/profile/integrations).
2. Add redirect URI: `https://YOUR-API/api/notion/oauth/callback`  
   Local: `http://localhost:8000/api/notion/oauth/callback`
3. Capabilities: read content + insert content (needed to add database rows).
4. Optional: Webhooks tab → URL `https://YOUR-API/api/notion/webhook`. Copy the `verification_token` into `NOTION_WEBHOOK_SECRET`.
5. Set env vars (see `.env.example`):

```
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=https://YOUR-API/api/notion/oauth/callback
NOTION_WEBHOOK_SECRET=
TOKEN_ENCRYPTION_KEY=   # long random string
PUBLIC_APP_URL=https://YOUR-FRONTEND
```

6. Run `alembic upgrade head`.

## Club admin flow

1. Open the verified club → **Integrations**.
2. **Connect Notion** (OAuth + Notion’s page picker). Share the attendee database.
3. Pick that database. Sheet columns (Name, Email, Phone, …) are created as Notion properties automatically.
4. Edit the sheet any time. New columns sync to Notion.
5. Host an event as that official club. Joiners fill the sheet; a row is created in Notion.

## Capacitor

Register the same HTTPS redirect URI. After OAuth, Notion returns to the API, which redirects to `PUBLIC_APP_URL/?notion=connected&club=…`. On native, that should be your hosted web origin or a deep link you already handle.

## Privacy

Tokens are encrypted at rest and never returned to clients. Every Notion query is scoped by `club_id`. Club A cannot read club B’s connection or join rows.
