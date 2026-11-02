import { prisma } from "../db/prisma.js";
import { blacklistGuildCache, invalidatePitch, spawnCatalog, unblacklistGuildCache } from "../dugout/pool.js";

const db = prisma as unknown as Record<string, any>;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

type AdminAction = "create" | "update" | "delete" | "coins" | "blacklist" | "unblacklist";

function json(data: unknown, status = 200): Response {
  const body = JSON.stringify(data, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  return new Response(body ?? "null", {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function audit(adminId: string, action: AdminAction, resource: string, target: string, details?: unknown): void {
  // The project does not currently define a persistent audit-log model. Keep a structured
  // server-side audit trail in the application log without inventing a database table.
  console.info("[AdminAction]", JSON.stringify({
    at: new Date().toISOString(), adminId, action, resource, target, details,
  }));
}

function parseBigInt(value: unknown, label: string, optional = false): bigint | null {
  if ((value === null || value === undefined || value === "") && optional) return null;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new InputError(`${label} must be a numeric ID.`);
  }
  const text = String(value);
  if (!/^\d{1,19}$/.test(text)) throw new InputError(`${label} must contain between 1 and 19 digits.`);
  const parsed = BigInt(text);
  if (parsed > MAX_BIGINT) throw new InputError(`${label} is too large.`);
  return parsed;
}

function stringValue(value: unknown, label: string, options: { required?: boolean; max?: number; nullable?: boolean } = {}): string | null {
  if (value === null || value === undefined || value === "") {
    if (options.required) throw new InputError(`${label} is required.`);
    return options.nullable ? null : "";
  }
  if (typeof value !== "string") throw new InputError(`${label} must be text.`);
  const result = value.trim();
  if (!result && options.nullable) return null;
  if (options.required && !result) throw new InputError(`${label} is required.`);
  if (result.length > (options.max ?? 2000)) throw new InputError(`${label} is too long.`);
  return result;
}

function numberValue(value: unknown, label: string, options: { required?: boolean; min?: number; max?: number; integer?: boolean } = {}): number | undefined {
  if ((value === undefined || value === null || value === "") && !options.required) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new InputError(`${label} must be a valid number.`);
  if (options.integer && !Number.isInteger(parsed)) throw new InputError(`${label} must be a whole number.`);
  if (options.min !== undefined && parsed < options.min) throw new InputError(`${label} must be at least ${options.min}.`);
  if (options.max !== undefined && parsed > options.max) throw new InputError(`${label} must be at most ${options.max}.`);
  return parsed;
}

function booleanValue(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new InputError(`${label} must be true or false.`);
  return value;
}

function dateValue(value: unknown, label: string, nullable = true): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") {
    if (!nullable) throw new InputError(`${label} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new InputError(`${label} must be a date.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new InputError(`${label} is not a valid date.`);
  return parsed;
}

function jsonValue(value: unknown, label: string): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError(`${label} must be a JSON object.`);
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 16_000) throw new InputError(`${label} is too large.`);
  return JSON.parse(serialized);
}

class InputError extends Error {}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new InputError("Content-Type must be application/json.");
  }
  let value: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 64_000) throw new InputError("Request body is too large.");
    value = JSON.parse(raw);
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("Request body must contain valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function pageArgs(url: URL): { page: number; skip: number; take: number; search: string } {
  const page = Math.max(1, Math.min(100_000, Number(url.searchParams.get("page")) || 1));
  const take = 25;
  return { page, skip: (page - 1) * take, take, search: (url.searchParams.get("q") ?? "").trim().slice(0, 80) };
}

