
import { REST, Routes } from "discord.js";
import { config } from "./config/config.js";
import { commands } from "./commands/index.js";

const rest = new REST({ version: "10" }).setToken(config.discord.token);

const commandData = commands.map((command) => command.data.toJSON());

async function deployCommands(): Promise<void> {
  try {
    console.log(`Deploying ${commandData.length} FCDex commands...`);

    await rest.put(Routes.applicationCommands(config.discord.clientId), {
      body: commandData,
    });

    console.log("✓ Global application commands deployed successfully.");
  } catch (error) {
    console.error("✗ Failed to deploy application commands:", error);
    process.exitCode = 1;
  }
}

await deployCommands();
