import {
  type ButtonInteraction,
  Events,
  type InteractionReplyOptions,
  type MessageCreateOptions,
  ModalBuilder,
  type ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { config } from "../../config/config.js";
import { prisma } from "../../db/prisma.js";
import type { FCDexCommand, FCDexModule } from "../loader.js";
import {
  addMoney,
  catchReward,
  clubNames,
  fill,
  fmtCoins,
  isBanned,
  kitLabel,
  pick,
  pitchFor,
  spawnArtUrl,
  tierFromRarity,
} from "../pool.js";
import { ephemeralReply, heading, panel, panelReply } from "../ui.js";
import {
  armedSpawns,
  messageCounter,
  pressCooldown,
  spawnClub,
  startSweeper,
} from "./spawn.js";

interface ReplySource {
  reply: (options: InteractionReplyOptions) => Promise<unknown>;
  user: { id: string };
}

async function showRarity(source: ReplySource): Promise<void> {
  const tiers = config.rarity.tiers
    .map((tier) =>
      fill(config.catch.help.rarityLine, {
        tier: tier.key,
        weight: tier.below === 1.01 ? "rest" : `below ${tier.below}`,
        reward: fmtCoins(
          config.economy.catchRewards[
            tier.key as keyof typeof config.economy.catchRewards
          ] ?? 0,
        ),
      }),
    )
    .join("\n");

  await source.reply({
    ...panelReply(
      panel({
        content: heading(
          config.appearance.icons.sparkle,
          config.catch.help.rarityTitle,
          config.catch.help.raritySubtitle,
        ),
        fields: [tiers],
        footer: true,
      }),
    ),
  });
}

async function showRules(source: ReplySource): Promise<void> {
  await source.reply({
    ...panelReply(
      panel({
        content: fill(config.catch.help.rules, {
          currency: config.economy.currency,
        }),
        footer: true,
      }),
    ),
  });
}

async function openCatchModal(interaction: ButtonInteraction): Promise<void> {
  if (await isBanned(interaction.user.id)) {
    await interaction.reply(
      ephemeralReply(
        fill(config.bot.banned, { emoji: config.appearance.errorEmoji }),
      ),
    );
    return;
  }

  const spawnKey = interaction.customId.split(":")[2] ?? "";
  const spawn = armedSpawns.get(spawnKey);

  if (!spawn || spawn.claimed) {
    await interaction.reply(
      ephemeralReply(
        fill(pick(config.catch.messages.slow), {
          user: `<@${interaction.user.id}>`,
          emoji: config.appearance.warningEmoji,
          collectible: config.collectible.singular,
        }),
      ),
    );
    return;
  }

  const lastPress = pressCooldown.get(interaction.user.id) ?? 0;
  const elapsed = Date.now() - lastPress;

  if (elapsed < config.catch.cooldownSeconds * 1000) {
    await interaction.reply(
      ephemeralReply(
        fill(config.catch.messages.cooldown, {
          emoji: config.appearance.warningEmoji,
          seconds: String(
            Math.ceil((config.catch.cooldownSeconds * 1000 - elapsed) / 1000),
          ),
        }),
      ),
    );
    return;
  }

  pressCooldown.set(interaction.user.id, Date.now());

  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(`clubs:submit:${spawnKey}`)
      .setTitle(config.catch.modal.title)
      .addComponents(
        new TextInputBuilder()
          .setCustomId("guess")
          .setLabel(config.catch.modal.nameLabel)
          .setPlaceholder(config.catch.modal.namePlaceholder)
          .setStyle(TextInputStyle.Short)
          .setMinLength(config.catch.minNameLength)
          .setMaxLength(config.catch.maxNameLength)
          .setRequired(true),
      ),
  );
}

