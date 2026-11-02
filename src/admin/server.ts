import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { config } from "../config/config.js";
import { prisma } from "../db/prisma.js";
import { handleManagementApi } from "./management.js";

const ADMIN_STARTED_AT = Date.now();
const SESSION_COOKIE = "fcdex_admin_session";
const STATE_COOKIE = "fcdex_admin_oauth_state";
const SESSION_SECONDS = 8 * 60 * 60;
const STATE_SECONDS = 10 * 60;
const ASSET_DIRECTORY = resolve(import.meta.dir, "../../public/admin");
const ASSET_FILES = new Set(["index.html", "styles.css", "app.js"]);

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

interface SessionPayload {
  sub: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  exp: number;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface RecentTradeRow {
  id: bigint;
  date: Date;
  status: string | null;
  player1: { discordId: bigint };
  player2: { discordId: bigint };
}

interface PlayerListRow {
  id: bigint;
  discordId: bigint;
  money: bigint;
  _count: { ballInstances: number };
}

interface TradeListRow {
  id: bigint;
  date: Date;
  status: string | null;
  player1Money: bigint;
  player2Money: bigint;
  player1: { discordId: bigint };
  player2: { discordId: bigint };
}

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const outputHeaders = new Headers(headers);
  outputHeaders.set("Content-Type", "application/json; charset=utf-8");
  outputHeaders.set("Cache-Control", "no-store");
  outputHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data, bigintReplacer) ?? "null", {
    status,
    headers: outputHeaders,
  });
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function escapeCookieValue(value: string): string {
  return encodeURIComponent(value);
}

function cookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

function publicOrigin(request: Request): string {
  const configured = process.env.FCDEX_ADMIN_PUBLIC_ORIGIN;
  if (!configured) return new URL(request.url).origin;
  const parsed = new URL(configured);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("FCDEX_ADMIN_PUBLIC_ORIGIN must use HTTPS outside localhost.");
  }
  return parsed.origin;
}

function cookieOptions(request: Request, path = "/admin"): string {
  const secure =
    new URL(request.url).protocol === "https:" ||
    publicOrigin(request).startsWith("https://") ||
    process.env.NODE_ENV === "production";
  return `Path=${path}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

function expiredCookie(request: Request, name: string, path = "/admin"): string {
  const secure =
    new URL(request.url).protocol === "https:" ||
    publicOrigin(request).startsWith("https://") ||
    process.env.NODE_ENV === "production";
  return `${name}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

function sessionSecret(): string {
  const secret = process.env.FCDEX_ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "FCDEX_ADMIN_SESSION_SECRET must be set and contain at least 32 characters.",
    );
  }
  return secret;
}

