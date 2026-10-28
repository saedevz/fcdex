import { type Client, Events, type Guild } from "discord.js";
import { config } from "../../config/config.js";
import { prisma } from "../../db/prisma.js";
import type { FCDexModule } from "../loader.js";
import { blacklistGuildCache, fill, isGuildBlacklisted } from "../pool.js";

function log(message: string): void {
  console.log(`[Guard] ${message}`);
}

function farmReason(
  memberCount: number,
  botCount: number,
  realCount: number,
): string | null {
  const { minMembers, botFloodCount, minRealMembers } = config.guard;

  if (memberCount < minMembers) {
    return fill(config.guard.messages.leaveReason, {});
  }

  if (botCount >= botFloodCount && realCount < minRealMembers) {
    return fill(config.guard.messages.leaveReason, {});
  }

  return null;
}

async function evaluateGuild(guild: Guild): Promise<void> {
  if (await isGuildBlacklisted(guild.id)) return;

  let botCount = 0;
  let realCount = 0;

  try {
    const members = await guild.members.fetch();

    for (const member of members.values()) {
      if (member.user.bot) {
        botCount += 1;
      } else {
        realCount += 1;
      }
    }
  } catch (error) {
    log(
      `member fetch failed for ${guild.id}: ${error instanceof Error ? error.message : error}`,
    );
    return;
  }

  const reason = farmReason(guild.memberCount, botCount, realCount);

  if (!reason) return;

  log(
    fill(config.guard.messages.left, {
      emoji: config.appearance.warningEmoji,
      guild: guild.name,
      id: guild.id,
      reason,
    }),
  );

  await prisma.blacklistedGuild.upsert({
    where: { discordId: BigInt(guild.id) },
    update: { reason, date: new Date() },
    create: {
      discordId: BigInt(guild.id),
      reason,
      date: new Date(),
      moderatorId: null,
    },
  });

  blacklistGuildCache(guild.id);

  try {
    await guild.leave();
  } catch (error) {
    log(
      `leave failed for ${guild.id}: ${error instanceof Error ? error.message : error}`,
    );
  }
}

async function scanExistingGuilds(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    await evaluateGuild(guild);
    await new Promise((resolve) =>
      setTimeout(resolve, config.guard.scanDelayMs),
    );
  }
}

const guardModule: FCDexModule = {
  name: "guard",

  register(client) {
    client.on(Events.GuildCreate, async (guild) => {
      await evaluateGuild(guild);
    });

    client.once(Events.ClientReady, async (ready) => {
      log(`scanning ${ready.guilds.cache.size} guild(s)`);
      await scanExistingGuilds(ready);
    });
  },

  commands: [],
};

export default guardModule;