async function resolveCatch(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const spawnKey = interaction.customId.split(":")[2] ?? "";
  const guess = interaction.fields
    .getTextInputValue("guess")
    .trim()
    .toLowerCase();
  const spawn = armedSpawns.get(spawnKey);

  if (!spawn) {
    await interaction.reply(
      ephemeralReply(
        fill(pick(config.catch.messages.slow), {
          user: `<@${interaction.user.id}>`,
          emoji: config.appearance.errorEmoji,
          collectible: config.collectible.singular,
        }),
      ),
    );
    return;
  }

  const ball = await prisma.ball.findUnique({ where: { id: spawn.ballId } });
  if (!ball) return;

  if (!clubNames(ball).includes(guess)) {
    await interaction.reply(
      ephemeralReply(
        fill(pick(config.catch.messages.wrong), {
          user: `<@${interaction.user.id}>`,
          emoji: config.appearance.errorEmoji,
        }),
      ),
    );
    return;
  }

  if (spawn.claimed) {
    await interaction.reply(
      ephemeralReply(
        fill(pick(config.catch.messages.slow), {
          user: `<@${interaction.user.id}>`,
          emoji: config.appearance.warningEmoji,
          collectible: config.collectible.singular,
        }),
      ),
    );
    return;
  }

  spawn.claimed = true;
  armedSpawns.delete(spawnKey);

  const player = await prisma.player.upsert({
    where: { discordId: BigInt(interaction.user.id) },
    update: {},
    create: { discordId: BigInt(interaction.user.id), extraData: {} },
  });

  const instance = await prisma.ballInstance.create({
    data: {
      catchDate: new Date(),
      ballId: ball.id,
      playerId: player.id,
      specialId: spawn.specialId,
      tradeable: ball.tradeable,
      extraData: {},
    },
  });

  await prisma.spawnWaveEntry.updateMany({
    where: { spawnKey: spawnKey, caught: false },
    data: {
      caught: true,
      instanceId: instance.id,
      reward: BigInt(catchReward(ball.rarity)),
    },
  });

  const reward = catchReward(ball.rarity);
  const balance = await addMoney(interaction.user.id, reward);

  const special = spawn.specialId
    ? await prisma.special.findUnique({ where: { id: spawn.specialId } })
    : null;
  const kit = kitLabel(special);
  const tier = tierFromRarity(ball.rarity);
  const art = spawnArtUrl(ball);

  await interaction.reply(
    panelReply(
      panel({
        accentColor: tier.color,
        content: heading(
          config.appearance.icons.ball,
          fill(config.catch.messages.revealedTitle, { club: ball.country }),
          fill(config.catch.messages.revealedSubtitle, {
            rarity: tier.key,
            reward: fmtCoins(reward),
          }),
        ),
        fields: [
          fill(pick(config.catch.messages.caught), {
            user: `<@${interaction.user.id}>`,
            club: `**${ball.country}**`,
            emoji: config.appearance.successEmoji,
          }),
          fill(config.catch.messages.kitLine, {
            emoji: kit.emoji,
            kit: kit.name,
          }),
          `-# Balance: ${fmtCoins(balance)}`,
        ],
        ...(art ? { image: art } : {}),
        footer: true,
      }),
      false,
    ),
  );
}

const rarityCommand: FCDexCommand = {
  data: new SlashCommandBuilder()
    .setName("rarity")
    .setDescription(config.commands.rarity),
  async execute(interaction) {
    await showRarity(interaction);
  },
};

const clubsPackage: FCDexModule = {
  name: "clubs",

  register(client) {
    if (!config.spawning.enabled) return;

    startSweeper();

    client.on(Events.MessageCreate, async (message) => {
      if (!message.inGuild() || message.author.bot) return;

      const pitch = await pitchFor(message.guildId);

      if (!pitch.enabled) return;
      if (
        pitch.spawnChannel &&
        BigInt(message.channelId) !== pitch.spawnChannel
      ) {
        return;
      }

      const count = (messageCounter.get(message.guildId) ?? 0) + 1;

      if (count < config.spawning.minMessages) {
        messageCounter.set(message.guildId, count);
        return;
      }

      if (!message.channel.isSendable()) return;

      await spawnClub(message.guildId, (payload: MessageCreateOptions) =>
        message.channel.send(payload),
      );
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isButton() && interaction.customId.startsWith("clubs:")) {
        const action = interaction.customId.split(":")[1];

        if (action === "catch" && interaction.isButton()) {
          await openCatchModal(interaction);
          return;
        }

        if (action === "rarity") {
          await showRarity(interaction);
          return;
        }

        if (action === "help") {
          await showRules(interaction);
        }

        return;
      }

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("clubs:submit:")
      ) {
        await resolveCatch(interaction);
      }
    });
  },

  commands: [rarityCommand],
};

export default clubsPackage;
