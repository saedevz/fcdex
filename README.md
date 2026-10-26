# FCDex Core Starter

A fresh TypeScript + Discord.js + Prisma foundation for FCDex.

## Important safety note

The Prisma schema in this starter is a **new-schema sketch**, not a verified mapping of the existing BallsDex/FCDex PostgreSQL database. Do not point it at the live database and run migrations. First inspect the hoster's backup and map the real schema, including existing IDs, foreign keys, soft deletes, and JSON fields.

## Requirements

- Node.js 24
- pnpm
- A Discord application and bot token
- A PostgreSQL database you control for local development

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill `.env` with your Discord application credentials and a **private development database**. Never commit `.env`.

Generate Prisma Client:

```bash
pnpm db:generate
```

For a fresh, empty development database only, create the starter tables:

```bash
pnpm db:migrate
```

Register commands for a development guild by setting `DEV_GUILD_ID` in `.env`, then run:

```bash
pnpm exec tsx src/deploy-commands.ts
pnpm dev
```

If `DEV_GUILD_ID` is empty, command deployment registers globally and may take time to propagate.

## Current features

- Discord.js client bootstrap
- `/ping` slash command
- Central environment validation
- Prisma client singleton
- Initial illustrative `Player`, `Club`, `OwnedClub`, and `Trade` models
- Graceful shutdown

## Next core milestones

1. Inspect a hoster-provided database backup without modifying it.
2. Decide whether to preserve the existing Python bot/database schema or perform a planned migration to a new TypeScript bot.
3. Implement repositories/services for players and club inventory.
4. Implement club spawn/catch with server-side validation.
5. Implement safe give/trade flows with database transactions and row locking / concurrency protection.
6. Add guild configuration, specials, groups, economy, privacy, moderation, and audit history.
7. Add tests before connecting to any live data.

## Design principles

- Clubs are the user-facing collectible; avoid BallsDex branding in commands and UI.
- Keep database operations in services/repositories, not in Discord command handlers.
- Re-check ownership, lock status, tradeability, player policy, and balance inside the transaction that performs a transfer.
- Preserve soft-delete semantics and history.
- Treat all database credentials and Discord tokens as secrets.
