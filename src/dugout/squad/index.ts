import {
  type ChatInputCommandInteraction,
  Events,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "../../config/config.js";
import { prisma } from "../../db/prisma.js";
import type { FCDexCommand, FCDexModule } from "../loader.js";
import {
  addMoney,
  collectionArtUrl,
  completionRank,
  ensurePlayer,
  fill,
  fmtCoins,
  kitLabel,
  readExtras,
  tierFromRarity,
  writeExtras,
} from "../pool.js";
import { ephemeralReply, field, heading, panel, panelReply } from "../ui.js";

const DAILY_INTERVAL = 24 * 60 * 60 * 1000;

const { icons } = config.appearance;

function itemMarkers(item: { favorite: boolean; locked: Date | null }): string {
  return `${item.favorite ? ` ${icons.heart}` : ""}${item.locked ? ` ${icons.lock}` : ""}`;
}

async function showProgress(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const player = await ensurePlayer(interaction.user.id);
  const { panels } = config.squad;

  const items = await prisma.ballInstance.findMany({
    where: { playerId: player.id, deleted: false },
    include: { ball: true, special: true },
    orderBy: [{ favorite: "desc" }, { catchDate: "asc" }],
  });

  const totalClubs = await prisma.ball.count({ where: { enabled: true } });
  const spawnableSpecials = await prisma.special.count({
    where: { rarity: { gt: 0 } },
  });

  if (items.length === 0) {
    await interaction.reply(
      ephemeralReply(
        fill(config.squad.messages.empty, {
          emoji: config.appearance.infoEmoji,
          collectible: config.collectible.plural,
        }),
      ),
    );
    return;
  }

  const distinctClubs = new Set(items.map((item) => item.ballId)).size;
  const distinctKits = new Set(
    items.map((item) => `${item.ballId}:${item.specialId ?? 0}`),
  ).size;
  const totalKits = Math.max(1, totalClubs * (spawnableSpecials + 1));

  const clubPercent = Math.floor(
    (distinctClubs / Math.max(1, totalClubs)) * 100,
  );
  const kitPercent = Math.floor((distinctKits / totalKits) * 100);

  const rarityCounts = new Map<string, number>();

  for (const item of items) {
    const key = tierFromRarity(item.ball.rarity).key;
    rarityCounts.set(key, (rarityCounts.get(key) ?? 0) + 1);
  }

  const rarityLines = config.rarity.tiers
    .filter((tier) => (rarityCounts.get(tier.key) ?? 0) > 0)
    .map((tier) =>
      fill(panels.rarityLine, {
        tier: tier.key,
        count: String(rarityCounts.get(tier.key) ?? 0),
      }),
    );

  const listLines = items.slice(0, 25).map((item) => {
    const kit = kitLabel(item.special);

    return fill(panels.itemLine, {
      name: item.ball.country,
      rarity: tierFromRarity(item.ball.rarity).key,
      kit: `${kit.emoji} ${kit.name}`,
      markers: itemMarkers(item),
    });
  });

  await interaction.reply({
    ...panelReply(
      panel({
        accentColor: tierFromRarity(items[0]?.ball.rarity ?? 1).color,
        content: heading(
          icons.chart,
          fill(panels.progressTitle, { user: interaction.user.displayName }),
          fill(panels.completionSubtitle, {
            rank: completionRank(clubPercent),
          }),
        ),
        fields: [
          [
            fill(panels.clubsLine, {
              count: String(distinctClubs),
              total: String(totalClubs),
              percent: String(clubPercent),
            }),
            fill(panels.kitsLine, {
              count: String(distinctKits),
              total: String(totalKits),
              percent: String(kitPercent),
            }),
          ].join("\n"),
          rarityLines.join("\n"),
          listLines.join("\n"),
        ],
        footer: true,
      }),
    ),
  });
}

async function showLast(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const player = await ensurePlayer(interaction.user.id);
  const { panels } = config.squad;

  const last = await prisma.ballInstance.findFirst({
    where: { playerId: player.id, deleted: false },
    orderBy: { catchDate: "desc" },
    include: { ball: true, special: true },
  });

  if (!last) {
    await interaction.reply(
      ephemeralReply(
        fill(config.squad.messages.lastEmpty, {
          emoji: config.appearance.infoEmoji,
          collectible: config.collectible.plural,
        }),
      ),
    );
    return;
  }

  const kit = kitLabel(last.special);
  const art = collectionArtUrl(last.ball);

  await interaction.reply({
    ...panelReply(
      panel({
        accentColor: tierFromRarity(last.ball.rarity).color,
        content: heading(
          icons.ball,
          fill(panels.lastTitle, { user: interaction.user.displayName }),
          fill(panels.lastSubtitle, {
            club: last.ball.country,
            when: `<t:${Math.floor(last.catchDate.getTime() / 1000)}:R>`,
          }),
        ),
        fields: [
          fill(panels.kitLine, { emoji: kit.emoji, kit: kit.name }),
          `-# ATK ${last.ball.attack + last.attackBonus} • HP ${last.ball.health + last.healthBonus}`,
        ],
        ...(art ? { image: art } : {}),
        footer: true,
      }),
    ),
  });
}

async function inspectClubItem(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const itemId = interaction.options.getString("item", true);
  const item = await prisma.ballInstance.findUnique({
    where: { id: BigInt(itemId) },
    include: { ball: true, player: true, special: true },
  });

  if (!item || item.player.discordId !== BigInt(interaction.user.id)) {
    await interaction.reply(
      ephemeralReply(
        fill(config.squad.messages.notFound, {
          emoji: config.appearance.errorEmoji,
        }),
      ),
    );
    return;
  }

  const { panels } = config.squad;
  const kit = kitLabel(item.special);
  const art = collectionArtUrl(item.ball);

  await interaction.reply({
    ...panelReply(
      panel({
        accentColor: tierFromRarity(item.ball.rarity).color,
        content: heading(
          icons.crest,
          fill(panels.dexTitle, { club: item.ball.country }),
          fill(panels.dexSubtitle, {
            rarity: tierFromRarity(item.ball.rarity).key,
            obtained: `<t:${Math.floor(item.catchDate.getTime() / 1000)}:R>`,
          }),
        ),
        fields: [
          [
            fill(panels.kitLine, { emoji: kit.emoji, kit: kit.name }),
            fill(panels.abilityLine, {
              ability: item.ball.capacityName,
            }),
            `-# ${item.ball.capacityDescription}`,
            field(panels.favorite, item.favorite ? panels.yes : panels.no),
            field(
              panels.tradeable,
              item.tradeable && !item.locked ? panels.yes : panels.no,
            ),
            `-# ATK ${item.ball.attack + item.attackBonus} • HP ${item.ball.health + item.healthBonus}`,
          ].join("\n"),
        ],
        ...(art ? { thumbnail: art } : {}),
        buttons: [
          [
            {
              customId: `squad:fav:${item.id}`,
              label: item.favorite
                ? config.squad.labels.unfavorite
                : config.squad.labels.favorite,
              emoji: icons.heart,
            },
            {
              customId: `squad:lock:${item.id}`,
              label: item.locked
                ? config.squad.labels.unlock
                : config.squad.labels.lock,
              emoji: icons.lock,
            },
          ],
        ],
        footer: true,
      }),
    ),
  });
}

async function claimDaily(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const player = await ensurePlayer(interaction.user.id);
  const extras = readExtras(player);
  const now = Date.now();
  const last = extras.lastDailyAt ? Date.parse(extras.lastDailyAt) : 0;
  const elapsed = now - last;

  if (last > 0 && elapsed < DAILY_INTERVAL) {
    await interaction.reply(
      ephemeralReply(
        fill(config.squad.messages.wagesCooled, {
          emoji: config.appearance.warningEmoji,
          window: String(Math.floor((last + DAILY_INTERVAL) / 1000)),
        }),
      ),
    );
    return;
  }

  await writeExtras(interaction.user.id, {
    lastDailyAt: new Date().toISOString(),
  });

  const balance = await addMoney(
    interaction.user.id,
    config.economy.daily.amount,
  );

  const { panels } = config.squad;

  await interaction.reply({
    ...panelReply(
      panel({
        content: heading(
          config.economy.daily.emoji,
          panels.wagesTitle,
          fill(panels.wagesSubtitle, {
            reward: fmtCoins(config.economy.daily.amount),
          }),
        ),
        fields: [fill(panels.newBalance, { balance: fmtCoins(balance) })],
        footer: true,
      }),
    ),
  });
}

async function showWallet(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const player = await ensurePlayer(interaction.user.id);
  const { walletTitle, walletTop, walletLine, walletEmpty, size } =
    config.economy.panels;

  const top = await prisma.player.findMany({
    where: { money: { gt: 0n } },
    orderBy: { money: "desc" },
    take: size,
  });

  const fields = [
    fill(config.economy.panels.walletSubtitle, {
      balance: fmtCoins(player.money),
    }),
  ];

  if (top.length > 0) {
    fields.push(
      fill(walletTop, { count: String(size) }),
      top
        .map((entry, index) =>
          fill(walletLine, {
            position: String(index + 1),
            player: `<@${entry.discordId}>`,
            balance: fmtCoins(entry.money),
          }),
        )
        .join("\n"),
    );
  } else {
    fields.push(fill(walletEmpty, { emoji: config.appearance.infoEmoji }));
  }

  await interaction.reply({
    ...panelReply(
      panel({
        content: heading(
          icons.coin,
          fill(walletTitle, { user: interaction.user.displayName }),
        ),
        fields,
        footer: true,
      }),
    ),
  });
}

const squadCommand: FCDexCommand = {
  data: new SlashCommandBuilder()
    .setName("squad")
    .setDescription(config.commands.squad)
    .addSubcommand((sub) =>
      sub.setName("progress").setDescription(config.commands.squadProgress),
    )
    .addSubcommand((sub) =>
      sub.setName("last").setDescription(config.commands.squadLast),
    )
    .addSubcommand((sub) =>
      sub
        .setName("inspect")
        .setDescription(config.commands.squadInspect)
        .addStringOption((option) =>
          option
            .setName("item")
            .setDescription(config.commands.squadInspectItem)
            .setRequired(true),
        ),
    ),
  async execute(interaction) {
    const name = interaction.options.getSubcommand(true);

    if (name === "progress") await showProgress(interaction);
    if (name === "last") await showLast(interaction);
    if (name === "inspect") await inspectClubItem(interaction);
  },
};

const economyCommand: FCDexCommand = {
  data: new SlashCommandBuilder()
    .setName("economy")
    .setDescription(config.commands.economy)
    .addSubcommand((sub) =>
      sub.setName("daily").setDescription(config.commands.economyDaily),
    )
    .addSubcommand((sub) =>
      sub.setName("wallet").setDescription(config.commands.economyWallet),
    ),
  async execute(interaction) {
    const name = interaction.options.getSubcommand(true);

    if (name === "daily") await claimDaily(interaction);
    if (name === "wallet") await showWallet(interaction);
  },
};

const squadPackage: FCDexModule = {
  name: "squad",

  register(client) {
    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith("squad:")) return;

      const [, action, itemId] = interaction.customId.split(":");

      if (!itemId) return;

      const item = await prisma.ballInstance.findUnique({
        where: { id: BigInt(itemId) },
        include: { player: true, ball: true },
      });

      if (!item || item.player.discordId !== BigInt(interaction.user.id)) {
        await interaction.reply(
          ephemeralReply(
            fill(config.squad.messages.notYours, {
              emoji: config.appearance.errorEmoji,
            }),
          ),
        );
        return;
      }

      if (action === "fav") {
        const updated = await prisma.ballInstance.update({
          where: { id: item.id },
          data: { favorite: !item.favorite },
          include: { ball: true },
        });

        await interaction.reply(
          ephemeralReply(
            fill(
              updated.favorite
                ? config.squad.messages.favorited
                : config.squad.messages.unfavorited,
              {
                emoji: config.appearance.successEmoji,
                club: updated.ball.country,
              },
            ),
          ),
        );
        return;
      }

      if (action === "lock") {
        const updated = await prisma.ballInstance.update({
          where: { id: item.id },
          data: { locked: item.locked ? null : new Date() },
          include: { ball: true },
        });

        await interaction.reply(
          ephemeralReply(
            fill(
              updated.locked
                ? config.squad.messages.locked
                : config.squad.messages.unlocked,
              {
                emoji: config.appearance.successEmoji,
                club: updated.ball.country,
              },
            ),
          ),
        );
      }
    });
  },

  commands: [squadCommand, economyCommand],
};

export default squadPackage;
