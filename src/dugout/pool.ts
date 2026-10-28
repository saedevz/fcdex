import { config } from "../config/config.js";
import { prisma } from "../db/prisma.js";
import type { Ball, Player, Special } from "../generated/prisma/client.js";

export interface PlayerExtras {
  lastDailyAt?: string;
  rulesAcceptedAt?: string;
}

export type PlayerExtrasKey = keyof PlayerExtras;

export function readExtras(player: { extraData: unknown }): PlayerExtras {
  if (player.extraData && typeof player.extraData === "object") {
    return player.extraData as PlayerExtras;
  }

  return {};
}

export async function writeExtras(
  discordId: string,
  patch: Partial<PlayerExtras>,
): Promise<void> {
  const player = await ensurePlayer(discordId);
  const merged = { ...readExtras(player), ...patch };

  await prisma.player.update({
    where: { id: player.id },
    data: { extraData: JSON.parse(JSON.stringify(merged)) },
  });
}

export async function ensurePlayer(discordId: string): Promise<Player> {
  return prisma.player.upsert({
    where: { discordId: BigInt(discordId) },
    update: {},
    create: { discordId: BigInt(discordId), extraData: {} },
  });
}

export async function addMoney(
  discordId: string,
  amount: number,
): Promise<bigint> {
  const player = await ensurePlayer(discordId);

  const updated = await prisma.player.update({
    where: { id: player.id },
    data: { money: { increment: BigInt(Math.max(0, Math.trunc(amount))) } },
  });

  return updated.money;
}

export function fmtCoins(amount: bigint | number): string {
  const { currency } = config.economy;
  return `**${amount.toLocaleString("en-US")}** ${currency}`;
}

export function tierFromRarity(rarity: number) {
  const tiers = config.rarity.tiers;

  for (const tier of tiers) {
    if (rarity < tier.below) return tier;
  }

  const last = tiers[tiers.length - 1];

  if (!last) throw new Error("No rarity tiers configured.");

  return last;
}

export function catchReward(rarity: number): number {
  const tier = tierFromRarity(rarity);

  return (
    config.economy.catchRewards[
      tier.key as keyof typeof config.economy.catchRewards
    ] ?? 0
  );
}

export function spawnArtUrl(ball: Pick<Ball, "wildCard">): string | null {
  if (!ball.wildCard) return null;

  return `${config.media.spawnBaseUrl}/${ball.wildCard}`;
}

export function collectionArtUrl(
  ball: Pick<Ball, "collectionCard">,
): string | null {
  if (!ball.collectionCard) return null;

  return `${config.media.collectionBaseUrl}/${ball.collectionCard}`;
}

export function clubNames(ball: Ball): string[] {
  const names = [ball.country, ball.shortName ?? ""];

  for (const alias of (ball.catchNames ?? "").split(";")) {
    names.push(alias.trim());
  }

  return names
    .filter((name) => name.length > 0)
    .map((name) => name.toLowerCase());
}

export function kitLabel(special: Pick<Special, "name" | "emoji"> | null): {
  name: string;
  emoji: string;
} {
  if (!special) {
    return {
      name: config.squad.panels.baseKit,
      emoji: config.appearance.icons.ball,
    };
  }

  return {
    name: special.name,
    emoji: special.emoji ?? config.appearance.icons.sparkle,
  };
}

export async function isBanned(discordId: string): Promise<boolean> {
  const row = await prisma.blacklistedId.findUnique({
    where: { discordId: BigInt(discordId) },
    select: { discordId: true },
  });

  return row !== null;
}

export function clubStrength(
  ball: Ball,
  bonuses?: { attackBonus: number; healthBonus: number },
): number {
  const base = ball.attack + ball.health;
  const bonus = bonuses ? bonuses.attackBonus + bonuses.healthBonus : 0;

  return base + bonus + Math.floor(Math.random() * 300);
}

