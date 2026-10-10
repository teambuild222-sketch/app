/**
 * Generates SIMSOR-Architecture-Plan.docx — one-shot doc export of the
 * production architecture plan. Run: node scripts/generate-architecture-doc.mjs
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
} from 'docx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '../../SIMSOR-Architecture-Plan.docx');

const BRAND = '1F2937';
const ACCENT = '2563EB';
const LIGHT = 'F3F4F6';

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, color: BRAND })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, color: ACCENT })],
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, ...opts })],
  });
}

function runs(parts) {
  return new Paragraph({
    spacing: { after: 120 },
    children: parts.map(([text, o]) => new TextRun({ text, ...(o ?? {}) })),
  });
}

function bullet(text, opts = {}) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, ...opts })],
  });
}

function bullet2(text, opts = {}) {
  return new Paragraph({
    bullet: { level: 1 },
    spacing: { after: 60 },
    children: [new TextRun({ text, ...opts })],
  });
}

function numbered(text, ref = 'steps') {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text })],
  });
}

function cell(text, { header = false, width } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: header
      ? { type: ShadingType.CLEAR, fill: BRAND }
      : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: header,
            color: header ? 'FFFFFF' : undefined,
            size: 20,
          }),
        ],
      }),
    ],
  });
}

function table(headerRow, rows, widths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headerRow.map((t, i) => cell(t, { header: true, width: widths?.[i] })),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map((t, i) => cell(t, { width: widths?.[i] })),
          }),
      ),
    ],
  });
}

function spacer() {
  return new Paragraph({ spacing: { after: 120 }, children: [] });
}

function code(text) {
  return new Paragraph({
    spacing: { after: 60 },
    shading: { type: ShadingType.CLEAR, fill: LIGHT },
    children: [new TextRun({ text, font: 'Consolas', size: 18 })],
  });
}

const doc = new Document({
  numbering: {
    config: ['steps', 'flow', 'w1', 'w2', 'w3', 'w4', 'sum'].map((reference) => ({
      reference,
      levels: [
        {
          level: 0,
          format: 'decimal',
          text: '%1.',
          alignment: AlignmentType.START,
        },
      ],
    })),
  },
  styles: {
    default: {
      document: {
        run: { font: 'Calibri', size: 22 },
      },
    },
  },
  sections: [
    {
      children: [
        // ============ TITLE ============
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 1200, after: 200 },
          children: [
            new TextRun({ text: 'SIMSOR', bold: true, size: 64, color: BRAND }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: 'Production Architecture & Launch Plan',
              size: 36,
              color: ACCENT,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 2000 },
          children: [
            new TextRun({
              text: 'Android + iOS  |  Pay-as-you-grow infrastructure  |  July 2026',
              size: 24,
              color: '6B7280',
            }),
          ],
        }),

        // ============ 1. CURRENT STATE ============
        h1('1. Current State of the Project'),
        p('The app is not starting from zero. The repository already contains:'),
        bullet('React 19 + Vite 8 single-page app with Home, Explore (Leaflet map), Discover, Chat, and Profile screens.'),
        bullet('Capacitor 8 native shells for Android (com.simsor.app) and iOS.'),
        bullet('An API layer (frontend/src/api/) with an Axios client, DTO types, and a mock/live switch driven by VITE_API_URL.'),
        bullet('A FastAPI stub (backend/app/main.py) matching the REST contract in backend/API_CONTRACT.md.'),
        bullet('A client-side feed ranking algorithm in frontend/src/components/HomeFeed/feedAlgorithm.ts.'),
        bullet('Store release scripts and documentation (frontend/STORE_RELEASE.md).'),
        spacer(),
        h2('Status by layer'),
        table(
          ['Layer', 'Status'],
          [
            ['Mobile shell', 'Capacitor 8; Android + iOS projects; splash, status bar, and back-button handling in initMobileApp.ts'],
            ['Auth', 'Login/signup wired to api/auth.ts; mock mode uses a localStorage flag, live mode stores a Bearer token'],
            ['Profile save', 'Wired to profileApi.ts'],
            ['Home feed, map, chat, dab-ups, communities', 'localStorage only (15+ keys across chatStore.ts, exploreEvents.ts, feedAlgorithm.ts, etc.)'],
            ['Backend', 'In-memory users, no JWT validation; GET /api/events returns an empty list'],
            ['Realtime', 'socket.io-client is installed but not used'],
            ['Maps', 'Leaflet + OpenStreetMap tiles (free)'],
            ['Unused paid deps', 'Mapbox, Google Maps, React Query, Zustand installed but not wired'],
          ],
          [30, 70],
        ),
        spacer(),
        p('Important: most of backend/app/, frontend/src/api/, and the native projects are uncommitted. Commit and tag a baseline before starting infrastructure work.', { bold: true }),

        // ============ 2. TARGET ARCHITECTURE ============
        h1('2. Target Architecture (Pay-As-You-Grow)'),
        p('Every service below is free or nearly free at low usage and only costs more as real traffic grows. There are no fixed enterprise plans.'),
        h2('Architecture overview'),
        bullet('Clients: Capacitor Android and iOS apps (one shared web codebase).'),
        bullet('Edge: Cloudflare for DNS, HTTPS, CDN, and basic DDoS protection (free tier).'),
        bullet('API: FastAPI hosted on Render, Railway, or Fly.io.'),
        bullet('Data: PostgreSQL (Neon or Supabase), Cloudflare R2 for media, Upstash Redis for cache/rate limits.'),
        bullet('Realtime: Supabase Realtime or self-hosted WebSockets, added when chat goes live.'),
        bullet('Ops: Sentry (errors), PostHog (analytics), Firebase Cloud Messaging (push).'),
        spacer(),
        h2('Service picks: role, reason, and cost model'),
        table(
          ['Service', 'Role in SIMSOR', 'Why this one', 'Cost model'],
          [
            ['Capacitor 8 (already in repo)', 'Wraps the Vite build as native apps', 'Already built; one codebase for both stores', 'Free (store fees only)'],
            ['Cloudflare', 'DNS, HTTPS, CDN, DDoS basics', 'Generous free tier; no per-user fee', 'Free, Pro ~$20/mo only if needed'],
            ['FastAPI + Uvicorn', 'REST API matching API_CONTRACT.md', 'Matches the existing stub and frontend types', 'Free tier hosting, then ~$7–25/mo'],
            ['Render / Railway / Fly.io', 'Runs the FastAPI container', 'Free or low starter tiers; scale by RAM/CPU', '$0–7/mo to start'],
            ['Neon or Supabase Postgres', 'Users, events, posts, follows, dab-ups, chat', 'Serverless Postgres; free tier; sleeps when idle', 'Free, then ~$19/mo+ at growth'],
            ['Supabase (optional all-in-one)', 'Postgres + Auth + Storage + Realtime', 'Can replace separate auth and chat infra early', 'Free, Pro at higher limits'],
            ['Cloudflare R2', 'Event images, avatars, post media', 'No egress fees (major saving vs S3)', 'Pennies at start'],
            ['Upstash Redis', 'Rate limiting, session cache, hot feed pages', 'Serverless; free tier covers early users', 'Free, then usage-based'],
            ['Leaflet + OpenStreetMap', 'Explore map (already in use)', 'No Mapbox/Google bill', 'Free'],
            ['Firebase Cloud Messaging', 'Push: dab-ups, event reminders, chat', 'Free; works with the Capacitor push plugin', 'Free'],
            ['Resend or Brevo', 'Signup / password-reset email', 'Free tiers at low volume', 'Free, then per-email'],
            ['Sentry', 'Crash and API error tracking', 'Free tier for small projects', 'Free'],
            ['PostHog or Firebase Analytics', 'Funnels: signup, create event, join', 'Free tier', 'Free'],
          ],
          [18, 27, 30, 25],
        ),
        spacer(),
        h2('What NOT to buy early'),
        bullet('Mapbox / Google Maps — Leaflet already works; only switch if you need turn-by-turn navigation.'),
        bullet('Dedicated chat SaaS (Stream, Sendbird) — expensive; use Postgres + WebSockets or Supabase Realtime first.'),
        bullet('Kubernetes / multi-region — overkill until thousands of daily active users.'),
        bullet('Fixed enterprise DB plans — serverless Postgres (Neon/Supabase) scales with actual usage.'),
        spacer(),
        h2('Recommended stack for this codebase'),
        runs([
          ['Option A — FastAPI-centric (best fit for the repo): ', { bold: true }],
          ['FastAPI → Neon Postgres → R2 → Upstash → FCM. Keeps the existing API contract and frontend service layer.'],
        ]),
        runs([
          ['Option B — Faster MVP, less backend code: ', { bold: true }],
          ['Supabase (Auth + DB + Storage + Realtime) plus a thin FastAPI for custom feed logic.'],
        ]),
        p('Given API_CONTRACT.md and src/api/* already exist, Option A is recommended. Use Supabase only to skip building auth/chat storage yourself.'),

        // ============ 3. BACKEND BUILD ORDER ============
        h1('3. Backend: What to Build, in Order'),
        p('The contract in backend/API_CONTRACT.md is the roadmap. Implement in four phases.'),

        h2('Phase 1 — Store-review ready (1–2 weeks)'),
        table(
          ['Endpoint', 'Backed by', 'Notes'],
          [
            ['POST /api/auth/login, signup, logout', 'Postgres + bcrypt + JWT', 'Replace dev tokens; validate Bearer on all protected routes'],
            ['GET / PATCH /api/me', 'users table', 'Mirror the UserProfile type in types.ts'],
            ['GET /api/health', '—', 'Already exists'],
          ],
          [35, 25, 40],
        ),
        spacer(),
        p('Minimum database tables:', { bold: true }),
        bullet('users — id, username, email, password_hash, full_name, bio, location, avatar_url, sports[], entertainment[]'),
        bullet('sessions — or stateless JWT only (fine at the start)'),
        spacer(),
        p('Python packages to add to requirements.txt:', { bold: true }),
        code('sqlalchemy>=2.0'),
        code('asyncpg            # or psycopg2'),
        code('alembic            # migrations'),
        code('python-jose[cryptography]   # JWT'),
        code('passlib[bcrypt]    # password hashing'),
        code('python-multipart   # file uploads later'),
        code('boto3              # R2 / S3-compatible storage'),

        h2('Phase 2 — Core product (2–4 weeks)'),
        table(
          ['Feature', 'Endpoints', 'Tables'],
          [
            ['Events / map', 'GET, POST, DELETE /api/events', 'events (lat/lng, category, organizer_id, game_access) matching EventDto'],
            ['Feed posts', 'GET, POST /api/posts; POST /api/posts/:id/like', 'posts, post_likes'],
            ['Follow graph', 'POST, DELETE /api/follow/:userId', 'follows'],
            ['Dab-ups', 'Contract routes in socialApi.ts', 'dab_up_requests'],
            ['Join event', 'POST /api/events/:id/join', 'event_rsvps'],
          ],
          [22, 40, 38],
        ),
        spacer(),
        p('Frontend wiring in this phase:', { bold: true }),
        bullet('exploreEvents.ts → eventsApi.ts'),
        bullet('publishContent.ts → new postsApi.ts'),
        bullet('feedAlgorithm.ts → fetch follows/affinity from the API (see Section 4)'),

        h2('Phase 3 — Chat and communities (3–5 weeks)'),
        table(
          ['Endpoint', 'Purpose'],
          [
            ['GET /api/conversations', 'Already in the contract'],
            ['GET /api/conversations/:id/messages?cursor=', 'Paginated message history'],
            ['POST /api/conversations/:id/messages', 'Send a message'],
            ['WebSocket /chat or Supabase Realtime', 'Live message delivery'],
          ],
          [45, 55],
        ),
        spacer(),
        p('Tables: conversations, conversation_members, messages, communities. The one-community-per-user rule currently in communitiesStore.ts must be enforced server-side.'),

        h2('Phase 4 — Scale helpers (when DAU exceeds ~500–1,000)'),
        table(
          ['Tool', 'Helps with'],
          [
            ['Upstash Redis', 'Cache feed pages, rate-limit login, dedupe interaction beacons'],
            ['Background worker (Celery/ARQ or host cron)', 'Expire old events, send reminder pushes, rebuild feed scores nightly'],
            ['PostGIS (Neon extension)', 'Radius queries for GET /api/events?lat=&lng=&radiusKm= (already in the contract)'],
            ['Cloudflare CDN', 'Cache public event images served from R2'],
          ],
          [35, 65],
        ),

        // ============ 4. FEED ALGORITHM ============
        h1('4. Feed Algorithm'),
        h2('How it works today (feedAlgorithm.ts, all client-side)'),
        numbered('Posts are split into "Boosting" (people you follow) and "Suggested".'),
        numbered('Following feed is chronological by postedAgoHours; past events sink to the bottom.'),
        numbered('Suggested posts are scored (see weights below).'),
        numbered('Each post carries a reason label: following, interest, affinity, or popular.'),
        spacer(),
        table(
          ['Signal', 'Weight'],
          [
            ['Explicit interest match (exact category)', '+45'],
            ['Interest match (main category only)', '+18'],
            ['Learned category affinity (dwell + interactions)', 'up to +40'],
            ['Learned author affinity', 'up to +25'],
            ['Popularity (likes / 500)', 'up to +12'],
            ['Recency (decays over ~72 hours)', 'up to +30'],
            ['Past event penalty', '−28'],
          ],
          [70, 30],
        ),
        spacer(),
        p('Interaction points recorded: join = 16, repost = 12, like = 10, comment = 8, open location = 6, open profile = 5. Dwell time counts between 0.6 s and 20 s per view. The Discover page does not use this ranking; it filters by category and search only.'),

        h2('Production design (same logic, server-side data)'),
        p('Keep the scoring weights; move the data off the device so the feed follows the user across devices and can use community-wide signals.'),
        p('Request flow:', { bold: true }),
        numbered('App batches interaction beacons (dwell, like, join) to POST /api/feed/events every ~30 seconds or when backgrounded.', 'flow'),
        numbered('App requests GET /api/feed?cursor=&limit=20.', 'flow'),
        numbered('API checks a Redis cache for the first page, otherwise queries Postgres for following posts, the candidate pool, and the user\u2019s interests/affinity aggregates.', 'flow'),
        numbered('API responds with { following[], suggested[], nextCursor }.', 'flow'),
        spacer(),
        p('Server tables:', { bold: true }),
        bullet('user_interests — from signup/profile.'),
        bullet('user_affinity — (user_id, dimension_type, dimension_key, score) for category and author.'),
        bullet('feed_interactions — append-only log (like, join, dwell_ms) for replay and debugging.'),
        spacer(),
        p('Scoring (port the existing constants, then add production-only signals):', { bold: true }),
        code('score = 0'),
        code('if category in user_interests: score += 45          # reason: interest'),
        code('elif main_category in user_interests: score += 18'),
        code('score += min(cat_affinity, 60) / 60 * 40'),
        code('score += min(author_affinity, 60) / 60 * 25'),
        code('score += min(likes, 500) / 500 * 12'),
        code('score += max(0, 30 - hours_since_post / 72 * 30)'),
        code('if event_past: score -= 28'),
        code('# Production additions:'),
        code('score += geo_boost(km_from_user)        # +0..15 nearby events'),
        code('score -= seen_recently_penalty(post_id) # avoid repeats'),
        code('score -= diversity_penalty_if_same_author_3x_in_row'),
        spacer(),
        p('Client changes:', { bold: true }),
        bullet('HomePostCard sends batched beacons instead of writing localStorage affinity.'),
        bullet('Layout.tsx loads GET /api/feed?cursor= instead of rebuilding from local posts.'),
        bullet('Keep an offline fallback: cached first page if the API is unreachable.'),
        spacer(),
        p('Precomputing feeds is unnecessary at 100 users. At roughly 5,000+ DAU, run a nightly job that writes feed_candidates(user_id, post_id, score) for active users and serve page one from Redis.'),
        p('Discover feed: reuse the suggested scoring with a mainCategory filter, or a simpler "trending in city" (same score plus geo filter).'),

        // ============ 5. MIGRATION MAP ============
        h1('5. Frontend → Backend Migration Map'),
        p('frontend/BACKEND.md already defines the mock/live switch. Migrate modules in this order:'),
        table(
          ['Local module', 'API module', 'Priority'],
          [
            ['api/auth.ts, profileApi.ts', 'Done (partial)', 'Done'],
            ['exploreEvents.ts', 'eventsApi.ts', 'P0'],
            ['publishContent.ts + homeFeed.ts', 'new postsApi.ts + feedApi.ts', 'P0'],
            ['feedAlgorithm.ts', 'Server scoring + client beacons', 'P1'],
            ['profileData.ts (dab-ups)', 'socialApi.ts', 'P1'],
            ['chatStore.ts', 'socialApi.ts + WebSocket', 'P2'],
            ['communitiesStore.ts', 'new communitiesApi.ts', 'P2'],
            ['audienceLists.ts', 'part of events API (gameAccess)', 'P2'],
          ],
          [40, 40, 20],
        ),
        spacer(),
        p('Enable live mode in the production build:', { bold: true }),
        code('VITE_API_URL=https://api.yourdomain.com'),
        spacer(),
        bullet('client.ts already handles Bearer tokens and dispatches simsor-auth-expired on 401.'),
        bullet('Android release builds require HTTPS (network_security_config.xml blocks cleartext except localhost).'),
        bullet('Use @tanstack/react-query (already installed) to wrap eventsApi, feedApi, and profileApi for caching, retries, and pull-to-refresh.'),

        // ============ 6. MOBILE REQUIREMENTS ============
        h1('6. Mobile-Specific Requirements'),
        h2('Already done in the repo'),
        bullet('capacitor.config.json — com.simsor.app, HTTPS schemes, splash and status bar config.'),
        bullet('initMobileApp.ts — status bar, splash hide, Android back-button handling.'),
        bullet('STORE_RELEASE.md — AAB build, keystore, iOS archive flow.'),
        bullet('public/privacy.html — needed for store listings (location + accounts).'),
        h2('Still needed'),
        table(
          ['Item', 'Plugin / action'],
          [
            ['Push notifications', '@capacitor/push-notifications + FCM (Android) + APNs via Firebase'],
            ['Geolocation', '@capacitor/geolocation for the Explore map (iOS permission strings already set)'],
            ['Camera / photos', '@capacitor/camera for avatar, community photo, event image'],
            ['Deep links', '@capacitor/app URL handling, e.g. simsor.app/event/:id'],
            ['Secure token storage', '@capacitor/preferences or native secure storage instead of raw localStorage for the JWT'],
            ['OTA JS updates (optional, later)', 'Capgo — optional and paid; store updates are fine at launch'],
          ],
          [35, 65],
        ),
        spacer(),
        h2('Device testing during development'),
        bullet('Set VITE_API_URL=http://192.168.x.x:8000 with phone and PC on the same Wi-Fi.'),
        bullet('Or use a Cloudflare Tunnel / ngrok for HTTPS testing.'),
        bullet('Android emulator reaches the host machine via 10.0.2.2:8000 (already handled in client.ts).'),

        // ============ 7. SHIPPING CHECKLIST ============
        h1('7. Shipping Checklist (Android + iOS)'),
        h2('One-time accounts'),
        bullet('Google Play Console — about $25 one-time.'),
        bullet('Apple Developer Program — about $99/year; a Mac is required for the iOS archive.'),
        h2('Build commands (already scripted in the repo)'),
        code('cd frontend'),
        code('cp .env.example .env      # set VITE_API_URL=https://api.yourdomain.com'),
        code('npm run icons:store'),
        code('npm run release:sync      # production build + cap sync'),
        code('npm run release:android   # AAB for Play Store'),
        code('npm run cap:ios           # open Xcode on a Mac'),
        h2('Store listing must-haves'),
        bullet('Demo account for Apple review (login is required in the app).'),
        bullet('Privacy policy URL — host public/privacy.html at e.g. https://simsor.app/privacy.'),
        bullet('Data safety / App Privacy declarations: account, location, photos, messages.'),
        bullet('Screenshots: Home feed, Explore map, Profile, Chat.'),
        bullet('Content rating: social app with user-generated content.'),
        h2('Production API requirements before public launch'),
        bullet('HTTPS only (Let\u2019s Encrypt via Cloudflare or the hosting provider).'),
        bullet('CORS: replace allow_origins=["*"] in backend/app/main.py with the real app origins and Capacitor scheme.'),
        bullet('Rate-limit auth endpoints (Upstash or slowapi).'),

        // ============ 8. SCALE PLAN ============
        h1('8. Incremental Scale Plan (Users vs Spend)'),
        table(
          ['Stage', 'Users (rough)', 'Infrastructure', 'Est. monthly cost'],
          [
            ['0 — Dev / TestFlight', 'You + testers', 'Mocks or local FastAPI + tunnel', '₹0'],
            ['1 — Launch', '0–500', 'Render free + Neon free + R2 + Cloudflare', '₹0–500'],
            ['2 — Traction', '500–5k', 'Paid API tier ($7–25) + Neon scale + Redis', '₹2k–8k'],
            ['3 — Growth', '5k–50k', 'Bigger API, read replicas, feed cache, FCM volume', '₹8k–40k'],
            ['4 — Lakhs', '100k+', 'Multiple API instances, PostGIS, queue workers, CDN', 'Revenue-funded'],
          ],
          [22, 18, 40, 20],
        ),
        spacer(),
        p('Upgrade only when metrics justify it — never upfront.', { bold: true }),

        // ============ 9. 30-DAY PLAN ============
        h1('9. Immediate Action Plan (Next 30 Days)'),
        h2('Week 1 — Foundation'),
        numbered('Commit the untracked backend/app/, frontend/src/api/, android/, and ios/ folders.', 'w1'),
        numbered('Add Postgres + SQLAlchemy + real JWT auth to FastAPI.', 'w1'),
        numbered('Implement /api/me properly and validate Bearer tokens.', 'w1'),
        numbered('Deploy the API to Render/Railway with Neon; point VITE_API_URL at it.', 'w1'),
        h2('Week 2 — Core data'),
        numbered('Implement events CRUD + PostGIS radius query.', 'w2'),
        numbered('Wire ExplorePage and CreateEventModal to eventsApi.ts.', 'w2'),
        numbered('Add R2 upload for event images.', 'w2'),
        h2('Week 3 — Feed'),
        numbered('Create the posts table and post-creation from the home FAB.', 'w3'),
        numbered('Port the buildFeed scoring to a Python endpoint.', 'w3'),
        numbered('Wire the Layout.tsx home feed to the API.', 'w3'),
        h2('Week 4 — Ship beta'),
        numbered('Add FCM, geolocation, and camera plugins.', 'w4'),
        numbered('Closed testing on Play (internal track) + TestFlight.', 'w4'),
        numbered('Add Sentry and PostHog.', 'w4'),
        numbered('Start migrating simsor-* localStorage keys to simsor-* with a first-launch migration.', 'w4'),

        // ============ 10. CLEANUP ============
        h1('10. Repo Cleanup'),
        bullet('Remove unused paid dependencies (Mapbox, Google Maps) until actually needed — smaller bundles, faster builds.'),
        bullet('Keep only backend/app/main.py; archive the legacy backend/main.py (SIMSOR hello-world).'),
        bullet('Adopt React Query instead of adding more localStorage stores.'),
        bullet('Do one branding pass: simsor-* keys → simsor-* with a migration on first launch.'),

        // ============ SUMMARY ============
        h1('Summary'),
        p('The Android/iOS shells can ship today, but "functional for growing users" requires:'),
        numbered('Host FastAPI on a pay-as-you-go platform.', 'sum'),
        numbered('PostgreSQL (Neon or Supabase) as the source of truth.', 'sum'),
        numbered('Cloudflare R2 for media.', 'sum'),
        numbered('Migrate the localStorage stores to the existing API contract routes.', 'sum'),
        numbered('Move feed ranking server-side, reusing the weights already in feedAlgorithm.ts.', 'sum'),
        numbered('Add FCM + Capacitor plugins for location, camera, and push.', 'sum'),
        numbered('Follow STORE_RELEASE.md for the AAB and TestFlight builds.', 'sum'),
        spacer(),
        p('Total infrastructure at launch stays free or under roughly $10/month until there is real traffic — no lakh-user pricing upfront.', { bold: true }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);
console.log('Wrote', outPath);
