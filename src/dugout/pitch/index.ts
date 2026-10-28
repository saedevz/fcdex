import {
  type ChatInputCommandInteraction,
  type ContainerBuilder,
  Events,
  type Guild,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "../../config/config.js";
import { prisma } from "../../db/prisma.js";
import { announceSpawn, spawnCatalog } from "../clubs/spawn.js";
import type { FCDexCommand, FCDexModule } from "../loader.js";
import {
  invalidatePitch as clearPitchCache,
  fill,
  fmtCoins,
  pitchFor as readPitch,
} from "../pool.js";
import { ephemeralReply, heading, panel, panelReply } from "../ui.js";

const { icons } = config.appearance;

async function writePitch(
  guildId: string,
  patch: { enabled?: boolean; spawnChannel?: bigint | null },
): Promise<void> {
  await prisma.guildConfig.upsert({
    where: { guildId: BigInt(guildId) },
    update: patch,
    create: {
      guildId: BigInt(guildId),
      enabled: patch.enabled ?? true,
      spawnChannel: patch.spawnChannel ?? null,
    },
  });

  clearPitchCache(guildId);
}

async function statusPanel(guild: Guild): Promise<ContainerBuilder> {
  const settings = await readPitch(guild.id);
  const { panels, messages, labels } = config.pitch;

  return panel({
    content: heading(
      icons.stadium,
      fill(panels.title, { guild: guild.name }),
      fill(panels.subtitle, {
        state: settings.enabled ? messages.spawnsOn : messages.spawnsOff,
      }),
    ),
    fields: [
      fill(panels.channelLine, {
        channel: settings.spawnChannel
          ? `<#${settings.spawnChannel}>`
          : messages.anyChannel,
      }),
    ],
    buttons: [
      [
        {
          customId: "pitch:toggle",
          label: settings.enabled ? labels.disable : labels.enable,
          emoji: icons.gear,
        },
        {
          customId: "pitch:channel",
          label: labels.pin,
          emoji: icons.pin,
        },
      ],
    ],
    footer: true,
  });
}

async function forceSpawn(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channel = interaction.channel;

  if (!channel?.isSendable()) {
    await interaction.reply(
      ephemeralReply(
        fill(config.pitch.messages.spawnNoChannel, {
          emoji: config.appearance.errorEmoji,
        }),
      ),
    );
    return;
  }

  const ball = await spawnCatalog.sampleBall();

  if (!ball) {
    await interaction.reply(
      ephemeralReply(
        fill(config.pitch.messages.spawnNoChannel, {
          emoji: config.appearance.errorEmoji,
        }),
      ),
    );
    return;
  }

  const spawnKey = crypto.randomUUID();

  await announceSpawn(ball, null, spawnKey, (payload) => channel.send(payload));

  await interaction.reply({
    ...panelReply(
      panel({
        content: heading(
          icons.whistle,
          fill(config.pitch.messages.spawnForced, {}),
        ),
        footer: true,
      }),
    ),
  });
}

async function toggleBan(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const user = interaction.options.getUser("collector", true);
  const discordId = BigInt(user.id);

  const existing = await prisma.blacklistedId.findUnique({
    where: { discordId },
  });

  if (existing) {
    await prisma.blacklistedId.delete({ where: { id: existing.id } });

    await interaction.reply(
      ephemeralReply(
        fill(config.pitch.messages.unbanned, {
          emoji: config.appearance.successEmoji,
          user: `<@${user.id}>`,
        }),
      ),
    );
    return;
  }

  await prisma.blacklistedId.create({
    data: {
      discordId,
      reason: null,
      date: new Date(),
      moderatorId: interaction.user.id ? BigInt(interaction.user.id) : null,
    },
  });

  await interaction.reply(
    ephemeralReply(
      fill(config.pitch.messages.banned, {
        emoji: config.appearance.errorEmoji,
        user: `<@${user.id}>`,
      }),
    ),
  );
}

function waveBandLabel(floor: number, ceiling: number): string {
  const band = config.waves.bands.find((entry) => entry.below === ceiling);

  return band?.label ?? `${floor}–${ceiling}`;
}

async function manageWaves(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const action = interaction.options.getString("action", true);
  const waveKey = interaction.options.getString("wave");
  const { messages } = config.waves;

  if (action === "list") {
    const waves = await prisma.spawnWave.findMany({
      where: { guildId: BigInt(interaction.guild?.id ?? 0n) },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { entries: true },
    });

    if (waves.length === 0) {
      await interaction.reply(
        ephemeralReply(
          fill(messages.listEmpty, { emoji: config.appearance.infoEmoji }),
        ),
      );
      return;
    }

    const lines = waves
      .map((wave) => {
        const caught = wave.entries.filter((entry) => entry.caught).length;

        return fill(messages.listLine, {
          key: wave.waveKey,
          label: waveBandLabel(wave.rarityFloor, wave.rarityCeiling),
          status: wave.status,
          caught: String(caught),
          size: String(wave.size),
        });
      })
      .join("\n");

    await interaction.reply({
      ...panelReply(
        panel({
          content: heading(icons.whistle, fill(messages.listTitle, {})),
          fields: [lines],
          footer: true,
        }),
      ),
    });
    return;
  }

  if (!waveKey) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.notFound, {
          emoji: config.appearance.errorEmoji,
          wave: "—",
        }),
      ),
    );
    return;
  }

  const wave = await prisma.spawnWave.findUnique({
    where: { waveKey },
    include: { entries: true },
  });

  if (!wave || wave.guildId !== BigInt(interaction.guild?.id ?? 0n)) {
    await interaction.reply(
      ephemeralReply(
        fill(messages.notFound, {
          emoji: config.appearance.errorEmoji,
          wave: waveKey,
        }),
      ),
    );
    return;
  }

  if (action === "annul") {
    await prisma.spawnWave.update({
      where: { id: wave.id },
      data: { status: "annulled", endedAt: new Date() },
    });

    await prisma.spawnWaveEntry.deleteMany({
      where: { waveId: wave.id, caught: false },
    });

    await interaction.reply(
      ephemeralReply(
        fill(messages.annulled, {
          emoji: config.appearance.successEmoji,
          wave: wave.waveKey,
        }),
      ),
    );
    return;
  }

  if (action === "revert") {
    const caughtEntries = wave.entries.filter(
      (entry) => entry.caught && entry.instanceId,
    );

    let rewards = 0n;

    for (const entry of caughtEntries) {
      if (!entry.instanceId) continue;

      const instance = await prisma.ballInstance.findUnique({
        where: { id: entry.instanceId },
        include: { player: true },
      });

      if (!instance) continue;

      let refund = entry.reward;

      if (refund > instance.player.money) {
        refund = instance.player.money;
      }

      rewards += refund;

      await prisma.$transaction([
        prisma.ballInstance.delete({ where: { id: instance.id } }),
        prisma.player.update({
          where: { id: instance.playerId },
          data: { money: { decrement: refund } },
        }),
      ]);
    }

    await prisma.spawnWave.update({
      where: { id: wave.id },
      data: { status: "reverted", endedAt: new Date() },
    });

    await interaction.reply(
      ephemeralReply(
        fill(messages.reverted, {
          emoji: config.appearance.successEmoji,
          wave: wave.waveKey,
          instances: String(caughtEntries.length),
          rewards: fmtCoins(rewards),
        }),
      ),
    );
  }
}

