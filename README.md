<div align="center">

# ⚽ FCDex

### Football Club Dex for Discord

Collect football clubs. Discover your favourites. Trade with friends. Build your collection.

[![Discord](https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/servers/fcdex-1462526346533273775)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/saedevz/fcdex)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg?style=for-the-badge)](LICENSE)

**[Join the Community](https://discord.com/servers/fcdex-1462526346533273775) · [Documentation](https://github.com/saedevz/fcdex/wiki) · [Report a Bug](https://github.com/saedevz/fcdex/issues)**

</div>

---

## 🌟 About

FCDex is an open-source Discord bot project inspired by collectible dex bots, reimagined around **football clubs**.

Build your collection, discover clubs, and eventually compete and trade with other collectors — all through Discord.

Our goal is to create a flexible, modular, and community-driven football collecting experience.


## 👥 Meet the Team

FCDex is built by a team passionate about football, Discord bots, and open-source development.

| Member       | Role                                      |
| ------------ | ----------------------------------------- |
| **Astro**    | Project Lead & Lead Developer             |
| `Ariel Aram` | Core Developer                            |
| `Alan`       | Community and Bot Manager and Contributor |
| `Hiboman`    | Developer                                 |
| `Earthiopia` | Contributor                               |
| `Giga`       | Contributor                               |
| `Bloxy`      | Bot Hoster & Contributor                  |
| `Zion`       | Contributor                               |

> Want to join the team? Visit our [Discord server](https://discord.com/servers/fcdex-1462526346533273775) and introduce yourself!


## ✨ Features

- ⚽ **Club Collection** — collect football clubs and build your personal collection.
- 🎯 **Catch System** — identify and catch clubs when they spawn, in home, away and third kits.
- 🏆 **Tier-Based Rarity** — discover clubs across weighted rarity tiers.
- 📦 **Modular Packages** — enable or disable features through configuration.
- 🛠️ **Pitch Controls** — spawn channel pinning, toggles, force spawns and bans.
- 🔄 **Trading** — escrowed transfer offers with fees and history.
- ⚔️ **Matchdays & Duels** — AI friendlies and PvP club duels with coin stakes.
- 🪙 **Economy** — daily wages, catch rewards and coin leaderboards.
- 🌐 **Open Source** — contribute, report bugs, and help shape FCDex.

> 🚧 FCDex is actively being developed. Some features are planned and are not yet available.

## 🚀 Getting Started

### Requirements

- [Bun](https://bun.sh/)
- [Node.js](https://nodejs.org/) for the current production start script
- A [Discord application](https://discord.com/developers/applications)

### Intents & permissions

FCDex runs on **no privileged intents**. It enables only `Guilds` and `GuildMessages`; spawn detection never reads message content, so you can leave **Message Content**, **Server Members**, and **Server Presence** intents disabled in the Discord Developer Portal.

Bot invite permissions are minimal: **View Channels** and **Send Messages**. Slash commands deploy globally and require no additional permissions. The only gated surface is `/pitch`, whose controls are limited to members with **Manage Server**.

### BallsDex database compatibility

FCDex is fully compatible with the BallsDex PostgreSQL schema and runs on embedded PGlite. Import any `pg_dump` backup produced by BallsDex or FCDex v3:

```bash
bun run db:import path/to/ballsdex_backup.sql
```

The importer sanitizes the dump, replays the DDL, converts every `COPY` block into batched inserts, applies foreign keys, adds FCDex additive columns (`trade.status`, `trade.expires_at`, `trade.resolved_at`) and syncs identity sequences. Clubs (`ball`), variants (`special`), collections (`ballinstance`), trades (`trade` + `tradeobject`), guild settings (`guildconfig`) and blacklists (`blacklistedid`) are read directly from the imported data.

For a fresh, empty database without a backup, create the schema from `prisma/schema.sql`:

```bash
bun run db:push
```

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/saedevz/fcdex.git
cd fcdex
```

**2. Install dependencies**

```bash
bun install
```

**3. Generate your local configuration**

```bash
bun run setup
```

Open the generated `src/config/config.ts` and configure your Discord bot credentials and other settings.

**4. Configure the database**

Set up your PostgreSQL connection using the environment configuration expected by the Prisma client.

Consult the [Database Setup Guide](https://github.com/saedevz/fcdex/wiki/Database-Setup) before proceeding.

**5. Generate the Prisma client**

```bash
bun run db:generate
```

**6. Start development**

```bash
bun run dev
```

> ⚠️ Database migrations are intentionally not included in these quick-start commands. Review the Prisma schema and database setup documentation before applying migrations.

## ⚙️ Configuration

FCDex uses a central TypeScript configuration file.

You can configure settings such as:

- Discord bot credentials
- Enabled packages
- Club collection settings
- Catch messages and buttons
- Tier-based rarity settings
- Economy, matchday, and transfer settings
- Pitch (spawn channel) controls
- Logging and appearance

Keep credentials private. **Never commit your real tokens, secrets, or database credentials to GitHub.**

Your local configuration file should remain excluded from version control.


## 📚 Documentation

Everything you need to install, configure, run, and contribute to FCDex.

| Guide                                                                       | Description                                   |
| --------------------------------------------------------------------------- | --------------------------------------------- |
| [🏠 Wiki Home](https://github.com/saedevz/fcdex/wiki)                       | Overview of the documentation                 |
| [📦 Installation](https://github.com/saedevz/fcdex/wiki/Installation)       | Clone the repository and install dependencies |
| [⚙️ Configuration](https://github.com/saedevz/fcdex/wiki/Configuration)     | Customize bot settings and enabled packages   |
| [🗄️ Database Setup](https://github.com/saedevz/fcdex/wiki/Database-Setup)   | Configure PostgreSQL and Prisma               |
| [▶️ Running FCDex](https://github.com/saedevz/fcdex/wiki/Running-FCDex)     | Start the bot and understand startup logs     |
| [🧩 Package System](https://github.com/saedevz/fcdex/wiki/Package-System)   | Understand the modular package architecture   |
| [🛠️ Troubleshooting](https://github.com/saedevz/fcdex/wiki/Troubleshooting) | Diagnose common errors and startup problems   |
| [🤝 Contributing](https://github.com/saedevz/fcdex/wiki/Contributing)       | Learn how to contribute to FCDex              |

### Quick Links

- [Report a bug](https://github.com/saedevz/fcdex/issues)
- [Browse the source code](https://github.com/saedevz/fcdex)
- [Join the FCDex Discord](https://discord.com/servers/fcdex-1462526346533273775)


## 🧩 Package System

FCDex is designed around individual feature packages.

Each package can contain its own commands, event handlers, and functionality. The package loader discovers package folders and loads enabled packages according to the central configuration.

Planned packages include:

| Package    | Purpose                      |
| ---------- | ---------------------------- |
| `clubs`    | Club collection and catching |
| `players`  | Player-related features      |
| `trade`    | Club trading                 |
| `battle`   | Club battles                 |
| `economy`  | Currency and economy         |
| `admin`    | Administrative commands      |
| `specials` | Special collection features  |
| `guilds`   | Server-specific settings     |
| `groups`   | Collection groups            |
| `fcscript` | Custom scripting support     |

Packages will become available as their implementations are completed.

## 🤝 Contributing

Contributions, ideas, and bug reports are welcome!

1. Read the [Contributing Guide](https://github.com/saedevz/fcdex/wiki/Contributing).
2. Check existing [issues](https://github.com/saedevz/fcdex/issues).
3. Create a branch for your changes.
4. Submit a pull request with a clear description.

Please avoid committing secrets, generated files, or unrelated changes.

## 💬 Community & Support

Need help, want to suggest a feature, or just want to follow development?

<div align="center">

### Join the FCDex Community

Discuss development, share ideas, and connect with other FCDex users.

[![Join FCDex Discord](https://img.shields.io/badge/💬%20Join%20the%20FCDex%20Discord-5865F2?style=for-the-badge)](https://discord.com/servers/fcdex-1462526346533273775)

[GitHub Issues](https://github.com/saedevz/fcdex/issues) · [GitHub Discussions](https://github.com/saedevz/fcdex/discussions)

</div>

## 📄 License

FCDex is licensed under the [MIT License](LICENSE).

---

<div align="center">

**Made with ⚽ by the FCDex Team**

[GitHub](https://github.com/saedevz/fcdex) · [Discord](https://discord.com/servers/fcdex-1462526346533273775)

</div>
