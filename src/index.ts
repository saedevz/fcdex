
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type InteractionReplyOptions,
} from "discord.js";
import { config } from "./config/config.js";
import { commands } from "./commands/index.js";
import { prisma } from "./db/prisma.js";
import { loadPackages } from "./packages/loader.js";
import { validateConfig } from "./config/validate.js";  

const startedAt = Date.now();

let shuttingDown = false;
let startupFailed = false;

function log(stage: string, message: string): void {
  console.log(`[${stage.padEnd(10)}] ${message}`);
}

function logError(stage: string, message: string, error: unknown): void {
  log(stage, `✗ ${message}`);
  console.error(error);
}

function printBanner(): void {
  console.log(`
   ███████╗ ██████╗██████╗ ███████╗██╗  ██╗
   ██╔════╝██╔════╝██╔══██╗██╔════╝╚██╗██╔╝
   █████╗  ██║     ██║  ██║█████╗   ╚███╔╝
   ██╔══╝  ██║     ██║  ██║██╔══╝   ██╔██╗
   ██║     ╚██████╗██████╔╝███████╗██╔╝ ██╗
   ╚═╝      ╚═════╝╚═════╝ ╚══════╝╚═╝  ╚═╝

                 Created by the FCDex Team
                      Version ${config.bot.version}
`);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commandMap = new Map(
  commands.map((command) => [command.data.name, command]),
);

client.once(Events.ClientReady, (readyClient) => {
  log("Discord", `✓ Logged in as ${readyClient.user.tag}`);
  log("Commands", `${commandMap.size} commands registered locally`);
  log(
    "Core",
    `✓ FCDex is ready! (${((Date.now() - startedAt) / 1000).toFixed(2)}s)`,
  );

  console.log("\n────────────────────────────────────────────");
  console.log("  ⚽ FCDex is online and ready to collect clubs!");
  console.log("────────────────────────────────────────────\n");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);

  if (!command) {
    log("Commands", `Unknown command received: /${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    logError(
      "Commands",
      `/${interaction.commandName} failed`,
      error,
    );

    const payload: InteractionReplyOptions = {
      content: `${config.appearance.errorEmoji} An error occurred while executing this command.`,
      flags: MessageFlags.Ephemeral,
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (replyError) {
      logError(
        "Commands",
        `Could not send the error response for /${interaction.commandName}`,
        replyError,
      );
    }
  }
});

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  log("Core", `${signal} received; shutting down FCDex...`);

  client.destroy();

  try {
    await prisma.$disconnect();
    log("Database", "✓ Prisma disconnected.");
  } catch (error) {
    logError("Database", "Failed to disconnect Prisma cleanly.", error);
    process.exitCode = 1;
  }

  log("Core", "Shutdown complete.");
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

async function start(): Promise<void> {
  printBanner();

  log("Core", "Initializing FCDex...");
  log("Config", "Validating configuration...");
validateConfig();
  log("Commands", `${commandMap.size} command(s) discovered.`);

  try {
    log("Database", "Connecting to PostgreSQL...");
    await prisma.$connect();
    log("Database", "✓ PostgreSQL connection established.");

    await loadPackages(client, config);

    log("Discord", "Connecting to Discord...");
    await client.login(config.discord.token);
  } catch (error) {
    startupFailed = true;
    logError("Core", "Startup failed.", error);

    client.destroy();

    try {
      await prisma.$disconnect();
      log("Database", "✓ Startup cleanup completed.");
    } catch (disconnectError) {
      logError(
        "Database",
        "Failed to disconnect during startup cleanup.",
        disconnectError,
      );
    }

    process.exitCode = 1;
  }
}

await start();
