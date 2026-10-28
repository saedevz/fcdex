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
import {
  addMoney,
  clubStrength,
  ensurePlayer,
  fill,
  fmtCoins,
  isBanned,
  readExtras,
  tierFromRarity,
  writeExtras,
} from "../pool.js";
import { ephemeralReply, heading, panel, panelReply } from "../ui.js";

const { icons, accents } = config.appearance;

interface PendingDuel {
  challengerId: string;
  targetId: string;
  challengerItemId: bigint;
  stake: number;
  expiresAt: number;
}

const pendingDuels = new Map<string, PendingDuel>();

async function pickOpponent() {
  return prisma.ball.findFirst({
    where: { enabled: true, tradeable: true },
    orderBy: { rarity: "desc" },
    skip: Math.floor(Math.random() * 20),
  });
}

async function ensureRules(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): Promise<boolean> {
  const player = await ensurePlayer(interaction.user.id);

  const extras = readExtras(player);

  if (extras.rulesAcceptedAt) return true;

  const { panels } = config.matchday;
  const { labels } = panels;

  await interaction.reply({
    ...panelReply(
      panel({
        content: heading(
          icons.calendar,
          panels.rulesTitle,
          panels.rulesSubtitle,
        ),
        fields: [
          [
            fill(panels.rewardsLine, {
              label: labels.win,
              reward: fmtCoins(config.matchday.winReward),
            }),
            fill(panels.rewardsLine, {
              label: labels.draw,
              reward: fmtCoins(config.matchday.drawReward),
            }),
            fill(panels.rewardsLine, {
              label: labels.loss,
              reward: fmtCoins(config.matchday.lossReward),
            }),
          ].join("\n"),
          fill(config.catch.help.rules, { currency: config.economy.currency }),
        ],
        buttons: [
          [
            {
              customId: "matchday:acceptrules",
              label: labels.rulesAccept,
              emoji: icons.whistle,
              style: ButtonStyle.Success,
            },
          ],
        ],
        footer: true,
      }),
    ),
  });

  return false;
}

async function acceptRules(interaction: ButtonInteraction): Promise<void> {
  await writeExtras(interaction.user.id, {
    rulesAcceptedAt: new Date().toISOString(),
  });

  await interaction.update({
    content: fill(config.matchday.messages.rulesAccepted, {
      emoji: config.appearance.successEmoji,
    }),
    components: [],
  });
}

async function playMatchday(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await ensureRules(interaction))) return;

  if (await isBanned(interaction.user.id)) {
    await interaction.reply(
      ephemeralReply(
        fill(config.bot.banned, { emoji: config.appearance.errorEmoji }),
      ),
    );
    return;
  }

  const player = await ensurePlayer(interaction.user.id);

  const lineup = await prisma.ballInstance.findFirst({
    where: { playerId: player.id, deleted: false },
    orderBy: [{ favorite: "desc" }, { catchDate: "asc" }],
    include: { ball: true, special: true },
  });

  if (!lineup) {
    await interaction.reply(
      ephemeralReply(
        fill(config.matchday.messages.noClub, {
          emoji: config.appearance.warningEmoji,
        }),
      ),
    );
    return;
  }

  const opponent = await pickOpponent();

  if (!opponent) {
    await interaction.reply(
      ephemeralReply(
        fill(config.matchday.messages.noOpponents, {
          emoji: config.appearance.warningEmoji,
        }),
      ),
    );
    return;
  }

  const strengthDiff =
    clubStrength(lineup.ball, lineup) - clubStrength(opponent);

  const scored = Math.max(
    0,
    Math.floor(Math.random() * 3) + (strengthDiff > 0 ? 1 : 0),
  );
  const conceded = Math.max(
    0,
    Math.floor(Math.random() * 3) + (strengthDiff < 0 ? 1 : 0),
  );

  const { panels } = config.matchday;
  const { labels } = panels;

  const outcome =
    scored > conceded
      ? labels.winOutcome
      : scored === conceded
        ? labels.drawOutcome
        : labels.lossOutcome;

  const reward =
    scored > conceded
      ? config.matchday.winReward
      : scored === conceded
        ? config.matchday.drawReward
        : config.matchday.lossReward;

  const balance = await addMoney(interaction.user.id, reward);

  await interaction.reply({
    ...panelReply(
      panel({
        accentColor: tierFromRarity(lineup.ball.rarity).color,
        content: heading(
          icons.ball,
          fill(panels.resultTitle, {
            home: lineup.ball.country,
            scored: String(scored),
            conceded: String(conceded),
            away: opponent.country,
          }),
          fill(panels.resultSubtitle, {
            outcome,
            reward: fmtCoins(reward),
          }),
        ),
        fields: [
          [
            fill(panels.squadsLine, {
              home: `**${lineup.ball.country}**`,
              homeRarity: tierFromRarity(lineup.ball.rarity).key,
              away: `**${opponent.country}**`,
              awayRarity: tierFromRarity(opponent.rarity).key,
            }),
            fill(panels.balanceLine, { balance: fmtCoins(balance) }),
          ].join("\n"),
        ],
        ...(lineup.ball.wildCard
          ? {
              image: `${config.media.spawnBaseUrl}/${lineup.ball.wildCard}`,
            }
          : {}),
        footer: true,
      }),
    ),
  });
}

