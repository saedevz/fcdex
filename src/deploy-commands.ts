import { REST, Routes } from "discord.js";
import { env } from "./config/env.js";
import { commands } from "./commands/index.js";

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
const body = commands.map((command) => command.data.toJSON());

if (env.DEV_GUILD_ID) {
  await rest.put(
    Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DEV_GUILD_ID),
    { body },
  );
  console.log(`Registered ${body.length} guild command(s) for development.`);
} else {
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
  console.log(`Registered ${body.length} global command(s).`);
}
