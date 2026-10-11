# SIMSOR API Contract

Base URL: value of `VITE_API_URL` (no trailing slash). Interactive docs: `GET /docs` (OpenAPI at `/openapi.json`).

Auth: `Authorization: Bearer <token>` on protected routes.

All JSON. Mirror types in `frontend/src/api/types.ts`.

**Errors** — `{ "detail": "Human readable message" }`. `401` = missing/invalid/expired/revoked token (the app clears its token and redirects to login). `403` = authenticated but not allowed (suspended account, blocked user, not an admin). `429` = rate limited; honour the `Retry-After` header (seconds).

**Rate limits** (per client IP, fixed window; shared via Redis when `REDIS_URL` is set): login 20/min, signup 10/min, forgot-password 5/min, reset-password 10/min, change-password 10/min, send-verification 5/min, verify-email 10/min, google/apple 20/min, uploads 30/min, reports 10/min, dab-ups 30/min, follows 60/min, posts 60/min, device-token 20/min, conversations 300/min. Only write methods (`POST/PUT/PATCH/DELETE`) are limited.

---

## Health

`GET /api/health` → `{ "ok": true }`

---

## Auth

`UserProfile`: `id`, `username`, `fullName`, `bio`, `location`, `avatarUrl`, `sports[]`, `entertainment[]`, and (own account only) `email`, `emailVerified`.

`AuthSession`: `{ "token": "<jwt>", "user": UserProfile }`.

Tokens are JWTs carrying a unique `jti`. They die when: they expire, are logged out (`/logout`), the user calls `/logout-all`, the password is changed/reset, or the account is suspended.

### `POST /api/auth/signup`
Body: `{ "username", "password", "fullName", "email?" }` → `AuthSession`. `409` if the username/email is taken. If an email is given, a verification email is sent.

### `POST /api/auth/login`
Body: `{ "username", "password" }` → `AuthSession`. `401` bad credentials, `403` suspended (or unverified email when `REQUIRE_EMAIL_VERIFICATION=true`).

### `POST /api/auth/logout`
Protected. Revokes **this** token only → `{ "ok": true }`.

### `POST /api/auth/logout-all`
Protected. Revokes every token issued so far (all devices, including this one) → `{ "ok": true }`. Sign in again afterwards.

### `POST /api/auth/forgot-password`
Body: `{ "email" }` → `{ "ok": true }` always (never reveals whether the email exists). Emails a single-use code (expires after `PASSWORD_RESET_EXPIRE_MINUTES`). In development with no `RESEND_API_KEY`, the response also contains `resetToken` for local testing.

### `POST /api/auth/reset-password`
Body: `{ "token", "newPassword" }` (min 6 chars) → `{ "ok": true }`. `400` for an invalid/used/expired token. Signs out all existing sessions and marks the email verified.

### `POST /api/auth/change-password`
Protected. Body: `{ "currentPassword", "newPassword" }` → `{ "ok": true, "token": "<fresh jwt>" }`. Every other device is signed out; swap the stored token for the returned one. `401` if the current password is wrong.

### `POST /api/auth/send-verification`
Protected. Emails a single-use verification code to the account's email → `{ "ok": true, "alreadyVerified"?: true }`. `400` if the account has no email. In development with no `RESEND_API_KEY`, includes `verificationToken`.

### `POST /api/auth/verify-email`
Body: `{ "token" }` → `{ "ok": true }`. `400` invalid/used/expired, or the account's email changed after the code was sent.

### `POST /api/auth/google` / `POST /api/auth/apple`
Body: `{ "idToken" }` (Apple also accepts `fullName?`) → `AuthSession`. `501` unless `GOOGLE_CLIENT_ID` / `APPLE_CLIENT_ID` is configured. Existing accounts are linked by email **only** when the provider reports the email as verified.

---

## Profile (`/api/me`)

- `GET /api/me` → `UserProfile`
- `PATCH /api/me` — any subset of profile fields → `UserProfile`
- `GET /api/me/stats` → `{ dabUps, following, followers, eventsJoined, eventsHosted }`
- `DELETE /api/me` → `{ "ok": true }` — deletes the account and everything it owns.
- `POST /api/me/device-token` `{ "platform": "ios"|"android"|"web", "token" }` → `{ "ok": true }`. Registers the FCM token for push. A token belongs to one account at a time (re-registering it on another account moves it).
- `DELETE /api/me/device-token?platform=` → `{ "ok": true }`. Call on logout; omit `platform` to remove all of the caller's tokens.

