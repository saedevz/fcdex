import {
  type AutocompleteInteraction,
  Client,
  Events,
  GatewayIntentBits,
  type InteractionReplyOptions,
  MessageFlags,
} from "discord.js";
import { config } from "./config/config.js";
import { validateConfig } from "./config/validate.js";
import { prisma } from "./db/prisma.js";
import { type FCDexCommand, loadModules } from "./dugout/loader.js";
import { fill, hasPermission, permissionFor } from "./dugout/pool.js";

const startedAt = Date.now();

let shuttingDown = false;

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

                ${config.bot.description}
                     Version ${config.bot.version}
`);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const commandMap = new Map<string, FCDexCommand>();

function registerCommands(commands: FCDexCommand[]): void {
  for (const command of commands) {
    const json = command.data.toJSON();
    commandMap.set(json.name, command);
  }
}

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
  if (interaction.isChatInputCommand()) {
    const command = commandMap.get(interaction.commandName);

    if (!command) {
      log("Commands", `Unknown command received: /${interaction.commandName}`);
      return;
    }

    const sub = interaction.options.getSubcommand(false);
    const path = sub
      ? `${interaction.commandName}.${sub}`
      : interaction.commandName;
    const level = permissionFor(path);

    const member =
      interaction.inGuild() && interaction.guild
        ? await interaction.guild.members
            .fetch(interaction.user.id)
            .catch(() => null)
        : null;

    const allowed = hasPermission(level, interaction.user.id, {
      has: (permission: bigint) => member?.permissions.has(permission) ?? false,
    });

    if (!allowed) {
      await interaction.reply({
        content: fill(config.bot.noPermission, {
          emoji: config.appearance.errorEmoji,
        }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logError("Commands", `/${interaction.commandName} failed`, error);

      const payload: InteractionReplyOptions = {
        content: fill(config.bot.commandError, {
          emoji: config.appearance.errorEmoji,
        }),
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

    return;
  }

  if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName);

    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction as AutocompleteInteraction);
      } catch (error) {
        logError(
          "Commands",
          `autocomplete for /${interaction.commandName} failed`,
          error,
        );
      }
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
  validateConfig();

  try {
    log("Database", "Connecting to embedded PGlite database...");
    await prisma.$connect();
    log("Database", "✓ PGlite connection established.");

    const commands = await loadModules(client, config);

    registerCommands(commands);

    log("Discord", "Connecting to Discord...");
    await client.login(config.discord.token);
  } catch (error) {
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
