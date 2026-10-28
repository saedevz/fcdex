import {
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  Events,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "../../config/config.js";
import { prisma } from "../../db/prisma.js";
import type { FCDexCommand, FCDexModule } from "../loader.js";
import { ensurePlayer, fill, fmtCoins } from "../pool.js";
import { ephemeralReply, heading, panel, panelReply } from "../ui.js";

const { icons, accents } = config.appearance;

async function buildTradePanel(tradeId: bigint) {
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      objects: { include: { ballInstance: { include: { ball: true } } } },
    },
  });

  if (trade?.status !== "pending") return null;

  const { panels } = config.transfers;
  const none = panels.none;

  const creatorItems = trade.objects
    .filter((object) => object.playerId === trade.player1Id)
    .map((object) => object.ballInstance.ball.country);
  const targetItems = trade.objects
    .filter((object) => object.playerId === trade.player2Id)
    .map((object) => object.ballInstance.ball.country);

  return panel({
    accentColor: accents.transfer,
    content: heading(
      icons.deal,
      panels.offerTitle,
      fill(panels.offerSubtitle, {
        window: String(
          Math.floor((trade.expiresAt ?? new Date()).getTime() / 1000),
        ),
      }),
    ),
    fields: [
      [
        fill(panels.sends, { items: creatorItems.join(", ") || none }),
        fill(panels.receives, {
          items: targetItems.join(", ") || none,
          fee: trade.player2Money > 0n ? fmtCoins(trade.player2Money) : "",
        }).trim(),
        fill(panels.attachments, {
          coins: trade.player1Money > 0n ? fmtCoins(trade.player1Money) : none,
        }),
        fill(panels.fee, { fee: String(config.transfers.feePercent) }),
      ].join("\n"),
    ],
    buttons: [
      [
        {
          customId: `transfers:accept:${trade.id}`,
          label: config.transfers.labels.accept,
          emoji: icons.deal,
          style: ButtonStyle.Success,
        },
        {
          customId: `transfers:decline:${trade.id}`,
          label: config.transfers.labels.decline,
          emoji: icons.cross,
          style: ButtonStyle.Danger,
        },
      ],
    ],
    footer: true,
  });
}

async function createTransferOffer(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const collector = interaction.options.getUser("collector", true);
  const instanceId = interaction.options.getString("club", true);
  const coins = interaction.options.getInteger("coins") ?? 0;
  const { messages } = config.transfers;

  if (collector.bot || collector.id === interaction.user.id) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.invalidTarget, { emoji: config.appearance.errorEmoji }),
      ),
    );
    return;
  }

  let instanceIdBig: bigint;

  try {
    instanceIdBig = BigInt(instanceId);
  } catch {
    await interaction.reply(
      ephemeralReply(
        fill(messages.notInClubroom, { emoji: config.appearance.errorEmoji }),
      ),
    );
    return;
  }

  const sender = await ensurePlayer(interaction.user.id);
  const receiver = await ensurePlayer(collector.id);

  if (coins > 0 && sender.money < BigInt(coins)) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.insufficientCoins, {
          emoji: config.appearance.errorEmoji,
        }),
      ),
    );
    return;
  }

  const item = await prisma.ballInstance.findUnique({
    where: { id: instanceIdBig },
  });

  if (!item || item.playerId !== sender.id || item.deleted) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.notInClubroom, { emoji: config.appearance.errorEmoji }),
      ),
    );
    return;
  }

  if (item.locked || !item.tradeable) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.clubLocked, { emoji: config.appearance.errorEmoji }),
      ),
    );
    return;
  }

  const [alreadyPending, dayCount] = await Promise.all([
    prisma.tradeObject.findFirst({
      where: {
        ballInstanceId: item.id,
        trade: { status: "pending" },
      },
    }),
    dailyTradeCount(sender.id),
  ]);

  if (alreadyPending || dayCount >= config.transfers.maxPerDay) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.offerRejected, {
          emoji: config.appearance.warningEmoji,
          reason: alreadyPending ? messages.reasonEscrow : messages.reasonDaily,
        }),
      ),
    );
    return;
  }

  const trade = await prisma.trade.create({
    data: {
      player1Id: sender.id,
      player2Id: receiver.id,
      player1Money: BigInt(coins),
      player2Money: 0n,
      status: "pending",
      expiresAt: new Date(
        Date.now() + config.transfers.negotiationTimeoutSeconds * 1000,
      ),
      objects: {
        create: { ballInstanceId: item.id, playerId: sender.id },
      },
    },
  });

  const tradePanel = await buildTradePanel(trade.id);

  if (!tradePanel) return;

  await interaction.reply({
    ...panelReply(tradePanel, false),
    content: `<@${receiver.id}>`,
  });
}

