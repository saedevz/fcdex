
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  type Client,
  type Message,
} from "discord.js";
import type { FCDexPackage } from "../loader.js";
import { config } from "../../config/config.js";

const SPAWN_MINUTES = config.spawning.chanceRangeMinutes[0];
const SPAWN_MAX_MINUTES = config.spawning.chanceRangeMinutes[1];

const lastSpawnByGuild = new Map<string, number>();
const messageCounts = new Map<string, number>();

const clubsPackage: FCDexPackage = {
  name: "clubs",

  register(client: Client) {
    console.log("[Clubs] Activity-based spawning initialized.");

    client.on(Events.MessageCreate, async (message: Message) => {
      if (
        !config.spawning.enabled ||
        !message.guild ||
        message.author.bot
      ) {
        return;
      }

      const guildId = message.guild.id;
      const now = Date.now();
      const lastSpawn = lastSpawnByGuild.get(guildId) ?? 0;

      const count = (messageCounts.get(guildId) ?? 0) + 1;
      messageCounts.set(guildId, count);

      // Wait for activity and a randomized interval before spawning.
      if (count < 20 || now - lastSpawn < SPAWN_MINUTES * 60_000) {
        return;
      }

      const interval =
        SPAWN_MINUTES +
        Math.random() * (SPAWN_MAX_MINUTES - SPAWN_MINUTES);

      if (now - lastSpawn < interval * 60_000) {
        return;
      }

      messageCounts.set(guildId, 0);
      lastSpawnByGuild.set(guildId, now);

      const embed = new EmbedBuilder()
        .setColor(config.appearance.embedColor)
        .setTitle("⚽ A football club has appeared!")
        .setDescription("A mystery club is waiting to be caught!")
        .setFooter({ text: config.appearance.footerText })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("clubs:catch")
          .setLabel("Catch Me!")
          .setEmoji("⚽")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("clubs:rarity")
          .setLabel("Rarity")
          .setEmoji("✨")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("clubs:help")
          .setLabel("Need help?")
          .setEmoji("❓")
          .setStyle(ButtonStyle.Secondary),
      );

      
try {
  if (!message.channel.isSendable()) return;

  await message.channel.send({
    embeds: [embed],
    components: [row],
  });
} catch (error) {
  console.error("[Clubs] Failed to send spawn embed:", error);
}
    });
  },
};

export default clubsPackage;
