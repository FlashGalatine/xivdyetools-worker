# XIV Dye Tools - Community Presets API

Cloudflare Worker API for the XIV Dye Tools Community Presets system.

## Overview

This Worker provides:
- REST API for preset palette CRUD operations
- Voting system with deduplication
- Multi-language content moderation (local + Perspective API)
- Moderator actions with audit logging

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers and D1 access
- Wrangler CLI (`npm install -g wrangler`)

### Installation

```bash
npm install
```

### Create D1 Database

```bash
# Create the database
wrangler d1 create xivdyetools-presets

# Update wrangler.toml with the database_id from the output
```

### Apply Schema

```bash
# Local development
npm run db:migrate:local

# Production
npm run db:migrate
```

### Seed Curated Presets

```bash
# Generate seed SQL from xivdyetools-core presets
npx tsx scripts/migrate-presets.ts > seed.sql

# Apply locally
wrangler d1 execute xivdyetools-presets --local --file=./seed.sql

# Apply to production
wrangler d1 execute xivdyetools-presets --file=./seed.sql
```

### Configure Secrets

```bash
# Required
wrangler secret put BOT_API_SECRET

# Moderation
wrangler secret put MODERATOR_IDS          # Comma-separated Discord IDs
wrangler secret put PERSPECTIVE_API_KEY    # Google Perspective API (optional)

# Notifications
wrangler secret put MODERATION_WEBHOOK_URL # Discord webhook
wrangler secret put OWNER_DISCORD_ID       # Bot owner for DM alerts
wrangler secret put DISCORD_BOT_TOKEN      # For sending DMs
```

## Development

```bash
# Start local development server
npm run dev

# Type check
npm run type-check

# Deploy to Cloudflare
npm run deploy
```

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/presets` | List presets (filterable) |
| GET | `/api/v1/presets/featured` | Top 10 by votes |
| GET | `/api/v1/presets/:id` | Get single preset |
| GET | `/api/v1/categories` | List categories with counts |

### Authenticated (Bot)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/presets` | Submit new preset |
| POST | `/api/v1/votes/:id` | Vote for preset |
| DELETE | `/api/v1/votes/:id` | Remove vote |

### Moderator

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/moderation/pending` | List pending presets |
| PATCH | `/api/v1/moderation/:id/status` | Approve/reject preset |
| GET | `/api/v1/moderation/:id/history` | Moderation audit log |

## Authentication

Bot requests require:
```
Authorization: Bearer <BOT_API_SECRET>
X-User-Discord-ID: <discord_user_id>
X-User-Discord-Name: <display_name>
```

## Query Parameters

### GET /api/v1/presets

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| category | string | - | Filter by category |
| search | string | - | Search name/description/tags |
| status | string | `approved` | Filter by status |
| sort | string | `popular` | `popular`, `recent`, `name` |
| page | number | 1 | Page number |
| limit | number | 20 | Results per page (max 100) |
| is_curated | boolean | - | Filter curated/community |