---

## Events

- `GET /api/events?lat=&lng=&radiusKm=&mainCategory=&limit=&offset=` → `EventDto[]`  
  Radius search uses an indexed bounding box then an exact great-circle filter. `lat` ∈ [-90, 90], `lng` ∈ [-180, 180], `radiusKm` ≥ 0, `limit` 1–500. Without `limit` all matches are returned (newest first).
- `GET /api/events/:id` → `EventDto`
- `POST /api/events` — event fields without `id` → `EventDto` (`organizerId` is always the caller)
- `DELETE /api/events/:id` → `{ "ok": true }`
- `POST /api/events/:id/join` / `DELETE /api/events/:id/join` → `JoinEventResponse` (joining notifies the organizer by push)
- `GET /api/events/joined/mine`, `GET /api/events/:id/conversation`

`EventDto`: `id`, `title`, `category`, `mainCategory` (`Sports`|`Entertainment`), `date`, `time`, `venue`, `location`, `description`, `coordinates` `[lat,lng]`, `attendees`, `image`, `organizerId`, `gameAccess?`, `inviteListIds`, `invitedMemberIds`, `startsAt?`.

---

## Posts, follows, social

- `GET/POST /api/posts`, `GET/DELETE /api/posts/:id`, `POST /api/posts/:id/like`
- `POST /api/follows/:userId` (`403` if blocked either way; notifies the target), `DELETE /api/follows/:userId`, `GET /api/follows/mine`
- `POST /api/dab-ups/request` `{ "userId" }` → `{ "status": "pending"|"dabbed_up" }`. `404` unknown user, `403` blocked either way. A pending request / acceptance pushes the other user.
- `GET /api/dab-ups/:userId` → `{ "status": "none"|"pending"|"dabbed_up" }`; `GET /api/dab-ups/mine` → `{ "userIds": [] }`
- `GET/POST /api/people-lists`, `PATCH/DELETE /api/people-lists/:id`
- `GET/POST /api/communities`, `GET /api/communities/by-creator/:userId`, `POST/DELETE /api/communities/:id/join`
- Official clubs: `GET /api/admin/communities`, `PATCH /api/admin/communities/:id/verification` `{ verified, note? }`
- Notion (verified club admins only; 403 otherwise): `GET/DELETE /api/communities/:id/notion`, `POST .../notion/oauth/start`, `GET /api/notion/oauth/callback`, `POST .../notion/database`, `PUT .../join-form`, `POST .../notion/sync`, `POST /api/notion/webhook`
- Join form: `GET /api/events/:id/join-form`, `POST /api/events/:id/join` may include `{ answers }`
- `GET /api/affinity/mine`, `POST /api/affinity/track`
- `POST /api/uploads` — multipart image/video → `201 { "url", "type": "image"|"video" }`

---

## Users

- `GET /api/users?q=&limit=` → `PublicUserProfile[]` — directory for starting a chat. Excludes the caller, suspended users, and anyone blocked in either direction. `q` matches username or full name (case-insensitive substring).
- `GET /api/users/:id/public` → `PublicUserProfile` (`id`, `username`, `fullName`, `avatarUrl`, `bio`, `location`, `eventsHosted`)

---

## Trust & safety

- `POST /api/reports` `{ "targetType": "user"|"post"|"message"|"event", "targetId", "reason?", "details?" }` → `{ "id", "ok": true }`
- `POST /api/blocks/:userId` (201), `DELETE /api/blocks/:userId`, `GET /api/blocks/:userId` → `{ "blocked" }`, `GET /api/blocks/mine` → `string[]`

Blocks are enforced in both directions for DMs, follows, dab-ups, and the user directory.

---

## Admin (moderation back-office)

Requires an admin: a user with `users.is_admin = true` **or** whose username is in `ADMIN_USERNAMES`. `403` otherwise.

