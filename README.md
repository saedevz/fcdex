<div align="center">

# ⚽ FCDex

### Football Club Dex for Discord

**Current bot configuration version: `1.0.0`**

Collect football clubs. Discover your favourites. Trade with friends. Build your collection.

[![Discord](https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/servers/fcdex-1462526346533273775)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/saedevz/fcdex)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg?style=for-the-badge)](LICENSE)

**[Community](https://discord.com/servers/fcdex-1462526346533273775) · [Wiki](https://github.com/saedevz/fcdex/wiki) · [Report a bug](https://github.com/saedevz/fcdex/issues)**

</div>

---

## About FCDex

FCDex is an open-source Discord bot built around collecting football clubs. Collectors can catch clubs, build a collection, earn coins, trade clubs, and take part in matchday activities.

The project is written in TypeScript and runs on [Bun](https://bun.sh/). Its data layer uses Prisma with an embedded [PGlite](https://pglite.dev/) database adapter.

## Features

- **Club collection** — catch football clubs and build a personal collection.
- **Spawn and catch system** — clubs appear in configured Discord channels and collectors compete to sign them.
- **Rarity tiers** — clubs are selected and displayed using configured rarity weights and thresholds.
- **Squad and collection tools** — inspect collection progress and individual club instances.
- **Economy** — daily wages, catch rewards, balances, and leaderboards.
- **Transfers** — offer clubs and coins to other collectors, inspect incoming offers, and view trade history.
- **Matchday** — play friendlies and challenge other collectors to club duels.
- **Pitch controls** — configure spawn channels, inspect pitch status, force drops, manage pitch bans, and inspect spawn waves.
- **Guard** — apply the configured guild anti-farming checks.
- **Modular dugout** — enable or disable feature modules through the local configuration.

The enabled modules in the generated starter configuration are `clubs`, `squad`, `transfers`, `matchday`, `pitch`, `guard`, and `info`.

## Admin panel

FCDex includes a private web-based admin panel served by the existing Bun process. It reuses the bot's existing Prisma client and embedded PGlite database; it does not create a separate backend service or database connection.

### Admin panel sections

| Section | What it does | Write access |
| --- | --- | --- |
| Overview | Shows live totals for clubs, players, club instances, specials, guilds, pending trades, and blacklist entries. | Read only |
| Clubs | Search, create, edit, and delete club catalogue records. | Create / edit / delete |
| Specials | Search, create, edit, and delete special editions and kit variants. | Create / edit / delete |
| Players | Inspect a player, collection details, policy values, and trade count; add, subtract, or set coin balance. | Read / coin adjustment |
| Guilds | Create, edit, and delete per-guild spawn configuration. | Create / edit / delete |
| Trades | Inspect trade participants, status, coin amounts, expiry/resolution times, and trade objects. | Read only |
| Blacklists | Add and remove blacklisted Discord users and guilds. | Add / remove |
| Spawn waves | Inspect wave records, entries, catch outcomes, and rewards. | Read only |
| Configuration | Review selected runtime settings, enabled modules, and rarity tiers. | Read only |

Trade acceptance/decline and spawn-wave annul/revert are intentionally not duplicated in the panel. Those operations remain in their existing Discord command workflows. The panel does not edit the local `src/config/config.ts` file.

### Admin access requirements

Admin access requires **both**:

1. The Discord account must be listed in `permissions.adminUserIds` in the generated local `src/config/config.ts`.
2. The Discord OAuth2 application must be configured with the Client Secret and matching Redirect URI.

Being a Discord server owner or having the `Administrator` permission does not automatically grant access to the panel. The allowlist is controlled by the FCDex owner/operator.

The admin server binds to `127.0.0.1:3030` by default. Keep it local during development. For remote access, use HTTPS behind a properly configured reverse proxy and firewall; do not expose the Bun admin port directly to the public internet.

See the [Admin Panel Wiki](https://github.com/saedevz/fcdex/wiki/Admin-Panel) for setup and permission details.

## Requirements

- [Bun](https://bun.sh/) **1.4.0 or newer** (see `package.json`).
- A Discord application and bot token for running the Discord bot.
- Access to the FCDex configuration and database for a full local instance.

A separate PostgreSQL server is not required by the current project setup. FCDex uses embedded PGlite through `prisma-pglite`.

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/saedevz/fcdex.git
cd fcdex
```

### 2. Install dependencies

```bash
bun install
```

### 3. Generate the local configuration

```bash
bun run setup
```

This creates `src/config/config.ts` if it does not already exist. Open that file and configure your bot token, application ID, modules, permissions, and other settings. The generated local config is intentionally ignored by Git.

### 4. Generate the Prisma client

```bash
bun run db:generate
```

### 5. Prepare the database

For a **new, empty local database**, create the schema from the SQL snapshot:

```bash
bun run db:push
```

To import a compatible BallsDex/FCDex SQL dump into the embedded PGlite database:

```bash
bun run db:import path/to/backup.sql
```

The PGlite data directory defaults to `.not-committed` in the project directory. Set `FCD_PGLITE_DIR` to use a different directory. Back up existing data before importing or changing database structure. Do not run setup/import commands against a live database unless you understand the effect and have an independent backup.

### 6. Start FCDex

```bash
bun run dev
```

The production build/check scripts are:

```bash
bun run build
bun run lint
bun run check
```

`bun run check` runs the Biome checks and TypeScript build.

## Admin panel setup

The admin panel starts with the main FCDex process after Prisma connects. A valid bot token is still required for the complete FCDex process to remain online. The panel implementation is included in this project version; verify OAuth, database actions, and permissions against the target FCDex environment before production use.

### 1. Configure the admin allowlist

In `src/config/config.ts`, add the Discord user IDs authorized by the FCDex owner/operator:

```ts
permissions: {
  adminUserIds: ["YOUR_DISCORD_USER_ID"],
  // Keep the existing levels configuration.
},
```

Do not add users without authorization from the FCDex owner/operator.

### 2. Configure environment variables

Copy `.env.example` to `.env` and set the values:

```env
FCDEX_ADMIN_CLIENT_SECRET=YOUR_DISCORD_APPLICATION_CLIENT_SECRET
FCDEX_ADMIN_SESSION_SECRET=REPLACE_WITH_A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
FCDEX_ADMIN_REDIRECT_URI=http://127.0.0.1:3030/admin/api/auth/callback
FCDEX_ADMIN_HOST=127.0.0.1
FCDEX_ADMIN_PORT=3030
```

`FCDEX_ADMIN_CLIENT_SECRET` is the Discord application's **OAuth2 Client Secret**. It is not the bot token. Keep `.env` private and never commit it.

Generate a session secret locally, for example:

```bash
openssl rand -hex 32
```

### 3. Register the OAuth2 redirect URI

In the Discord Developer Portal, open the FCDex application → **OAuth2** → **Redirects** and add the exact URI from `FCDEX_ADMIN_REDIRECT_URI`.

For the default local configuration, use:

```text
http://127.0.0.1:3030/admin/api/auth/callback
```

The redirect must match exactly, including protocol, hostname, port, and path.

### 4. Start and open the panel

Start FCDex:

```bash
bun run dev
```

Open:

```text
http://127.0.0.1:3030/admin/
```

If port `3030` is already in use, choose another local port in `.env` and update the OAuth redirect URI to match. For example:

```env
FCDEX_ADMIN_PORT=3031
FCDEX_ADMIN_REDIRECT_URI=http://127.0.0.1:3031/admin/api/auth/callback
```

Then add that new callback URI to the Discord application's OAuth2 Redirects list.

### Remote deployment

The default host is intentionally `127.0.0.1`. For a reverse-proxy deployment, configure `FCDEX_ADMIN_HOST=0.0.0.0`, set `FCDEX_ADMIN_PUBLIC_ORIGIN` to the public HTTPS origin, and use the matching HTTPS callback URL. Restrict access at the reverse proxy and firewall. Do not expose the Bun listener directly to the internet.

## Configuration

The generated `src/config/config.ts` controls the bot's Discord credentials, command permissions, enabled dugout modules, collection wording, appearance, spawning, rarity tiers, catch behavior, economy, transfers, matchday, pitch, guard, and wave settings.

The admin panel's HTTP/OAuth settings are separate environment variables documented in `.env.example`:

| Variable | Purpose | Default |
| --- | --- | --- |
| `FCDEX_ADMIN_CLIENT_SECRET` | Discord OAuth2 Client Secret | Required |
| `FCDEX_ADMIN_SESSION_SECRET` | HMAC signing secret; at least 32 characters | Required |
| `FCDEX_ADMIN_REDIRECT_URI` | Exact Discord OAuth callback URL | Required |
| `FCDEX_ADMIN_HOST` | Admin HTTP bind host | `127.0.0.1` |
| `FCDEX_ADMIN_PORT` | Admin HTTP port | `3030` |
| `FCDEX_ADMIN_PUBLIC_ORIGIN` | Public HTTPS origin when behind a reverse proxy | Unset |
| `FCD_PGLITE_DIR` | PGlite database directory | `.not-committed` |

The admin panel's Configuration screen is read-only. Edit `src/config/config.ts` and restart FCDex to change bot-wide settings.

## Database notes

FCDex currently models the BallsDex-compatible tables through Prisma, including `Player`, `Ball`, `Special`, `BallInstance`, `Trade`, `TradeObject`, `GuildConfig`, `BlacklistedId`, `BlacklistedGuild`, `SpawnWave`, and `SpawnWaveEntry`.

The SQL snapshot and Prisma schema currently disagree about `ball.regime_id`: `prisma/schema.sql` declares it `NOT NULL`, while `schema.prisma` marks `regimeId` optional. The admin club form requires a Regime ID to satisfy the SQL snapshot. Review this mismatch with the database owner before changing the schema.

## Safety and operational notes

- Never commit `.env`, `src/config/config.ts`, bot tokens, OAuth secrets, database files, or SQL backups.
- The admin allowlist is an explicit Discord user-ID allowlist; server permissions do not replace it.
- The admin session lasts eight hours. The OAuth state cookie lasts ten minutes.
- Admin write requests are origin-checked and validated server-side.
- Admin actions are written as structured `[AdminAction]` entries to the server log. The current schema does not include a persistent audit-log table.
- Club deletion can fail while collection instances reference the club; the database relation restricts that deletion.
- Player coin changes directly update the player's `money` balance. Back up the database and use these controls only with owner authorization.
- Trade state changes and spawn-wave annul/revert are intentionally left to the existing Discord command workflows.
- The admin panel's system/configuration page is read-only.

## Documentation Wiki

The Wiki contains installation, configuration, database, module, admin-panel, security, troubleshooting, and contribution guides:

- [Wiki Home](https://github.com/saedevz/fcdex/wiki)
- [Installation](https://github.com/saedevz/fcdex/wiki/Installation)
- [Configuration](https://github.com/saedevz/fcdex/wiki/Configuration)
- [Database Setup](https://github.com/saedevz/fcdex/wiki/Database-Setup)
- [Running FCDex](https://github.com/saedevz/fcdex/wiki/Running-FCDex)
- [Package System](https://github.com/saedevz/fcdex/wiki/Package-System)
- [Admin Panel](https://github.com/saedevz/fcdex/wiki/Admin-Panel)
- [Admin Authentication](https://github.com/saedevz/fcdex/wiki/Admin-Authentication)
- [Admin Operations](https://github.com/saedevz/fcdex/wiki/Admin-Operations)
- [Troubleshooting](https://github.com/saedevz/fcdex/wiki/Troubleshooting)
- [Contributing](https://github.com/saedevz/fcdex/wiki/Contributing)

## Contributing

Issues, bug reports, documentation improvements, and pull requests are welcome. Before opening a pull request:

1. Check existing issues and discussions.
2. Keep changes focused and describe the behavior they affect.
3. Run `bun run lint` and `bun run build` where possible.
4. Do not include generated Prisma output, local configuration, credentials, database files, or backups.
5. Include reproduction steps for bug fixes and screenshots for UI changes when useful.

## Community and support

- [FCDex Discord](https://discord.com/servers/fcdex-1462526346533273775)
- [GitHub Issues](https://github.com/saedevz/fcdex/issues)
- [GitHub Discussions](https://github.com/saedevz/fcdex/discussions)

## License

FCDex is licensed under the [MIT License](LICENSE).

<div align="center">

**Made with ⚽ by the FCDex Team**

[GitHub](https://github.com/saedevz/fcdex) · [Discord](https://discord.com/servers/fcdex-1462526346533273775)

</div>