function searchBigInt(value: string): bigint | null {
  if (!/^\d{1,19}$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed <= MAX_BIGINT ? parsed : null;
}

function recordId(value: string, label = "Record ID"): bigint {
  const parsed = parseBigInt(value, label);
  if (parsed === null) throw new InputError(`${label} is required.`);
  return parsed;
}

function clubData(body: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const read = (key: string, parse: () => unknown) =>
    partial && !Object.hasOwn(body, key) ? undefined : parse();
  const put = (key: string, value: unknown) => {
    if (value !== undefined) result[key] = value;
  };

  put("country", read("country", () => stringValue(body.country, "Club name", { required: true, max: 48 })));
  put("health", read("health", () => numberValue(body.health, "Health", { required: true, integer: true, min: 0, max: 1_000_000 })));
  put("attack", read("attack", () => numberValue(body.attack, "Attack", { required: true, integer: true, min: 0, max: 1_000_000 })));
  put("rarity", read("rarity", () => numberValue(body.rarity, "Rarity", { required: true, min: 0, max: 1_000_000 })));
  put("emojiId", read("emojiId", () => parseBigInt(body.emojiId, "Emoji ID")));
  put("wildCard", read("wildCard", () => stringValue(body.wildCard, "Spawn image path", { required: true, max: 200 })));
  put("collectionCard", read("collectionCard", () => stringValue(body.collectionCard, "Collection image path", { required: true, max: 200 })));
  put("credits", read("credits", () => stringValue(body.credits, "Credits", { required: true, max: 64 })));
  put("capacityName", read("capacityName", () => stringValue(body.capacityName, "Ability name", { required: true, max: 64 })));
  put("capacityDescription", read("capacityDescription", () => stringValue(body.capacityDescription, "Ability description", { required: true, max: 256 })));
  put("capacityLogic", read("capacityLogic", () => jsonValue(body.capacityLogic, "Ability logic")));
  put("enabled", read("enabled", () => booleanValue(body.enabled, "Enabled")));
  put("shortName", read("shortName", () => stringValue(body.shortName, "Short name", { max: 24, nullable: true })));
  put("catchNames", read("catchNames", () => stringValue(body.catchNames, "Catch aliases", { max: 1000, nullable: true })));
  put("tradeable", read("tradeable", () => booleanValue(body.tradeable, "Tradeable")));
  put("createdAt", read("createdAt", () => dateValue(body.createdAt, "Created date")));
  put("translations", read("translations", () => stringValue(body.translations, "Translations", { max: 4000, nullable: true })));
  put("economyId", read("economyId", () => parseBigInt(body.economyId, "Economy ID", true)));
  // The SQL snapshot defines regime_id as NOT NULL even though schema.prisma marks it optional.
  // Require a value for create, and reject explicit null/blank updates.
  put("regimeId", read("regimeId", () => parseBigInt(body.regimeId, "Regime ID")));
  if (!partial && !Object.hasOwn(result, "capacityLogic")) result.capacityLogic = {};
  return result;
}

function specialData(body: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const read = (key: string, parse: () => unknown) =>
    partial && !Object.hasOwn(body, key) ? undefined : parse();
  const put = (key: string, value: unknown) => {
    if (value !== undefined) result[key] = value;
  };
  put("name", read("name", () => stringValue(body.name, "Special name", { required: true, max: 64 })));
  put("catchPhrase", read("catchPhrase", () => stringValue(body.catchPhrase, "Catch phrase", { max: 128, nullable: true })));
  put("startDate", read("startDate", () => dateValue(body.startDate, "Start date")));
  put("endDate", read("endDate", () => dateValue(body.endDate, "End date")));
  put("rarity", read("rarity", () => numberValue(body.rarity, "Rarity", { required: true, min: 0, max: 1_000_000 })));
  put("emoji", read("emoji", () => stringValue(body.emoji, "Emoji", { max: 20, nullable: true })));
  put("background", read("background", () => stringValue(body.background, "Background", { max: 200, nullable: true })));
  put("tradeable", read("tradeable", () => booleanValue(body.tradeable, "Tradeable")));
  put("hidden", read("hidden", () => booleanValue(body.hidden, "Hidden")));
  put("credits", read("credits", () => stringValue(body.credits, "Credits", { max: 64, nullable: true })));
  const start = body.startDate ? dateValue(body.startDate, "Start date") : undefined;
  const end = body.endDate ? dateValue(body.endDate, "End date") : undefined;
  if (start && end && end < start) throw new InputError("End date must be after the start date.");
  return result;
}

function guildData(body: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const read = (key: string, parse: () => unknown) =>
    partial && !Object.hasOwn(body, key) ? undefined : parse();
  const put = (key: string, value: unknown) => {
    if (value !== undefined) result[key] = value;
  };
  put("spawnChannel", read("spawnChannel", () => parseBigInt(body.spawnChannel, "Spawn channel ID", true)));
  put("enabled", read("enabled", () => body.enabled === undefined && !partial ? true : booleanValue(body.enabled, "Enabled")));
  put("silent", read("silent", () => body.silent === undefined && !partial ? false : booleanValue(body.silent, "Silent")));
  put("adminCommandSynced", read("adminCommandSynced", () => body.adminCommandSynced === undefined && !partial ? false : booleanValue(body.adminCommandSynced, "Admin commands synced")));
  put("manualDropEnabled", read("manualDropEnabled", () => body.manualDropEnabled === undefined && !partial ? true : booleanValue(body.manualDropEnabled, "Manual drops enabled")));
  put("tipsEnabled", read("tipsEnabled", () => body.tipsEnabled === undefined && !partial ? true : booleanValue(body.tipsEnabled, "Tips enabled")));
  return result;
}

function parseDiscordId(value: unknown, label = "Discord ID"): bigint {
  const parsed = parseBigInt(value, label);
  if (parsed === null || parsed === 0n) throw new InputError(`${label} is invalid.`);
  return parsed;
}

async function list(resource: string, url: URL): Promise<Response> {
  const { page, skip, take, search } = pageArgs(url);
  switch (resource) {
    case "clubs": {
      const where = search ? { country: { contains: search, mode: "insensitive" } } : {};
      const [total, rows] = await Promise.all([db.ball.count({ where }), db.ball.findMany({ where, orderBy: { country: "asc" }, skip, take, select: { id: true, country: true, shortName: true, rarity: true, health: true, attack: true, enabled: true, tradeable: true } })]);
      return json({ total, page, rows });
    }
    case "specials": {
      const where = search ? { name: { contains: search, mode: "insensitive" } } : {};
      const [total, rows] = await Promise.all([db.special.count({ where }), db.special.findMany({ where, orderBy: { name: "asc" }, skip, take, select: { id: true, name: true, rarity: true, startDate: true, endDate: true, tradeable: true, hidden: true } })]);
      return json({ total, page, rows });
    }
    case "players": {
      const playerId = searchBigInt(search);
      const where = search ? (playerId === null ? { id: -1n } : { discordId: playerId }) : {};
      const [total, players] = await Promise.all([db.player.count({ where }), db.player.findMany({ where, orderBy: { id: "desc" }, skip, take, select: { id: true, discordId: true, money: true } })]);
      const rows = await Promise.all(players.map(async (row: any) => ({
        id: row.id.toString(),
        discordId: row.discordId.toString(),
        money: row.money.toString(),
        clubInstances: await db.ballInstance.count({ where: { playerId: row.id, deleted: false } }),
      })));
      return json({ total, page, rows });
    }
    case "guilds": {
      const guildId = searchBigInt(search);
      const where = search ? (guildId === null ? { guildId: -1n } : { guildId }) : {};
      const [total, rows] = await Promise.all([db.guildConfig.count({ where }), db.guildConfig.findMany({ where, orderBy: { id: "desc" }, skip, take, select: { id: true, guildId: true, spawnChannel: true, enabled: true, silent: true, adminCommandSynced: true, manualDropEnabled: true, tipsEnabled: true } })]);
      return json({ total, page, rows });
    }
    case "trades": {
      const searchId = searchBigInt(search);
      const where = search ? (searchId === null ? { id: -1n } : { OR: [{ player1: { discordId: searchId } }, { player2: { discordId: searchId } }, { id: searchId }] }) : {};
      const [total, rows] = await Promise.all([db.trade.count({ where }), db.trade.findMany({ where, orderBy: { date: "desc" }, skip, take, select: { id: true, date: true, status: true, player1Money: true, player2Money: true, player1: { select: { discordId: true } }, player2: { select: { discordId: true } } } })]);
      return json({ total, page, rows: rows.map((row: any) => ({ id: row.id.toString(), date: row.date.toISOString(), status: row.status ?? "unknown", player1DiscordId: row.player1.discordId.toString(), player2DiscordId: row.player2.discordId.toString(), player1Money: row.player1Money.toString(), player2Money: row.player2Money.toString() })) });
    }
    case "blacklisted-users":
    case "blacklisted-guilds": {
      const delegate = resource === "blacklisted-users" ? db.blacklistedId : db.blacklistedGuild;
      const searchId = searchBigInt(search);
      const where = search ? (searchId === null ? { discordId: -1n } : { discordId: searchId }) : {};
      const [total, rows] = await Promise.all([delegate.count({ where }), delegate.findMany({ where, orderBy: { id: "desc" }, skip, take, select: { id: true, discordId: true, reason: true, date: true, moderatorId: true } })]);
      return json({ total, page, rows });
    }
    case "waves": {
      const where = search ? { waveKey: { contains: search, mode: "insensitive" } } : {};
      const [total, waves] = await Promise.all([db.spawnWave.count({ where }), db.spawnWave.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { _count: { select: { entries: true } }, entries: { where: { caught: true }, select: { id: true } } } })]);
      const rows = waves.map((wave: any) => ({ id: wave.id.toString(), guildId: wave.guildId.toString(), waveKey: wave.waveKey, rarityFloor: wave.rarityFloor, rarityCeiling: wave.rarityCeiling, size: wave.size, status: wave.status, createdAt: wave.createdAt.toISOString(), endedAt: wave.endedAt?.toISOString() ?? null, caught: wave.entries.length, entries: wave._count.entries }));
      return json({ total, page, rows });
    }
    default:
      return json({ error: "Unknown resource." }, 404);
  }
}

