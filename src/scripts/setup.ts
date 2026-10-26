
import {
  access,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(currentDir, "..");
const configDirectory = resolve(root, "src", "config");
const configPath = resolve(configDirectory, "config.ts");

const configTemplate = `export const config = {
  discord: {
    token: "YOUR_BOT_TOKEN",
    clientId: "YOUR_APPLICATION_ID",
    clientSecret: "YOUR_OAUTH2_CLIENT_SECRET",
    publicKey: "YOUR_APPLICATION_PUBLIC_KEY",
    botUserId: "YOUR_BOT_USER_ID",
  },

  bot: {
    name: "FCDex",
    description: "Collect and trade football clubs on Discord!",
    version: "0.1.0",
    locale: "en-US",
    textPrefix: "b.",
    embedColor: 0xf97316,
  },

  about: {
    description: "Collect football clubs on Discord, trade them, and battle with friends!",
    githubLink: "https://github.com/saedevz/fcdex",
    websiteUrl: "https://fcdex.xyz",
    discordInvite: "",
    termsOfService: "",
    privacyPolicy: "",
  },

  team: {
    projectLead: "",
    developers: [],
    administrators: [],
    contributors: [],
    specialThanks: [],
  },

  collectible: {
    singular: "club",
    plural: "clubs",
    playersCommandName: "clubs",
    favoritedEmoji: "❤️",
    maxFavorites: 50,
  },

  packages: ["clubs"],

  admin: {
    enabled: true,
    guildIds: [],
    rootRoleIds: [],
    rootUserIds: [],
    adminRoleIds: [],
    adminUserIds: [],
    adminChannelIds: [],
  },

  owners: {
    teamMembersAreOwners: false,
    coOwners: [],
  },

  logging: {
    enabled: true,
    loggingChannel: "",
    level: "info",
  },

  appearance: {
    embedColor: 0xf97316,
    successEmoji: "✅",
    errorEmoji: "❌",
    warningEmoji: "⚠️",
    infoEmoji: "ℹ️",
    footerText: "FCDex • Football Club Dex",
    showTimestamp: true,
  },

  catch: {
    buttons: {
      catch: "⚽ Catch Me!",
      rarity: "✨ Rarity",
      help: "❓ Need help?",
    },

    spawnMessages: [
      "⚽ A wild {collectible} appeared!",
      "👀 Yo! A new {collectible} just dropped!",
      "🔥 Who's catching this {collectible}?",
    ],

    caughtMessages: [
      "🎉 {user} You caught **{club}**! {emoji}",
      "⚽ GOALLLL! {user} caught **{club}**!",
      "🏆 Massive W, {user}! You collected **{club}**!",
    ],

    wrongMessages: [
      "❌ {user} Wrong name!",
      "🤔 Not quite, {user}! Try again!",
      "⚽ Wide of the goal, {user}!",
    ],

    slowMessages: [
      "⏰ {user} Sorry, this {collectible} was already caught!",
      "💨 Too slow, {user}! Someone got there first!",
    ],

    timeoutSeconds: 60,
    cooldownSeconds: 5,
  },

  rarity: {
    minTier: 1,
    maxTier: 100,
    spawnWeights: {},
  },

  spawning: {
    enabled: true,
    chanceRangeMinutes: [40, 55],
    manager: "default",
  },

  trading: {
    enabled: false,
    cooldownSeconds: 10,
    maxItemsPerTrade: 10,
    confirmationTimeoutSeconds: 60,
  },

  economy: {
    enabled: false,
    currencyName: "Coins",
    currencyEmoji: "🪙",
  },

  battle: {
    enabled: false,
    maxAttackBonus: 20,
    maxHealthBonus: 20,
  },

  adminPanel: {
    enabled: false,
    clientId: "",
    clientSecret: "",
    webhookUrl: "",
    url: "http://localhost:8000",
  },

  extensions: {
    extraModels: [],
    extraAdminApps: [],
  },

  sentry: {
    enabled: false,
    dsn: "",
    environment: "production",
    tracesSampleRate: 0,
  },

  prometheus: {
    enabled: false,
    host: "127.0.0.1",
    port: 15260,
  },

  limits: {
    maxFavorites: 50,
    maxTradeItems: 10,
  },

  localisation: {
    defaultLocale: "en-US",
  },
} as const;
`;

async function setup(): Promise<void> {
  try {
    await mkdir(configDirectory, { recursive: true });

    try {
      await access(configPath, constants.F_OK);
      console.log("⚠️ src/config/config.ts already exists.");
      console.log("🔒 Existing configuration left untouched.");
      return;
    } catch {
      // The file does not exist, so we can create it.
    }

    await writeFile(configPath, configTemplate, {
      encoding: "utf8",
      flag: "wx",
    });

    console.log("✅ Generated src/config/config.ts successfully!");
    console.log("🔐 Your local configuration is excluded from Git.");
    console.log("📝 Open src/config/config.ts to customise your settings.");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      console.log("⚠️ Configuration already exists; nothing was overwritten.");
      return;
    }

    console.error("❌ Failed to generate configuration:", error);
    process.exitCode = 1;
  }
}

await setup();