const pitchCommand: FCDexCommand = {
  data: new SlashCommandBuilder()
    .setName("pitch")
    .setDescription(config.commands.pitch)
    .addSubcommand((sub) =>
      sub.setName("status").setDescription(config.commands.pitchStatus),
    )
    .addSubcommand((sub) =>
      sub.setName("force").setDescription(config.commands.pitchForce),
    )
    .addSubcommand((sub) =>
      sub
        .setName("ban")
        .setDescription(config.commands.pitchBan)
        .addUserOption((option) =>
          option
            .setName("collector")
            .setDescription(config.commands.pitchBanCollector)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("wave")
        .setDescription(config.commands.pitchWave)
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription(config.commands.pitchWaveAction)
            .setRequired(true)
            .addChoices(
              { name: config.waves.labels.list, value: "list" },
              { name: config.waves.labels.annul, value: "annul" },
              { name: config.waves.labels.revert, value: "revert" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("wave")
            .setDescription(config.commands.pitchWaveKey)
            .setRequired(false),
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply(
        ephemeralReply(
          fill(config.pitch.messages.guildOnly, {
            emoji: config.appearance.warningEmoji,
          }),
        ),
      );
      return;
    }

    const name = interaction.options.getSubcommand(true);

    if (name === "status") {
      await interaction.reply({
        ...panelReply(await statusPanel(interaction.guild), false),
      });
      return;
    }

    if (name === "force") {
      await forceSpawn(interaction);
      return;
    }

    if (name === "ban") {
      await toggleBan(interaction);
      return;
    }

    if (name === "wave") {
      await manageWaves(interaction);
    }
  },
};

const pitchPackage: FCDexModule = {
  name: "pitch",

  register(client) {
    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith("pitch:")) return;

      const [, action] = interaction.customId.split(":");

      if (!interaction.guild || !interaction.inGuild()) return;

      const member = await interaction.guild.members.fetch(interaction.user.id);

      if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply(
          ephemeralReply(
            fill(config.pitch.messages.needsManage, {
              emoji: config.appearance.errorEmoji,
            }),
          ),
        );
        return;
      }

      const current = await readPitch(interaction.guild.id);

      if (action === "toggle") {
        await writePitch(interaction.guild.id, {
          enabled: !current.enabled,
        });
      }

      if (action === "channel") {
        const pinned =
          current.spawnChannel !== null &&
          current.spawnChannel === BigInt(interaction.channelId);

        await writePitch(interaction.guild.id, {
          spawnChannel: pinned ? null : BigInt(interaction.channelId),
        });
      }

      await interaction.update({
        components: [await statusPanel(interaction.guild)],
      });
    });
  },

  commands: [pitchCommand],
};

export default pitchPackage;