async function dailyTradeCount(playerId: bigint): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.trade.count({
    where: {
      status: "completed",
      OR: [{ player1Id: playerId }, { player2Id: playerId }],
      resolvedAt: { gte: since },
    },
  });
}

async function resolveTrade(
  interaction: ButtonInteraction,
  accepted: boolean,
): Promise<void> {
  const rawId = interaction.customId.split(":")[2];

  if (!rawId) return;

  let tradeId: bigint;

  try {
    tradeId = BigInt(rawId);
  } catch {
    return;
  }

  const { messages, panels } = config.transfers;

  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });

  if (trade?.status !== "pending") {
    await interaction.reply(
      ephemeralReply(
        fill(messages.closed, { emoji: config.appearance.warningEmoji }),
      ),
    );
    return;
  }

  const player = await ensurePlayer(interaction.user.id);
  const isParticipant = [trade.player1Id, trade.player2Id].includes(player.id);

  if (!isParticipant) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.notParticipant, { emoji: config.appearance.errorEmoji }),
      ),
    );
    return;
  }

  if (trade.expiresAt && Date.now() > trade.expiresAt.getTime()) {
    await prisma.trade.update({
      where: { id: trade.id },
      data: { status: "expired", resolvedAt: new Date() },
    });

    await interaction.reply(
      ephemeralReply(
        fill(messages.expired, { emoji: config.appearance.warningEmoji }),
      ),
    );
    return;
  }

  if (accepted && player.id !== trade.player2Id) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.onlyReceiver, { emoji: config.appearance.errorEmoji }),
      ),
    );
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.trade.findUnique({
        where: { id: trade.id },
        select: { status: true },
      });

      if (locked?.status !== "pending") {
        throw new Error("Trade already resolved.");
      }

      if (accepted) {
        const objects = await tx.tradeObject.findMany({
          where: { tradeId: trade.id },
        });

        for (const object of objects) {
          await tx.ballInstance.update({
            where: { id: object.ballInstanceId },
            data: {
              playerId:
                object.playerId === trade.player1Id
                  ? trade.player2Id
                  : trade.player1Id,
            },
          });
        }

        const fee =
          (trade.player1Money * BigInt(config.transfers.feePercent)) / 100n;

        if (trade.player1Money > 0n) {
          await tx.player.update({
            where: { id: trade.player1Id },
            data: { money: { decrement: trade.player1Money } },
          });

          await tx.player.update({
            where: { id: trade.player2Id },
            data: { money: { increment: trade.player1Money - fee } },
          });
        }
      }

      await tx.trade.update({
        where: { id: trade.id },
        data: {
          status: accepted ? "completed" : "declined",
          resolvedAt: new Date(),
        },
      });
    });
  } catch {
    await interaction.reply(
      ephemeralReply(
        fill(messages.closed, { emoji: config.appearance.warningEmoji }),
      ),
    );
    return;
  }

  await interaction.update({
    components: [
      panel({
        accentColor: accepted ? accents.success : accents.neutral,
        content: heading(
          accepted ? icons.deal : icons.cross,
          accepted ? panels.sealedTitle : panels.declinedTitle,
          fill(panels.resolvedSubtitle, { user: `<@${interaction.user.id}>` }),
        ),
        footer: true,
      }).toJSON(),
    ],
  });
}

