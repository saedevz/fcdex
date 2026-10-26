import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check whether FCDex is responding."),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({
      content: `Pong! Gateway latency: ${interaction.client.ws.ping} ms.`,
      ephemeral: true,
    });
  },
};