async function detail(resource: string, rawId: string): Promise<Response> {
  const id = recordId(rawId);
  switch (resource) {
    case "clubs": {
      const row = await db.ball.findUnique({ where: { id } });
      return row ? json({ row }) : json({ error: "Club not found." }, 404);
    }
    case "specials": {
      const row = await db.special.findUnique({ where: { id } });
      return row ? json({ row }) : json({ error: "Special not found." }, 404);
    }
    case "guilds": {
      const row = await db.guildConfig.findUnique({ where: { guildId: id } });
      return row ? json({ row }) : json({ error: "Guild configuration not found." }, 404);
    }
    case "players": {
      const row = await db.player.findUnique({ where: { discordId: id }, include: { _count: { select: { trades1: true, trades2: true } }, ballInstances: { where: { deleted: false }, orderBy: { catchDate: "desc" }, take: 20, include: { ball: { select: { id: true, country: true, rarity: true } }, special: { select: { name: true, emoji: true } } } } } });
      if (!row) return json({ error: "Player not found." }, 404);
      const totalClubInstances = await db.ballInstance.count({ where: { playerId: row.id, deleted: false } });
      return json({ row: { id: row.id.toString(), discordId: row.discordId.toString(), money: row.money.toString(), donationPolicy: row.donationPolicy, privacyPolicy: row.privacyPolicy, mentionPolicy: row.mentionPolicy, friendPolicy: row.friendPolicy, extraData: row.extraData, totalClubInstances, trades: row._count.trades1 + row._count.trades2, recentInstances: row.ballInstances.map((item: any) => ({ id: item.id.toString(), club: item.ball.country, rarity: item.ball.rarity, special: item.special?.name ?? null, emoji: item.special?.emoji ?? null, catchDate: item.catchDate.toISOString(), favorite: item.favorite, tradeable: item.tradeable })) } });
    }
    case "trades": {
      const row = await db.trade.findUnique({ where: { id }, include: { player1: { select: { discordId: true } }, player2: { select: { discordId: true } }, objects: { include: { player: { select: { discordId: true } }, ballInstance: { include: { ball: { select: { country: true, rarity: true } }, special: { select: { name: true, emoji: true } } } } } } } });
      if (!row) return json({ error: "Trade not found." }, 404);
      return json({ row: { id: row.id.toString(), date: row.date.toISOString(), status: row.status, expiresAt: row.expiresAt?.toISOString() ?? null, resolvedAt: row.resolvedAt?.toISOString() ?? null, player1DiscordId: row.player1.discordId.toString(), player2DiscordId: row.player2.discordId.toString(), player1Money: row.player1Money.toString(), player2Money: row.player2Money.toString(), objects: row.objects.map((entry: any) => ({ id: entry.id.toString(), ownerDiscordId: entry.player.discordId.toString(), instanceId: entry.ballInstanceId.toString(), club: entry.ballInstance.ball.country, rarity: entry.ballInstance.ball.rarity, special: entry.ballInstance.special?.name ?? null })) } });
    }
    case "waves": {
      const row = await db.spawnWave.findUnique({ where: { id }, include: { entries: true } });
      if (!row) return json({ error: "Wave not found." }, 404);
      return json({ row: { id: row.id.toString(), guildId: row.guildId.toString(), waveKey: row.waveKey, rarityFloor: row.rarityFloor, rarityCeiling: row.rarityCeiling, size: row.size, status: row.status, createdAt: row.createdAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null, entries: row.entries.map((entry: any) => ({ id: entry.id.toString(), ballId: entry.ballId.toString(), specialId: entry.specialId?.toString() ?? null, instanceId: entry.instanceId?.toString() ?? null, reward: entry.reward.toString(), caught: entry.caught, createdAt: entry.createdAt.toISOString() })) } });
    }
    default:
      return json({ error: "Detail view is not supported for this resource." }, 400);
  }
}

