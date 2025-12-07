# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cloudflare Worker API for Final Fantasy XIV community color palette presets. Built with **Hono** framework and **Cloudflare D1** (SQLite). Part of the xivdyetools ecosystem alongside core library, web app, and Discord bot.

## Commands

```bash
npm run dev                 # Start local dev server (port 8787)
npm run deploy              # Deploy to Cloudflare Workers
npm run deploy:production   # Deploy to production environment
npm run type-check          # TypeScript validation
npm run lint                # ESLint check

# Database
npm run db:migrate:local    # Apply schema to local D1
npm run db:migrate          # Apply schema to production D1

# Seed curated presets from xivdyetools-core
npx tsx scripts/migrate-presets.ts > seed.sql
wrangler d1 execute xivdyetools-presets --local --file=./seed.sql
```

## Architecture

```
src/
├── index.ts                 # Hono app entry, CORS, route mounting
├── types.ts                 # Cloudflare bindings (Env), domain types
├── middleware/
│   └── auth.ts              # Dual auth: Bot API secret + JWT
├── handlers/                # Hono routers with route definitions
│   ├── presets.ts           # CRUD, /mine, /featured, /rate-limit
│   ├── votes.ts             # POST/DELETE voting
│   ├── categories.ts        # List categories with counts
│   └── moderation.ts        # Pending queue, approve/reject, audit log
├── services/                # Business logic (stateless functions)
│   ├── preset-service.ts    # DB queries, duplicate detection
│   ├── moderation-service.ts # Local profanity + Perspective API
│   └── rate-limit-service.ts # 10 submissions/user/day limit
└── data/profanity/          # Multi-language word lists (6 langs)
```

## Key Patterns

### Authentication (middleware/auth.ts)
Two authentication methods checked in order:
1. **Bot Auth**: `Authorization: Bearer <BOT_API_SECRET>` + `X-User-Discord-ID`/`X-User-Discord-Name` headers
2. **Web Auth**: JWT bearer token (from OAuth worker) with HMAC-SHA256 validation

Guards: `requireAuth()`, `requireModerator()`, `requireUserContext()`

### Database (Cloudflare D1)
- Parameterized queries: `.bind()` for all user input
- Batch operations: `.batch()` for transactions (e.g., vote + update count)
- Type-safe: `.first<T>()`, `.all<T>()` with typed row interfaces

Tables: `presets`, `categories`, `votes`, `moderation_log`, `rate_limits`

### Moderation Pipeline
1. **Local filter**: Multi-language profanity check (fast, runs first)
2. **Perspective API**: ML toxicity scoring (optional, if API key configured)
3. **Manual review**: Moderators approve/reject via `/moderation/:id/status`

### Discord Integration
Service binding to `xivdyetools-discord-worker` for notifications (avoids HTTP webhook errors in Workers):
```typescript
env.DISCORD_WORKER?.fetch(request)
```

## Environment Variables

Set in `wrangler.toml`:
- `ENVIRONMENT`: development | production
- `API_VERSION`: v1
- `CORS_ORIGIN`: Allowed origin for web app

Set via `wrangler secret put`:
- `BOT_API_SECRET`: Shared secret for bot authentication
- `JWT_SECRET`: Shared with OAuth worker for web auth
- `MODERATOR_IDS`: Comma-separated Discord user IDs
- `PERSPECTIVE_API_KEY`: Google Perspective API (optional)

## API Route Structure

Base path: `/api/v1/`

- **Public**: `GET /presets`, `GET /presets/featured`, `GET /categories`
- **Authenticated**: `POST /presets`, `GET /presets/mine`, `POST/DELETE /votes/:id`
- **Moderator**: `GET /moderation/pending`, `PATCH /moderation/:id/status`

Query params for `GET /presets`: `category`, `search`, `status`, `sort`, `page`, `limit`, `is_curated`

## Development Notes

- Local D1 database stored in `.wrangler/state/`
- Use `requireUserContext()` when handler needs `userDiscordId` from auth
- Preset submissions auto-vote for the author
- Duplicate detection uses `dye_signature` (sorted dye IDs joined)
- Rate limiting queries presets table by author + creation date (UTC day)
