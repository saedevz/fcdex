import { REST, Routes } from "discord.js";
import { config } from "./config/config.js";
import { loadModuleCommands } from "./dugout/loader.js";

const rest = new REST({ version: "10" }).setToken(config.discord.token);

async function deployCommands(): Promise<void> {
  try {
    const commands = await loadModuleCommands(config);
    const body = commands.map((command) => command.data.toJSON());

    console.log(`Deploying ${body.length} FCDex commands...`);

    await rest.put(Routes.applicationCommands(config.discord.clientId), {
      body,
    });

    console.log("✓ Global application commands deployed successfully.");
  } catch (error) {
    console.error("✗ Failed to deploy application commands:", error);
    process.exitCode = 1;
  }
}

await deployCommands();