function signSession(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySession(value: string | null): SessionPayload | null {
  if (!value) return null;

  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;

  const encoded = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);

  try {
    const expectedSignature = createHmac("sha256", sessionSecret())
      .update(encoded)
      .digest("base64url");
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);

    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;

    if (
      !payload ||
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function isAdmin(discordId: string): boolean {
  return (
    Array.isArray(config.permissions.adminUserIds) &&
    config.permissions.adminUserIds.includes(discordId)
  );
}

function getRedirectUri(): string {
  const uri = process.env.FCDEX_ADMIN_REDIRECT_URI;
  if (!uri) {
    throw new Error("FCDEX_ADMIN_REDIRECT_URI is not configured.");
  }

  const parsed = new URL(uri);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("The admin OAuth redirect URI must use HTTPS outside localhost.");
  }

  return parsed.toString();
}

function adminClientSecret(): string {
  const value = process.env.FCDEX_ADMIN_CLIENT_SECRET;
  if (!value) throw new Error("FCDEX_ADMIN_CLIENT_SECRET is not configured.");
  return value;
}

function redirectToAdmin(request: Request, query?: string): Response {
  const url = new URL("/admin/", publicOrigin(request));
  if (query) url.searchParams.set("error", query);
  return Response.redirect(url.toString(), 302);
}

function clearOAuthState(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", expiredCookie(request, STATE_COOKIE, "/admin/api/auth"));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function beginOAuth(request: Request): Promise<Response> {
  try {
    const clientId = config.discord.clientId;
    if (!clientId || clientId.startsWith("YOUR_")) {
      return redirectToAdmin(request, "oauth_not_configured");
    }

    // Fail early when deployment secrets/redirect URI have not been configured.
    adminClientSecret();
    sessionSecret();
    const redirectUri = getRedirectUri();

    const state = randomBytes(32).toString("base64url");
    const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", "identify");
    authorizeUrl.searchParams.set("state", state);

    const response = Response.redirect(authorizeUrl.toString(), 302);
    return withCookie(
      response,
      `${STATE_COOKIE}=${escapeCookieValue(state)}; ${cookieOptions(request, "/admin/api/auth")}; Max-Age=${STATE_SECONDS}`,
    );
  } catch (error) {
    console.error("[Admin] OAuth is not configured:", error);
    return redirectToAdmin(request, "oauth_not_configured");
  }
}

async function finishOAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const suppliedState = url.searchParams.get("state");
  const savedState = cookieValue(request, STATE_COOKIE);

  if (!code || !suppliedState || !savedState || suppliedState !== savedState) {
    return clearOAuthState(
      request,
      redirectToAdmin(request, "oauth_state_invalid"),
    );
  }

  try {
    const redirectUri = getRedirectUri();
    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: adminClientSecret(),
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      console.error("[Admin] Discord token exchange failed:", tokenResponse.status);
      return clearOAuthState(
        request,
        redirectToAdmin(request, "oauth_failed"),
      );
    }

    const tokens = (await tokenResponse.json()) as OAuthTokenResponse;
    const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `${tokens.token_type} ${tokens.access_token}` },
    });

    if (!userResponse.ok) {
      console.error("[Admin] Discord user lookup failed:", userResponse.status);
      return clearOAuthState(
        request,
        redirectToAdmin(request, "oauth_failed"),
      );
    }

    const user = (await userResponse.json()) as DiscordUser;
    if (!user.id || !isAdmin(user.id)) {
      return clearOAuthState(
        request,
        redirectToAdmin(request, "not_admin"),
      );
    }

    const payload: SessionPayload = {
      sub: user.id,
      username: user.username,
      globalName: user.global_name ?? null,
      avatar: user.avatar ?? null,
      exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    };

    const sessionCookie = `${SESSION_COOKIE}=${escapeCookieValue(signSession(payload))}; ${cookieOptions(request)}; Max-Age=${SESSION_SECONDS}`;
    return clearOAuthState(
      request,
      withCookie(redirectToAdmin(request), sessionCookie),
    );
  } catch (error) {
    console.error("[Admin] OAuth callback failed:", error);
    return clearOAuthState(
      request,
      redirectToAdmin(request, "oauth_failed"),
    );
  }
}

function currentSession(request: Request): SessionPayload | null {
  const session = verifySession(cookieValue(request, SESSION_COOKIE));
  if (!session || !isAdmin(session.sub)) return null;
  return session;
}

function systemInfo(): Response {
  return json({
    bot: {
      name: config.bot.name,
      description: config.bot.description,
      version: config.bot.version,
      modules: config.dugout,
      adminCount: Array.isArray(config.permissions.adminUserIds) ? config.permissions.adminUserIds.length : 0,
    },
    runtime: {
      uptimeSeconds: Math.max(0, Math.floor((Date.now() - ADMIN_STARTED_AT) / 1000)),
      nodeEnv: process.env.NODE_ENV ?? "development",
    },
    economy: { enabled: config.economy.enabled, currency: config.economy.currency },
    spawning: {
      enabled: config.spawning.enabled,
      minMessages: config.spawning.minMessages,
      catalogTtlSeconds: config.spawning.catalogTtlSeconds,
    },
    waves: { chancePercent: config.waves.chancePercent },
    rarityTiers: config.rarity.tiers.map((tier: { key: string; below: number }) => ({ key: tier.key, below: tier.below })),
  });
}

function profileResponse(request: Request): Response {
  const session = currentSession(request);
  if (!session) return json({ authenticated: false });

  const avatarUrl = session.avatar
    ? `https://cdn.discordapp.com/avatars/${session.sub}/${session.avatar}.${session.avatar.startsWith("a_") ? "gif" : "png"}?size=96`
    : null;

  return json({
    authenticated: true,
    user: {
      id: session.sub,
      username: session.username,
      displayName: session.globalName ?? session.username,
      avatarUrl,
    },
    expiresAt: session.exp,
  });
}

function requireSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === publicOrigin(request);
}