async function create(resource: string, body: Record<string, unknown>, adminId: string): Promise<Response> {
  switch (resource) {
    case "clubs": {
      const data = clubData(body, false);
      const row = await db.ball.create({ data });
      spawnCatalog.invalidate();
      audit(adminId, "create", resource, row.id.toString(), { country: row.country });
      return json({ row }, 201);
    }
    case "specials": {
      const data = specialData(body, false);
      const row = await db.special.create({ data });
      spawnCatalog.invalidate();
      audit(adminId, "create", resource, row.id.toString(), { name: row.name });
      return json({ row }, 201);
    }
    case "guilds": {
      const guildId = parseDiscordId(body.guildId, "Guild ID");
      const data = guildData(body, false);
      const row = await db.guildConfig.create({ data: { ...data, guildId } });
      invalidatePitch(guildId.toString());
      audit(adminId, "create", resource, guildId.toString());
      return json({ row }, 201);
    }
    default:
      return json({ error: "Creation is not supported for this resource." }, 405);
  }
}

async function update(resource: string, rawId: string, body: Record<string, unknown>, adminId: string): Promise<Response> {
  const id = recordId(rawId);
  let row: any;
  switch (resource) {
    case "clubs":
      row = await db.ball.update({ where: { id }, data: clubData(body, true) });
      spawnCatalog.invalidate();
      break;
    case "specials": {
      const existing = await db.special.findUnique({ where: { id }, select: { startDate: true, endDate: true } });
      if (!existing) throw Object.assign(new Error("Record not found."), { code: "P2025" });
      const data = specialData(body, true);
      const start = Object.hasOwn(data, "startDate") ? data.startDate : existing.startDate;
      const end = Object.hasOwn(data, "endDate") ? data.endDate : existing.endDate;
      if (start && end && end < start) throw new InputError("End date must be after the start date.");
      row = await db.special.update({ where: { id }, data });
      spawnCatalog.invalidate();
      break;
    }
    case "guilds":
      row = await db.guildConfig.update({ where: { guildId: id }, data: guildData(body, true) });
      invalidatePitch(id.toString());
      break;
    default: return json({ error: "Updating is not supported for this resource." }, 405);
  }
  audit(adminId, "update", resource, id.toString(), Object.keys(body));
  return json({ row });
}

