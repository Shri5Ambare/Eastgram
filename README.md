# EduGram — Backend

Backend for **EduGram**, a private school-focused social media platform (Instagram-style)
with controlled communication, reels, stories, polls, voting, clubs, events and achievements.

Built per the PRD stack: **NestJS · PostgreSQL · Prisma · Redis · Socket.IO · Cloudflare R2 · Firebase Cloud Messaging**.

---

## Features

| Domain | Endpoints | Notes |
| --- | --- | --- |
| **Auth** | `/auth/register·login·refresh·logout` | JWT access + rotating refresh tokens (argon2 hashing) |
| **Users** | `/users/me`, `/users/:username`, role/permission admin | 5 roles: Student, Authorized Student, Teacher, Admin, Principal |
| **Feed / Reels / Stories** | `/feed`, `/reels`, `/stories`, `/posts` | Stories auto-expire after 24h |
| **Comments / Reactions** | `/posts/:id/comments`, `/posts/:id/react` | Threaded replies, 5 reaction types |
| **Follows** | `/users/:username/follow`, follow requests | Private profiles require approval |
| **Messaging** | `/conversations`, realtime via Socket.IO | **Permission-controlled** (see below) |
| **Groups / Clubs** | `/groups` | Creation permission-controlled; join policies |
| **Polls / Voting** | `/polls` | Quick polls, Elections, **Miss & Mister School pageants** |
| **Events** | `/events`, RSVP | |
| **Achievements** | `/achievements` | Staff-awarded, catalog-based |
| **Notifications** | `/notifications`, FCM push + realtime | |
| **Media** | `/media/presign·confirm` | Direct-to-R2 presigned uploads |

### Messaging rules (from the PRD)

"Students cannot freely message others." Enforced in
[`messaging.permissions.ts`](src/modules/messaging/messaging.permissions.ts) via the
`messagePermission` field on each user:

- `NONE` — cannot send at all
- `REPLY_ONLY` — can message staff and reply in existing threads, but cannot DM peers
- `CLASSMATES` — can message classmates + staff
- `FULL` — can message anyone in the school

Staff (Teacher/Admin/Principal) always have full messaging rights. Group and event
creation are likewise restricted to Authorized Students and staff.

---

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Copy env and fill in secrets
cp .env.example .env

# 3. Start Postgres + Redis (Docker)
docker compose up -d postgres redis

# 4. Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate

# 5. Seed demo data (school, classes, users, polls)
npm run db:seed

# 6. Run the API
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger docs: `http://localhost:3000/api/v1/docs`
- Health: `GET /api/v1/health`

Demo login after seeding: username `principal`, password `Password123!`.

### Run everything in Docker

```bash
docker compose up --build
```

---

## Architecture

```
src/
├── config/            # env loading + Joi validation
├── common/            # guards, decorators, filters, interceptors, DTOs
├── prisma/            # PrismaService (global)
├── redis/             # ioredis client + presence helpers (global)
├── realtime/          # Socket.IO gateway, RealtimeService, Redis adapter
└── modules/
    ├── auth/          # JWT strategy, register/login/refresh
    ├── users/         # profiles + admin role/permission management
    ├── schools/       # schools + classes (bootstrap)
    ├── follows/       # social graph + follow requests
    ├── media/         # Cloudflare R2 presigned uploads
    ├── posts/         # feed, reels, stories, comments, reactions
    ├── messaging/     # permission-controlled DMs + group chat
    ├── groups/        # clubs / committees
    ├── polls/         # quick polls, elections, pageant voting
    ├── events/        # events + RSVP
    ├── achievements/  # awards + catalog
    ├── notifications/ # persisted + realtime + FCM push, device tokens
    ├── health/        # liveness/readiness probe
    └── tasks/         # cron: story expiry, poll open/close
```

### Cross-cutting

- **Global JWT auth** — every route requires a bearer token unless marked `@Public()`.
- **RBAC** — `@Roles(...)` + `RolesGuard`.
- **Rate limiting** — `@nestjs/throttler`.
- **Consistent responses** — success envelope via `TransformInterceptor`, errors via `AllExceptionsFilter` (incl. Prisma error mapping).
- **Realtime scaling** — Socket.IO Redis adapter fans out events across instances.

---

## Realtime (Socket.IO)

Connect with the JWT access token:

```js
const socket = io('http://localhost:3000', { auth: { token: accessToken } });
socket.on('message:new', (m) => { /* ... */ });
socket.on('notification:new', (n) => { /* ... */ });
```

Rooms: `user:<userId>` (per-user), `conversation:<id>` (chat threads).

---

## Roadmap (per PRD)

- **Phase 1 — MVP:** auth, feed, reels, stories, comments, follows, messaging, notifications, media. ✅ implemented
- **Phase 2 — Elections & Clubs:** groups, polls/elections, pageant voting, events. ✅ implemented
- **Phase 3 — AI Assistant & Yearbook:** future work (hooks left in achievements + media).