- `GET /api/admin/stats` → `{ users, suspendedUsers, openReports, reviewingReports, events, posts }`
- `GET /api/admin/reports?status=open|reviewing|resolved|dismissed&targetType=&limit=&offset=` → `AdminReportDto[]` (newest first; `limit` 1–200)
- `GET /api/admin/reports/:id` → `AdminReportDto`
- `PATCH /api/admin/reports/:id` `{ "status"?: "open"|"reviewing"|"resolved"|"dismissed" (default "resolved"), "note"?, "action"?: "none"|"remove_content"|"suspend_user" }` → `AdminReportDto`
  - `remove_content`: deletes the reported **post** (with its likes and chat shares) or **message** (`400` for other target types, `404` if already gone).
  - `suspend_user`: suspends the account that owns the reported target (user / post author / message author / event organizer) and signs it out everywhere. Admins can't be suspended.
  - `resolved` / `dismissed` stamp `resolvedBy` / `resolvedAt`; resolving also pushes a thank-you to the reporter.
- `PATCH /api/admin/users/:id` `{ "suspended": bool }` → `{ "ok": true }` (reversible)

`AdminReportDto`: `id`, `reporterId`, `reporterUsername?`, `targetType`, `targetId`, `reason`, `details`, `status`, `resolutionNote`, `resolvedBy?`, `resolvedAt?`, `createdAt`.

---

## Chat (DM + group only)

Event group chats and communities are NOT part of this API; they stay client-side (`eventChats.ts` / `communitiesStore.ts`). New messages/prefs are also pushed live over Supabase Realtime (`postgres_changes` on `messages`/`conversation_members`/`message_reactions`) — see `backend/CHAT_SETUP.md`. This section only covers the REST surface. Offline members additionally get an FCM push (muted conversations and blocked senders are skipped).

### `GET /api/conversations` → `ConversationDto[]`
The caller's DMs + groups (excludes ones they've soft-deleted), pinned first then by last activity.

### `POST /api/conversations`
Body: `{ "type": "dm"|"group", "memberIds": string[], "name"?: string }` (`name` required for `group`; `memberIds` must have exactly one id for `dm`). Creating a `dm` that already exists returns the existing conversation. `403` if either side has blocked the other. Response: `ConversationDto`.

### `GET /api/conversations/:id/messages?before=&limit=` → `MessageDto[]`
Oldest-first. `before` (ISO datetime) paginates further back; `limit` defaults to 50, max 100. 404 if the caller isn't a member.

### `POST /api/conversations/:id/messages`
Body: `{ "kind": "text"|"image"|"video"|"post", "text"?, "mediaUrl"?, "sharedPostId"? }`. Response: `MessageDto`. `403` in a DM with a blocked user.

### `POST /api/conversations/:id/members` `{ "userId" }` → `ConversationDto`
Group admin only.

### `DELETE /api/conversations/:id/members/:userId` → `{ "ok": true }`
Group admin only; an admin can't remove themselves.

### `PATCH /api/conversations/:id/read` → `{ "ok": true }`

### `PATCH /api/conversations/:id/prefs`
Body: any subset of `{ "pinned", "muted", "hidden" }` (booleans). Response: `{ "ok": true, "pinned", "muted", "hidden" }`.

### `DELETE /api/conversations/:id` → `{ "ok": true }`
Soft-delete: hides the conversation for the caller only, never for other members.

### `POST /api/messages/:id/reactions` `{ "emoji" }` → `ChatReactionDto[]`
Toggles: reacting with the same emoji you already used removes it; a different emoji replaces it (one reaction per user per message). Returns the message's full reaction list.

`ConversationDto`: `id`, `type`, `name`, `avatarUrl`, `adminId?`, `members: ChatMemberDto[]`, `lastMessage?: MessageDto`, `unread`, `pinned`, `muted`, `createdAt`, `updatedAt`.
`ChatMemberDto`: `id`, `name`, `avatarUrl`, `role` (`admin`|`member`).
`MessageDto`: `id`, `conversationId`, `authorId`, `kind`, `text?`, `mediaUrl?`, `sharedPost?`, `reactions: ChatReactionDto[]`, `createdAt`.
`ChatReactionDto`: `emoji`, `userId`, `userName`.

---

## Push notification payloads

FCM `data.type` values the client should route on: `message` (`conversationId`, `messageId`), `follow` (`userId`), `dab_up_request` (`userId`), `dab_up` (`userId`), `event_join` (`eventId`, `userId`), `report_resolved` (`reportId`).