async function remove(resource: string, rawId: string, adminId: string): Promise<Response> {
  const id = recordId(rawId);
  switch (resource) {
    case "clubs": await db.ball.delete({ where: { id } }); spawnCatalog.invalidate(); break;
    case "specials": await db.special.delete({ where: { id } }); spawnCatalog.invalidate(); break;
    case "blacklisted-users": await db.blacklistedId.delete({ where: { id } }); break;
    case "blacklisted-guilds": {
      const existing = await db.blacklistedGuild.findUnique({ where: { id }, select: { discordId: true } });
      await db.blacklistedGuild.delete({ where: { id } });
      if (existing) unblacklistGuildCache(existing.discordId.toString());
      break;
    }
    case "guilds":
      await db.guildConfig.delete({ where: { guildId: id } });
      invalidatePitch(id.toString());
      break;
    default: return json({ error: "Deletion is not supported for this resource." }, 405);
  }
  audit(adminId, "delete", resource, id.toString());
  return json({ ok: true });
}

async function blacklist(resource: string, body: Record<string, unknown>, adminId: string): Promise<Response> {
  if (resource !== "blacklisted-users" && resource !== "blacklisted-guilds") return json({ error: "Unknown blacklist." }, 404);
  const discordId = parseDiscordId(body.discordId);
  const reason = stringValue(body.reason, "Reason", { max: 500, nullable: true });
  const delegate = resource === "blacklisted-users" ? db.blacklistedId : db.blacklistedGuild;
  const existing = await delegate.findUnique({ where: { discordId } });
  if (existing) return json({ error: "That Discord ID is already blacklisted." }, 409);
  const row = await delegate.create({ data: { discordId, reason: reason || null, date: new Date(), moderatorId: BigInt(adminId) } });
  if (resource === "blacklisted-guilds") blacklistGuildCache(discordId.toString());
  audit(adminId, "blacklist", resource, discordId.toString(), { reason });
  return json({ row }, 201);
}

