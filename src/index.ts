import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";
import { env } from "./config/env.js";
import { commands } from "./commands/index.js";
import { prisma } from "./db/prisma.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commandMap = new Map(commands.map((command) => [command.data.name, command]));

client.once(Events.ClientReady, (readyClient) => {
  console.log(`FCDex core online as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Command /${interaction.commandName} failed:`, error);
    const payload = {
  content: "...",
  flags: MessageFlags.Ephemeral as const,
};

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => undefined);
    } else {
      await interaction.reply(payload).catch(() => undefined);
    }
  }
});

async function shutdown(signal: string) {
  console.log(`${signal} received; shutting down FCDex core...`);
  client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await client.login(env.DISCORD_TOKEN);
} catch (error) {
  console.error("Failed to log in to Discord:", error);
  await prisma.$disconnect();
  process.exitCode = 1;
}