async function startDuel(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await ensureRules(interaction))) return;

  if (await isBanned(interaction.user.id)) {
    await interaction.reply(
      ephemeralReply(
        fill(config.bot.banned, { emoji: config.appearance.errorEmoji }),
      ),
    );
    return;
  }

  const opponent = interaction.options.getUser("opponent", true);
  const itemId = interaction.options.getString("club", true);
  const { messages, panels } = config.matchday;

  if (opponent.bot) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.duelBot, { emoji: config.appearance.errorEmoji }),
      ),
    );
    return;
  }

  if (opponent.id === interaction.user.id) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.duelSelf, { emoji: config.appearance.errorEmoji }),
      ),
    );
    return;
  }

  if (pendingDuels.size > 0) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.duelPending, { emoji: config.appearance.warningEmoji }),
      ),
    );
    return;
  }

  let itemIdBig: bigint;

  try {
    itemIdBig = BigInt(itemId);
  } catch {
    await interaction.reply(
      ephemeralReply(
        fill(config.squad.messages.notFound, {
          emoji: config.appearance.errorEmoji,
        }),
      ),
    );
    return;
  }

  const item = await prisma.ballInstance.findFirst({
    where: {
      id: itemIdBig,
      deleted: false,
      player: { discordId: BigInt(interaction.user.id) },
    },
    include: { ball: true, special: true },
  });

  if (!item) {
    await interaction.reply(
      ephemeralReply(
        fill(config.squad.messages.notFound, {
          emoji: config.appearance.errorEmoji,
        }),
      ),
    );
    return;
  }

  if (await isBanned(opponent.id)) {
    await interaction.reply(
      ephemeralReply(
        fill(config.pitch.messages.banned, {
          emoji: config.appearance.errorEmoji,
          user: `<@${opponent.id}>`,
        }),
      ),
    );
    return;
  }

  const duelId = crypto.randomUUID();
  const stake = config.matchday.duelStake;

  pendingDuels.set(duelId, {
    challengerId: interaction.user.id,
    targetId: opponent.id,
    challengerItemId: item.id,
    stake,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  await interaction.reply({
    ...panelReply(
      panel({
        accentColor: accents.transfer,
        content: heading(
          icons.whistle,
          fill(panels.duelTitle, {}),
          fill(panels.duelSubtitle, {
            challenger: `<@${interaction.user.id}>`,
            opponent: `<@${opponent.id}>`,
          }),
        ),
        fields: [
          [
            fill(panels.duelScoreLine, {
              home: `**${item.ball.country}**`,
              homeRarity: tierFromRarity(item.ball.rarity).key,
              away: panels.unknownAway,
              awayRarity: panels.unknownAway,
            }),
            fill(panels.duelStakeLine, { stake: fmtCoins(BigInt(stake)) }),
          ].join("\n"),
        ],
        buttons: [
          [
            {
              customId: `matchday:duel:${duelId}:accept`,
              label: panels.labels.duelAccept,
              emoji: icons.ball,
              style: ButtonStyle.Success,
            },
            {
              customId: `matchday:duel:${duelId}:decline`,
              label: panels.labels.duelDecline,
              emoji: icons.cross,
              style: ButtonStyle.Danger,
            },
          ],
        ],
        footer: true,
      }),
      false,
    ),
  });
}

async function resolveDuel(
  interaction: ButtonInteraction,
  accepted: boolean,
): Promise<void> {
  const [, , duelId] = interaction.customId.split(":");
  const duel = duelId ? pendingDuels.get(duelId) : undefined;
  const { messages, panels } = config.matchday;

  if (!duel || Date.now() > duel.expiresAt) {
    if (duelId) pendingDuels.delete(duelId);
    await interaction.reply(
      ephemeralReply(
        fill(messages.duelGone, { emoji: config.appearance.warningEmoji }),
      ),
    );
    return;
  }

  if (interaction.user.id !== duel.targetId) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.duelNotYours, { emoji: config.appearance.errorEmoji }),
      ),
    );
    return;
  }

  if (duelId) pendingDuels.delete(duelId);

  if (!accepted) {
    await interaction.update({
      components: [
        panel({
          accentColor: accents.neutral,
          content: heading(
            icons.cross,
            panels.duelTitle,
            fill(panels.duelWonSubtitle, { winner: panels.noWinner }),
          ),
          footer: true,
        }).toJSON(),
      ],
    });
    return;
  }

  const challengerItem = await prisma.ballInstance.findUnique({
    where: { id: duel.challengerItemId },
    include: { ball: true, special: true },
  });

  const defenderItem = await prisma.ballInstance.findFirst({
    where: { player: { discordId: BigInt(duel.targetId) }, deleted: false },
    orderBy: [{ favorite: "desc" }, { catchDate: "asc" }],
    include: { ball: true, special: true },
  });

  if (!challengerItem || !defenderItem) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.duelGone, { emoji: config.appearance.warningEmoji }),
      ),
    );
    return;
  }

  const stake = BigInt(duel.stake);
  const challengerPlayer = await prisma.player.findUnique({
    where: { discordId: BigInt(duel.challengerId) },
  });
  const defenderPlayer = await prisma.player.findUnique({
    where: { discordId: BigInt(duel.targetId) },
  });

  if (
    !challengerPlayer ||
    !defenderPlayer ||
    challengerPlayer.money < stake ||
    defenderPlayer.money < stake
  ) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.duelStakeGone, {
          emoji: config.appearance.errorEmoji,
          stake: fmtCoins(stake),
        }),
      ),
    );
    return;
  }

  const challengerStrength = clubStrength(challengerItem.ball, challengerItem);
  const defenderStrength = clubStrength(defenderItem.ball, defenderItem);

  const winnerDiscordId =
    challengerStrength >= defenderStrength ? duel.challengerId : duel.targetId;

  const pot = stake * 2n;

  await prisma.player.update({
    where: { discordId: BigInt(duel.challengerId) },
    data: {
      money:
        winnerDiscordId === duel.challengerId
          ? { increment: pot - stake }
          : { decrement: stake },
    },
  });

  await prisma.player.update({
    where: { discordId: BigInt(duel.targetId) },
    data: {
      money:
        winnerDiscordId === duel.targetId
          ? { increment: pot - stake }
          : { decrement: stake },
    },
  });

  await interaction.update({
    components: [
      panel({
        accentColor: accents.success,
        content: heading(
          icons.trophy,
          fill(panels.duelWonTitle, {}),
          fill(panels.duelWonSubtitle, {
            winner: `<@${winnerDiscordId}>`,
          }),
        ),
        fields: [
          [
            fill(panels.duelScoreLine, {
              home: `**${challengerItem.ball.country}**`,
              homeRarity: tierFromRarity(challengerItem.ball.rarity).key,
              away: `**${defenderItem.ball.country}**`,
              awayRarity: tierFromRarity(defenderItem.ball.rarity).key,
            }),
            fill(panels.balanceLine, { balance: fmtCoins(pot) }),
          ].join("\n"),
        ],
        footer: true,
      }).toJSON(),
    ],
  });
}