export function fill(template: string, values: Record<string, string>): string {
  return template.replace(
    /\{(\w+)(?:\.(\w+))?\}/g,
    (_, key: string, attr?: string) => {
      const value = values[key] ?? "";

      if (attr === "capitalize") return capitalize(value);

      return value;
    },
  );
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function pick<T>(items: readonly T[]): T {
  const value = items[Math.floor(Math.random() * items.length)];

  if (value === undefined) {
    throw new Error("Cannot pick from an empty list.");
  }

  return value;
}

export function completionRank(percent: number): string {
  const sorted = [...config.squad.ranks].sort((a, b) => b.min - a.min);

  for (const rank of sorted) {
    if (percent >= rank.min) return rank.title;
  }

  return sorted[sorted.length - 1]?.title ?? "Rookie collector";
}

interface CatalogEntry {
  ball: Ball;
  cumulative: number;
}

interface SpecialEntry {
  special: Special;
  cumulative: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class SpawnCatalog {
  private balls: CatalogEntry[] = [];
  private specials: SpecialEntry[] = [];
  private totalWeight = 0;
  private expiresAt = 0;
  private loading: Promise<void> | null = null;

  constructor(private ttlMs = DEFAULT_TTL_MS) {}

  async refresh(): Promise<void> {
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const [balls, specials] = await Promise.all([
        prisma.ball.findMany({
          where: { enabled: true, tradeable: true },
        }),
        prisma.special.findMany({
          where: { rarity: { gt: 0 } },
          orderBy: { rarity: "asc" },
        }),
      ]);

      this.balls = [];
      let cumulative = 0;

      for (const ball of balls) {
        cumulative += Math.max(ball.rarity, 0.01);
        this.balls.push({ ball, cumulative });
      }

      this.totalWeight = cumulative;
      this.specials = [];
      let specialCumulative = 0;

      for (const special of specials) {
        specialCumulative += special.rarity;
        this.specials.push({ special, cumulative: specialCumulative });
      }

      this.expiresAt = Date.now() + this.ttlMs;
    })();

    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private async ensureFresh(): Promise<void> {
    if (Date.now() >= this.expiresAt) await this.refresh();
  }

  async sampleBall(): Promise<Ball | null> {
    await this.ensureFresh();

    if (this.balls.length === 0 || this.totalWeight <= 0) return null;

    const roll = Math.random() * this.totalWeight;
    let low = 0;
    let high = this.balls.length - 1;

    while (low < high) {
      const mid = (low + high) >> 1;
      const entry = this.balls[mid];

      if (!entry) return null;

      if (entry.cumulative < roll) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return this.balls[low]?.ball ?? null;
  }

  async sampleBallWithin(floor: number, ceiling: number): Promise<Ball | null> {
    await this.ensureFresh();

    const band = this.balls.filter(
      (entry) => entry.ball.rarity >= floor && entry.ball.rarity < ceiling,
    );

    if (band.length === 0) return null;

    const total = band.reduce((sum, entry) => sum + entry.ball.rarity, 0);
    let roll = Math.random() * total;

    for (const entry of band) {
      roll -= entry.ball.rarity;

      if (roll < 0) return entry.ball;
    }

    return band[band.length - 1]?.ball ?? null;
  }

  async sampleSpecial(): Promise<Special | null> {
    await this.ensureFresh();

    const roll = Math.random() * 100;

    for (const entry of this.specials) {
      if (roll < entry.cumulative) return entry.special;
    }

    return null;
  }

  invalidate(): void {
    this.expiresAt = 0;
  }
}

export const spawnCatalog = new SpawnCatalog(
  config.spawning.catalogTtlSeconds * 1000,
);

interface PitchSnapshot {
  enabled: boolean;
  spawnChannel: bigint | null;
  expiresAt: number;
}

const pitchCache = new Map<string, PitchSnapshot>();

export async function pitchFor(guildId: string): Promise<PitchSnapshot> {
  const cached = pitchCache.get(guildId);

  if (cached && cached.expiresAt > Date.now()) return cached;

  const row = await prisma.guildConfig.findUnique({
    where: { guildId: BigInt(guildId) },
  });

  const snapshot: PitchSnapshot = {
    enabled: row?.enabled ?? true,
    spawnChannel: row?.spawnChannel ?? null,
    expiresAt: Date.now() + config.pitch.cacheTtlSeconds * 1000,
  };

  pitchCache.set(guildId, snapshot);
  return snapshot;
}

export function invalidatePitch(guildId: string): void {
  pitchCache.delete(guildId);
}

const guildBlacklistCache = new Set<string>();
let guildBlacklistLoaded = false;

export async function isGuildBlacklisted(guildId: string): Promise<boolean> {
  if (!guildBlacklistLoaded) {
    const rows = await prisma.blacklistedGuild.findMany({
      select: { discordId: true },
    });

    for (const row of rows) guildBlacklistCache.add(row.discordId.toString());
    guildBlacklistLoaded = true;
  }

  return guildBlacklistCache.has(guildId);
}

export function blacklistGuildCache(guildId: string): void {
  guildBlacklistCache.add(guildId);
}

export type PermissionLevel = "everyone" | "manageGuild" | "administrator";

export function permissionFor(commandPath: string): PermissionLevel {
  const { levels } = config.permissions;

  const exact = levels[commandPath as keyof typeof levels];

  if (typeof exact === "string") return exact as PermissionLevel;

  const root = commandPath.split(".")[0] as keyof typeof levels;
  const rootLevel = levels[root];

  if (typeof rootLevel === "string") return rootLevel as PermissionLevel;

  return "everyone";
}

export function hasPermission(
  level: PermissionLevel,
  userId: string,
  memberPermissions: { has: (permission: bigint) => boolean },
): boolean {
  if (config.permissions.adminUserIds.includes(userId)) return true;

  if (level === "everyone") return true;

  if (level === "manageGuild") {
    return memberPermissions.has(1n << 5n);
  }

  return memberPermissions.has(1n << 3n);
}

export function sweepVolatile(
  maps: Map<string, { expiresAt?: number }>[],
  maxAgeMs: number,
): void {
  const now = Date.now();

  for (const map of maps) {
    for (const [key, value] of map) {
      const expiresAt = value.expiresAt;

      if (expiresAt !== undefined && expiresAt < now) {
        map.delete(key);
      } else if (expiresAt === undefined && maxAgeMs > 0) {
        map.delete(key);
      }
    }
  }
}
