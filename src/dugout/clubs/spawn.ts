import { ButtonStyle, type MessageCreateOptions } from "discord.js";
import { config } from "../../config/config.js";
import { prisma } from "../../db/prisma.js";
import type { Ball, Special } from "../../generated/prisma/client.js";
import {
  catchReward,
  fill,
  pick,
  spawnArtUrl,
  spawnCatalog,
  tierFromRarity,
} from "../pool.js";
import { heading, panel, panelMessage } from "../ui.js";

export { spawnCatalog };

export interface ArmedSpawn {
  ballId: bigint;
  specialId: bigint | null;
  expiresAt: number;
  claimed: boolean;
}

export const armedSpawns = new Map<string, ArmedSpawn>();
export const messageCounter = new Map<string, number>();
export const lastSpawnAt = new Map<string, number>();
export const pressCooldown = new Map<string, number>();

export async function announceSpawn(
  ball: Ball,
  special: Special | null,
  spawnKey: string,
  send: (payload: MessageCreateOptions) => Promise<unknown>,
): Promise<void> {
  const tier = tierFromRarity(ball.rarity);
  const art = spawnArtUrl(ball);

  await send(
    panelMessage(
      panel({
        accentColor: tier.color,
        content: heading(
          config.appearance.icons.ball,
          fill(pick(config.catch.messages.appeared), {
            collectible: config.collectible.singular,
          }),
          fill(config.catch.messages.spawnSubtitle, {
            label: config.catch.labels.catch.toLowerCase(),
            tier: tier.key,
          }),
        ),
        fields: [
          config.catch.messages.spawnHint,
          special
            ? fill(config.catch.messages.kitLine, {
                emoji: special.emoji ?? config.appearance.icons.sparkle,
                kit: special.name,
              })
            : "",
        ].filter((entry) => entry.length > 0),
        ...(art ? { image: art } : {}),
        buttons: [
          [
            {
              customId: `clubs:catch:${spawnKey}`,
              label: config.catch.labels.catch,
              emoji: config.appearance.icons.ball,
              style: ButtonStyle.Success,
            },
            {
              customId: "clubs:rarity",
              label: config.catch.labels.inspect,
              emoji: config.appearance.icons.sparkle,
            },
            {
              customId: "clubs:help",
              label: config.catch.labels.help,
              emoji: config.appearance.icons.clipboard,
            },
          ],
        ],
        footer: true,
      }),
    ),
  );
}

export async function spawnClub(
  guildId: string,
  send: (payload: MessageCreateOptions) => Promise<unknown>,
): Promise<void> {
  const now = Date.now();
  const [minMinutes, maxMinutes] = config.spawning.chanceRangeMinutes;
  const interval = minMinutes + Math.random() * (maxMinutes - minMinutes);
  const last = lastSpawnAt.get(guildId) ?? 0;

  if (now - last < interval * 60_000) return;

  const [ball, special] = await Promise.all([
    spawnCatalog.sampleBall(),
    spawnCatalog.sampleSpecial(),
  ]);

  if (!ball) return;

  messageCounter.delete(guildId);
  lastSpawnAt.set(guildId, now);

  const spawnKey = crypto.randomUUID();
  armedSpawns.set(spawnKey, {
    ballId: ball.id,
    specialId: special?.id ?? null,
    expiresAt: now + config.catch.timeoutSeconds * 1000,
    claimed: false,
  });

  await announceSpawn(ball, special, spawnKey, send);

  if (Math.random() * 100 < config.waves.chancePercent) {
    await tryStartWave(guildId, send);
  }
}

function pickBand() {
  const bands = config.waves.bands;
  const total = bands.reduce((sum, band) => sum + band.chancePercent, 0);
  let roll = Math.random() * total;

  for (const band of bands) {
    roll -= band.chancePercent;

    if (roll < 0) return band;
  }

  return null;
}

export async function tryStartWave(
  guildId: string,
  send: (payload: MessageCreateOptions) => Promise<unknown>,
): Promise<void> {
  const band = pickBand();

  if (!band) return;

  const bandIndex = config.waves.bands.findIndex(
    (entry) => entry.below === band.below,
  );
  const floor =
    bandIndex <= 0 ? 0 : (config.waves.bands[bandIndex - 1]?.below ?? 0);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [usedToday, activeWave] = await Promise.all([
    prisma.spawnWave.count({
      where: {
        guildId: BigInt(guildId),
        createdAt: { gte: dayStart },
        rarityCeiling: { equals: band.below },
        status: { not: "annulled" },
      },
    }),
    prisma.spawnWave.findFirst({
      where: { guildId: BigInt(guildId), status: "active" },
    }),
  ]);

  if (activeWave || usedToday >= band.dailyMax) return;

  const [minSize, maxSize] = band.size;
  const size = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));

  const wave = await prisma.spawnWave.create({
    data: {
      guildId: BigInt(guildId),
      waveKey: crypto.randomUUID().slice(0, 8),
      rarityFloor: floor,
      rarityCeiling: band.below,
      size,
      status: "active",
    },
  });

  await send(
    panelMessage(
      panel({
        accentColor: 0xf59e0b,
        content: heading(
          config.appearance.icons.whistle,
          fill(config.waves.messages.startedTitle, {}),
          fill(config.waves.messages.startedSubtitle, {
            label: band.label,
            count: String(size),
          }),
        ),
        fields: [
          fill(config.waves.messages.bandLine, {
            floor: String(wave.rarityFloor),
            ceiling: String(wave.rarityCeiling),
          }),
        ],
        footer: true,
      }),
    ),
  );

  void runWave(wave.id, size, wave.rarityFloor, wave.rarityCeiling, send);
}

async function runWave(
  waveId: bigint,
  remaining: number,
  floor: number,
  ceiling: number,
  send: (payload: MessageCreateOptions) => Promise<unknown>,
): Promise<void> {
  for (let index = 0; index < remaining; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, config.waves.staggerMs));

    const wave = await prisma.spawnWave.findUnique({
      where: { id: waveId },
      select: { status: true },
    });

    if (wave?.status !== "active") return;

    const ball = await spawnCatalog.sampleBallWithin(floor, ceiling);

    if (!ball) continue;

    const special = await spawnCatalog.sampleSpecial();
    const spawnKey = crypto.randomUUID();

    armedSpawns.set(spawnKey, {
      ballId: ball.id,
      specialId: special?.id ?? null,
      expiresAt: Date.now() + config.waves.timeoutSeconds * 1000,
      claimed: false,
    });

    await prisma.spawnWaveEntry.create({
      data: {
        waveId,
        ballId: ball.id,
        specialId: special?.id ?? null,
        spawnKey,
        reward: BigInt(catchReward(ball.rarity)),
      },
    });

    await announceSpawn(ball, special, spawnKey, send);
  }

  await prisma.spawnWave.updateMany({
    where: { id: waveId, status: "active" },
    data: { status: "completed", endedAt: new Date() },
  });
}

const SWEEP_INTERVAL_MS = 60_000;

export function startSweeper(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();

    for (const [key, spawn] of armedSpawns) {
      if (spawn.expiresAt < now) armedSpawns.delete(key);
    }

    const cooldownWindow = Math.max(config.catch.cooldownSeconds, 1) * 10_000;

    for (const [key, pressedAt] of pressCooldown) {
      if (now - pressedAt > cooldownWindow) pressCooldown.delete(key);
    }

    if (messageCounter.size > 1000) messageCounter.clear();
  }, SWEEP_INTERVAL_MS);
}