const matchdayCommand: FCDexCommand = {
  data: new SlashCommandBuilder()
    .setName("matchday")
    .setDescription(config.commands.matchday)
    .addSubcommand((sub) =>
      sub.setName("play").setDescription(config.commands.matchdayPlay),
    )
    .addSubcommand((sub) =>
      sub
        .setName("duel")
        .setDescription(config.commands.matchdayDuel)
        .addUserOption((option) =>
          option
            .setName("opponent")
            .setDescription(config.commands.matchdayDuelOpponent)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("club")
            .setDescription(config.commands.matchdayDuelClub)
            .setRequired(true),
        ),
    ),
  async execute(interaction) {
    const name = interaction.options.getSubcommand(true);

    if (name === "play") await playMatchday(interaction);
    if (name === "duel") await startDuel(interaction);
  },
};

const matchdayPackage: FCDexModule = {
  name: "matchday",

  register(client) {
    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isButton()) return;

      if (interaction.customId === "matchday:acceptrules") {
        await acceptRules(interaction);
        return;
      }

      if (!interaction.customId.startsWith("matchday:duel:")) return;

      const decision = interaction.customId.split(":")[3];

      await resolveDuel(interaction, decision === "accept");
    });
  },

  commands: [matchdayCommand],
};

export default matchdayPackage;