async function adjustCoins(rawDiscordId: string, body: Record<string, unknown>, adminId: string): Promise<Response> {
  const discordId = parseDiscordId(rawDiscordId, "Player Discord ID");
  const operation = body.operation;
  if (operation !== "add" && operation !== "subtract" && operation !== "set") throw new InputError("Operation must be add, subtract, or set.");
  const amountRaw = body.amount;
  if (typeof amountRaw !== "string" && typeof amountRaw !== "number") throw new InputError("Amount is required.");
  const amountText = String(amountRaw);
  if (!/^\d{1,19}$/.test(amountText)) throw new InputError("Amount must be a non-negative whole number.");
  const amount = BigInt(amountText);
  if (amount > MAX_BIGINT) throw new InputError("Amount is too large.");
  const player = await db.player.findUnique({ where: { discordId } });
  if (!player) return json({ error: "Player not found." }, 404);
  let next = amount;
  if (operation === "add") next = player.money + amount;
  if (operation === "subtract") next = player.money - amount;
  if (next < 0n || next > MAX_BIGINT) throw new InputError("The resulting balance would be outside the allowed range.");
  const updated = await db.player.update({ where: { id: player.id }, data: { money: next } });
  audit(adminId, "coins", "players", discordId.toString(), { operation, amount: amount.toString(), balance: updated.money.toString() });
  return json({ balance: updated.money.toString() });
}

export async function handleManagementApi(request: Request, adminId: string, expectedOrigin?: string): Promise<Response> {
  const url = new URL(request.url);
  const match = /^\/admin\/api\/manage\/([a-z-]+)(?:\/([^/]+)(?:\/([a-z-]+))?)?$/.exec(url.pathname);
  if (!match) return json({ error: "Not found." }, 404);
  const resource = match[1] ?? "";
  const rawId = match[2];
  const action = match[3];
  const method = request.method;

  try {
    if (method === "GET" && rawId && !action) return await detail(resource, rawId);
    if (method === "GET" && !rawId && !action) return await list(resource, url);

    if (!request.headers.get("origin") || request.headers.get("origin") !== (expectedOrigin ?? url.origin)) {
      return json({ error: "Cross-origin request rejected." }, 403);
    }

    if (method === "POST" && rawId && action === "coins" && resource === "players") {
      return await adjustCoins(rawId, await readBody(request), adminId);
    }
    if (method === "POST" && !rawId) {
      const body = await readBody(request);
      if (resource === "blacklisted-users" || resource === "blacklisted-guilds") return await blacklist(resource, body, adminId);
      return await create(resource, body, adminId);
    }
    if (method === "PATCH" && rawId && !action) return await update(resource, rawId, await readBody(request), adminId);
    if (method === "DELETE" && rawId && !action) return await remove(resource, rawId, adminId);
    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message }, 400);
    const code = (error as { code?: string })?.code;
    if (code === "P2002") return json({ error: "A record with that unique value already exists." }, 409);
    if (code === "P2003") return json({ error: "This record is still referenced by other database records. Remove or reassign those records first." }, 409);
    if (code === "P2025") return json({ error: "The record no longer exists. Refresh the table and try again." }, 404);
    console.error(`[Admin] ${method} ${url.pathname} failed:`, error);
    return json({ error: "The operation failed. Check the FCDex server log for details." }, 500);
  }
}