async function dashboardSummary(): Promise<Response> {
  const [clubs, players, clubInstances, specials, guilds, pendingTrades, blacklistedUsers, blacklistedGuilds, recentTrades] = await Promise.all([
    prisma.ball.count(),
    prisma.player.count(),
    prisma.ballInstance.count({ where: { deleted: false } }),
    prisma.special.count(),
    prisma.guildConfig.count(),
    prisma.trade.count({ where: { status: "pending" } }),
    prisma.blacklistedId.count(),
    prisma.blacklistedGuild.count(),
    prisma.trade.findMany({
      where: { status: "pending" },
      orderBy: { date: "desc" },
      take: 5,
      select: {
        id: true,
        date: true,
        player1: { select: { discordId: true } },
        player2: { select: { discordId: true } },
        status: true,
      },
    }),
  ]);

  return json({
    stats: {
      clubs,
      players,
      clubInstances,
      specials,
      guilds,
      pendingTrades,
      blacklistedUsers,
      blacklistedGuilds,
    },
    recentTrades: recentTrades.map((trade: RecentTradeRow) => ({
      id: trade.id.toString(),
      date: trade.date.toISOString(),
      player1DiscordId: trade.player1.discordId.toString(),
      player2DiscordId: trade.player2.discordId.toString(),
      status: trade.status,
    })),
  });
}

function pageArgs(url: URL): { skip: number; take: number; search: string } {
  const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page")) || 1));
  const take = 25;
  const search = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  return { skip: (page - 1) * take, take, search };
}

async function listResource(resource: string, url: URL): Promise<Response> {
  const { skip, take, search } = pageArgs(url);

  switch (resource) {
    case "clubs": {
      const where = search ? { country: { contains: search } } : {};
      const [total, rows] = await Promise.all([
        prisma.ball.count({ where }),
        prisma.ball.findMany({
          where,
          orderBy: { country: "asc" },
          skip,
          take,
          select: { id: true, country: true, rarity: true, health: true, attack: true, enabled: true, shortName: true },
        }),
      ]);
      return json({ total, page: skip / take + 1, rows });
    }
    case "specials": {
      const where = search ? { name: { contains: search } } : {};
      const [total, rows] = await Promise.all([
        prisma.special.count({ where }),
        prisma.special.findMany({
          where,
          orderBy: { name: "asc" },
          skip,
          take,
          select: { id: true, name: true, rarity: true, startDate: true, endDate: true, tradeable: true, hidden: true },
        }),
      ]);
      return json({ total, page: skip / take + 1, rows });
    }
    case "players": {
      const where = search ? { discordId: { equals: /^\d+$/.test(search) ? BigInt(search) : -1n } } : {};
      const [total, rows] = await Promise.all([
        prisma.player.count({ where }),
        prisma.player.findMany({
          where,
          orderBy: { id: "desc" },
          skip,
          take,
          select: { id: true, discordId: true, money: true, _count: { select: { ballInstances: true } } },
        }),
      ]);
      return json({ total, page: skip / take + 1, rows: rows.map((row: PlayerListRow) => ({
        id: row.id.toString(),
        discordId: row.discordId.toString(),
        money: row.money.toString(),
        clubInstances: row._count.ballInstances,
      })) });
    }
    case "guilds": {
      const where = search ? { guildId: { equals: /^\d+$/.test(search) ? BigInt(search) : -1n } } : {};
      const [total, rows] = await Promise.all([
        prisma.guildConfig.count({ where }),
        prisma.guildConfig.findMany({
          where,
          orderBy: { id: "desc" },
          skip,
          take,
          select: { id: true, guildId: true, spawnChannel: true, enabled: true, silent: true, manualDropEnabled: true, tipsEnabled: true },
        }),
      ]);
      return json({ total, page: skip / take + 1, rows });
    }
    case "trades": {
      const where = search
        ? { OR: [{ player1: { discordId: { equals: /^\d+$/.test(search) ? BigInt(search) : -1n } } }, { player2: { discordId: { equals: /^\d+$/.test(search) ? BigInt(search) : -1n } } }] }
        : {};
      const [total, rows] = await Promise.all([
        prisma.trade.count({ where }),
        prisma.trade.findMany({
          where,
          orderBy: { date: "desc" },
          skip,
          take,
          select: { id: true, date: true, status: true, player1Money: true, player2Money: true, player1: { select: { discordId: true } }, player2: { select: { discordId: true } } },
        }),
      ]);
      return json({ total, page: skip / take + 1, rows: rows.map((row: TradeListRow) => ({
        id: row.id.toString(),
        date: row.date.toISOString(),
        status: row.status ?? "unknown",
        player1DiscordId: row.player1.discordId.toString(),
        player2DiscordId: row.player2.discordId.toString(),
        player1Money: row.player1Money.toString(),
        player2Money: row.player2Money.toString(),
      })) });
    }
    case "blacklisted-users": {
      const where = search
        ? { discordId: { equals: /^\d+$/.test(search) ? BigInt(search) : -1n } }
        : {};
      const [total, rows] = await Promise.all([
        prisma.blacklistedId.count({ where }),
        prisma.blacklistedId.findMany({
          where,
          orderBy: { id: "desc" },
          skip,
          take,
          select: { id: true, discordId: true, reason: true, date: true, moderatorId: true },
        }),
      ]);
      return json({ total, page: skip / take + 1, rows });
    }
    case "blacklisted-guilds": {
      const where = search
        ? { discordId: { equals: /^\d+$/.test(search) ? BigInt(search) : -1n } }
        : {};
      const [total, rows] = await Promise.all([
        prisma.blacklistedGuild.count({ where }),
        prisma.blacklistedGuild.findMany({
          where,
          orderBy: { id: "desc" },
          skip,
          take,
          select: { id: true, discordId: true, reason: true, date: true, moderatorId: true },
        }),
      ]);
      return json({ total, page: skip / take + 1, rows });
    }
    case "waves": {
      const where = search ? { waveKey: { contains: search } } : {};
      const [total, waves] = await Promise.all([
        prisma.spawnWave.count({ where }),
        prisma.spawnWave.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take,
          include: { _count: { select: { entries: true } }, entries: { where: { caught: true }, select: { id: true } } },
        }),
      ]);
      const rows = waves.map((wave: any) => ({
        id: wave.id.toString(), guildId: wave.guildId.toString(), waveKey: wave.waveKey,
        rarityFloor: wave.rarityFloor, rarityCeiling: wave.rarityCeiling, size: wave.size,
        status: wave.status, createdAt: wave.createdAt.toISOString(),
        endedAt: wave.endedAt?.toISOString() ?? null, caught: wave.entries.length,
        entries: wave._count.entries,
      }));
      return json({ total, page: skip / take + 1, rows });
    }
    default:
      return json({ error: "Unknown resource." }, 404);
  }
}