async function showTransferInbox(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const player = await ensurePlayer(interaction.user.id);
  const trades = await prisma.trade.findMany({
    where: { player2Id: player.id, status: "pending" },
    orderBy: { expiresAt: "asc" },
    take: 10,
  });

  const { messages, panels } = config.transfers;

  if (trades.length === 0) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.inboxEmpty, { emoji: config.appearance.infoEmoji }),
      ),
    );
    return;
  }

  const lines = trades
    .map((trade) =>
      fill(panels.inboxLine, {
        creator: `<@${trade.player1Id}>`,
        window: String(
          Math.floor((trade.expiresAt ?? new Date()).getTime() / 1000),
        ),
      }),
    )
    .join("\n");

  await interaction.reply({
    ...panelReply(
      panel({
        content: heading(
          icons.inbox,
          panels.inboxTitle,
          fill(panels.inboxSubtitle, { count: String(trades.length) }),
        ),
        fields: [lines],
        footer: true,
      }),
    ),
  });
}

async function showTransferHistory(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const player = await ensurePlayer(interaction.user.id);
  const { messages, panels } = config.transfers;

  const trades = await prisma.trade.findMany({
    where: {
      OR: [{ player1Id: player.id }, { player2Id: player.id }],
      status: { not: "pending" },
    },
    orderBy: { resolvedAt: "desc" },
    take: 10,
    include: {
      objects: { include: { ballInstance: { include: { ball: true } } } },
    },
  });

  if (trades.length === 0) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.historyEmpty, { emoji: config.appearance.infoEmoji }),
      ),
    );
    return;
  }

  const statusWord = (status: string | null): string =>
    status === "completed"
      ? panels.statusCompleted
      : status === "declined"
        ? panels.statusDeclined
        : panels.statusExpired;

  const lines = trades
    .map((trade) =>
      fill(panels.historyLine, {
        status: statusWord(trade.status),
        items:
          trade.objects
            .map((object) => object.ballInstance.ball.country)
            .join(", ") || panels.none,
        when: String(
          Math.floor((trade.resolvedAt ?? trade.date).getTime() / 1000),
        ),
      }),
    )
    .join("\n");

  await interaction.reply({
    ...panelReply(
      panel({
        content: heading(
          icons.history,
          panels.historyTitle,
          fill(panels.historySubtitle, { count: String(trades.length) }),
        ),
        fields: [lines],
        footer: true,
      }),
    ),
  });
}

const transfersCommand: FCDexCommand = {
  data: new SlashCommandBuilder()
    .setName("transfers")
    .setDescription(config.commands.transfers)
    .addSubcommand((sub) =>
      sub
        .setName("offer")
        .setDescription(config.commands.transfersOffer)
        .addUserOption((option) =>
          option
            .setName("collector")
            .setDescription(config.commands.transfersOfferCollector)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("club")
            .setDescription(config.commands.transfersOfferClub)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("coins")
            .setDescription(config.commands.transfersOfferCoins)
            .setMinValue(0),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("inbox").setDescription(config.commands.transfersInbox),
    )
    .addSubcommand((sub) =>
      sub.setName("history").setDescription(config.commands.transfersHistory),
    ),
  async execute(interaction) {
    const name = interaction.options.getSubcommand(true);

    if (name === "offer") await createTransferOffer(interaction);
    if (name === "inbox") await showTransferInbox(interaction);
    if (name === "history") await showTransferHistory(interaction);
  },
};

const transfersPackage: FCDexModule = {
  name: "transfers",

  register(client) {
    if (!config.transfers.enabled) return;

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith("transfers:")) return;

      const [, action] = interaction.customId.split(":");

      if (action === "accept") await resolveTrade(interaction, true);
      if (action === "decline") await resolveTrade(interaction, false);
    });
  },

  commands: [transfersCommand],
};

export default transfersPackage;
