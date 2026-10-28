import { SlashCommandBuilder } from "discord.js";
import { config } from "../../config/config.js";
import { prisma } from "../../db/prisma.js";
import type { FCDexCommand, FCDexModule } from "../loader.js";
import { fill, fmtCoins } from "../pool.js";
import { heading, panel, panelReply } from "../ui.js";

const { icons } = config.appearance;

const infoCommand: FCDexCommand = {
  data: new SlashCommandBuilder()
    .setName("fcdex")
    .setDescription(fill(config.commands.fcdex, { name: config.bot.name })),
  async execute(interaction) {
    const { panels } = config.info;

    const [clubs, collectors, signatures, completedTrades, pot] =
      await Promise.all([
        prisma.ball.count({ where: { enabled: true } }),
        prisma.player.count(),
        prisma.ballInstance.count(),
        prisma.trade.count({ where: { status: "completed" } }),
        prisma.player.aggregate({ _sum: { money: true } }),
      ]);

    await interaction.reply({
      ...panelReply(
        panel({
          content: heading(
            icons.ball,
            fill(panels.aboutTitle, {
              name: config.bot.name,
              version: config.bot.version,
            }),
            config.bot.description,
          ),
          fields: [
            [
              fill(panels.guildLine, {
                guilds: String(interaction.client.guilds.cache.size),
              }),
              fill(panels.clubLine, { clubs: String(clubs) }),
              fill(panels.collectorLine, { collectors: String(collectors) }),
              fill(panels.signatureLine, { signatures: String(signatures) }),
              fill(panels.tradeLine, { trades: String(completedTrades) }),
              fill(panels.dugoutLine, {
                modules: config.dugout.join(", "),
              }),
              `-# ${config.economy.currency}: ${fmtCoins(pot._sum.money ?? 0n)} in circulation`,
            ].join("\n"),
          ],
          footer: true,
        }),
      ),
    });
  },
};

const infoPackage: FCDexModule = {
  name: "info",

  register() {},

  commands: [infoCommand],
};

export default infoPackage;