async function handleApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/admin/api/auth/discord" && request.method === "GET") {
    return beginOAuth(request);
  }
  if (path === "/admin/api/auth/callback" && request.method === "GET") {
    return finishOAuth(request);
  }
  if (path === "/admin/api/auth/me" && request.method === "GET") {
    return profileResponse(request);
  }
  if (path === "/admin/api/auth/logout" && request.method === "POST") {
    if (!requireSameOrigin(request)) return json({ error: "Forbidden." }, 403);
    const response = json({ ok: true });
    return withCookie(response, expiredCookie(request, SESSION_COOKIE));
  }

  const session = currentSession(request);
  if (!session) return json({ error: "Unauthorized." }, 401);

  if (path === "/admin/api/dashboard/summary" && request.method === "GET") {
    return dashboardSummary();
  }
  if (path === "/admin/api/system/info" && request.method === "GET") {
    return systemInfo();
  }

  if (path.startsWith("/admin/api/manage/")) {
    return handleManagementApi(request, session.sub, publicOrigin(request));
  }

  const resourceMatch = /^\/admin\/api\/data\/([a-z-]+)$/.exec(path);
  if (resourceMatch && request.method === "GET") {
    return listResource(resourceMatch[1] ?? "", url);
  }

  return json({ error: "Not found." }, 404);
}

function assetResponse(pathname: string): Response {
  const requestedName = pathname === "/admin" || pathname === "/admin/"
    ? "index.html"
    : pathname.slice("/admin/".length);

  if (!ASSET_FILES.has(requestedName)) {
    return new Response("Not found", { status: 404 });
  }

  const file = Bun.file(resolve(ASSET_DIRECTORY, requestedName));
  const contentTypes: Record<string, string> = {
    "index.html": "text/html; charset=utf-8",
    "styles.css": "text/css; charset=utf-8",
    "app.js": "text/javascript; charset=utf-8",
  };

  return new Response(file, {
    headers: {
      "Content-Type": contentTypes[requestedName] ?? "application/octet-stream",
      "Cache-Control": requestedName === "index.html" ? "no-store" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' https://cdn.discordapp.com data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://discord.com",
    },
  });
}

export function startAdminServer() {
  const port = Number(process.env.FCDEX_ADMIN_PORT ?? 3030);
  const hostname = process.env.FCDEX_ADMIN_HOST ?? "127.0.0.1";

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("FCDEX_ADMIN_PORT must be a valid TCP port.");
  }

  return Bun.serve({
    hostname,
    port,
    async fetch(request) {
      try {
        const url = new URL(request.url);
        if (url.pathname.startsWith("/admin/api/")) {
          return await handleApi(request);
        }
        if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
          return assetResponse(url.pathname);
        }
        return new Response("Not found", { status: 404 });
      } catch (error) {
        console.error("[Admin] Request failed:", error);
        return json({ error: "Internal server error." }, 500);
      }
    },
  });
}
