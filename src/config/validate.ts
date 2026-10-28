import { config } from "./config.js";

interface Issue {
  path: string;
  message: string;
}

class Checker {
  issues: Issue[] = [];

  constructor(private root: unknown) {}

  section(path: string): Record<string, unknown> {
    const value = this.at(path);

    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      this.fail(path, "must be an object.");
      return {};
    }

    return value as Record<string, unknown>;
  }

  at(path: string): unknown {
    let value: unknown = this.root;

    const segments = path.split(".");

    for (const segment of segments) {
      const bracketMatch = /^(\w+)\[(\d+)\]$/.exec(segment);

      const keys = bracketMatch
        ? [bracketMatch[1] ?? "", bracketMatch[2] ?? ""]
        : [segment];

      for (const key of keys) {
        if (value === null || typeof value !== "object") return undefined;
        value = (value as Record<string, unknown>)[key];
      }
    }

    return value;
  }

  fail(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  string(path: string, { trim = false, min = 1 } = {}): void {
    const value = this.at(path);

    if (typeof value !== "string") {
      this.fail(path, "must be a string.");
      return;
    }

    if (trim && value.trim().length < min) {
      this.fail(path, `must not be empty.`);
    }

    if (!trim && value.length < min) {
      this.fail(path, `must be at least ${min} character(s).`);
    }
  }

  number(
    path: string,
    {
      min,
      max,
      integer = false,
    }: { min?: number; max?: number; integer?: boolean } = {},
  ): void {
    const value = this.at(path);

    if (typeof value !== "number" || Number.isNaN(value)) {
      this.fail(path, "must be a number.");
      return;
    }

    if (integer && !Number.isInteger(value)) {
      this.fail(path, "must be an integer.");
    }

    if (min !== undefined && value < min) {
      this.fail(path, `must be >= ${min}.`);
    }

    if (max !== undefined && value > max) {
      this.fail(path, `must be <= ${max}.`);
    }
  }

  boolean(path: string): void {
    if (typeof this.at(path) !== "boolean") {
      this.fail(path, "must be a boolean.");
    }
  }

  stringArray(path: string, minItems = 1): void {
    const value = this.at(path);

    if (!Array.isArray(value) || value.length < minItems) {
      this.fail(path, `must be an array with at least ${minItems} item(s).`);
      return;
    }

    value.forEach((entry, index) => {
      if (typeof entry !== "string" || entry.length === 0) {
        this.fail(`${path}[${index}]`, "must be a non-empty string.");
      }
    });
  }

  objectArray(
    path: string,
    fields: {
      key: string;
      kind: "string" | "number";
      min?: number;
      max?: number;
    }[],
    minItems = 1,
  ): void {
    const value = this.at(path);

    if (!Array.isArray(value) || value.length < minItems) {
      this.fail(path, `must be an array with at least ${minItems} item(s).`);
      return;
    }

    value.forEach((entry, index) => {
      if (entry === null || typeof entry !== "object") {
        this.fail(`${path}[${index}]`, "must be an object.");
        return;
      }

      for (const field of fields) {
        const fieldValue = (entry as Record<string, unknown>)[field.key];

        if (field.kind === "string") {
          if (
            typeof fieldValue !== "string" ||
            fieldValue.trim().length === 0
          ) {
            this.fail(
              `${path}[${index}].${field.key}`,
              "must be a non-empty string.",
            );
          }
        } else if (typeof fieldValue !== "number") {
          this.fail(`${path}[${index}].${field.key}`, "must be a number.");
        } else {
          if (field.min !== undefined && fieldValue < field.min) {
            this.fail(
              `${path}[${index}].${field.key}`,
              `must be >= ${field.min}.`,
            );
          }

          if (field.max !== undefined && fieldValue > field.max) {
            this.fail(
              `${path}[${index}].${field.key}`,
              `must be <= ${field.max}.`,
            );
          }
        }
      }
    });
  }

  url(path: string): void {
    const value = this.at(path);

    if (typeof value !== "string" || !/^https:\/\//.test(value)) {
      this.fail(path, "must be an https URL.");
    }
  }
}

export function validateConfig(): void {
  const check = new Checker(config);

  check.string("discord.token", { trim: true });
  check.string("discord.clientId", { trim: true });

  for (const key of [
    "name",
    "description",
    "version",
    "locale",
    "commandError",
    "banned",
  ]) {
    check.string(`bot.${key}`, {
      trim: key !== "commandError" && key !== "banned",
    });
  }

  check.stringArray("dugout");

  check.string("commands.rarity", { trim: true });
  check.string("commands.squad", { trim: true });
  check.string("commands.squadProgress", { trim: true });
  check.string("commands.squadLast", { trim: true });
  check.string("commands.squadInspect", { trim: true });
  check.string("commands.squadInspectItem", { trim: true });
  check.string("commands.economy", { trim: true });
  check.string("commands.economyDaily", { trim: true });
  check.string("commands.economyWallet", { trim: true });
  check.string("commands.transfers", { trim: true });
  check.string("commands.transfersOffer", { trim: true });
  check.string("commands.transfersOfferCollector", { trim: true });
  check.string("commands.transfersOfferClub", { trim: true });
  check.string("commands.transfersOfferCoins", { trim: true });
  check.string("commands.transfersInbox", { trim: true });
  check.string("commands.transfersHistory", { trim: true });
  check.string("commands.matchday", { trim: true });
  check.string("commands.matchdayPlay", { trim: true });
  check.string("commands.matchdayDuel", { trim: true });
  check.string("commands.matchdayDuelOpponent", { trim: true });
  check.string("commands.matchdayDuelClub", { trim: true });
  check.string("commands.pitch", { trim: true });
  check.string("commands.pitchStatus", { trim: true });
  check.string("commands.pitchForce", { trim: true });
  check.string("commands.pitchBan", { trim: true });
  check.string("commands.pitchBanCollector", { trim: true });
  check.string("commands.fcdex", { trim: true });

  check.string("collectible.singular", { trim: true });
  check.string("collectible.plural", { trim: true });

  check.number("appearance.accentColor", {
    min: 0,
    max: 0xffffff,
    integer: true,
  });

  for (const key of [
    "successEmoji",
    "errorEmoji",
    "warningEmoji",
    "infoEmoji",
  ]) {
    check.string(`appearance.${key}`);
  }

  check.string("appearance.footerText", { trim: true });
  check.number("appearance.accents.transfer", {
    min: 0,
    max: 0xffffff,
    integer: true,
  });
  check.number("appearance.accents.success", {
    min: 0,
    max: 0xffffff,
    integer: true,
  });
  check.number("appearance.accents.neutral", {
    min: 0,
    max: 0xffffff,
    integer: true,
  });

  for (const key of [
    "ball",
    "sparkle",
    "coin",
    "crest",
    "stadium",
    "calendar",
    "inbox",
    "deal",
    "cross",
    "heart",
    "lock",
    "gear",
    "pin",
    "clipboard",
    "trophy",
    "whistle",
    "shirt",
    "chart",
    "history",
    "book",
  ]) {
    check.string(`appearance.icons.${key}`);
  }

  check.url("media.spawnBaseUrl");
  check.url("media.collectionBaseUrl");

  check.boolean("spawning.enabled");
  check.number("spawning.catalogTtlSeconds", { min: 1, integer: true });
  check.number("spawning.minMessages", { min: 0, integer: true });
  check.number("spawning.chanceRangeMinutes[0]", { min: 1, integer: true });
  check.number("spawning.chanceRangeMinutes[1]", { min: 1, integer: true });

  const minRange = check.at("spawning.chanceRangeMinutes[0]");
  const maxRange = check.at("spawning.chanceRangeMinutes[1]");

  if (
    typeof minRange === "number" &&
    typeof maxRange === "number" &&
    minRange >= maxRange
  ) {
    check.fail("spawning.chanceRangeMinutes", "start must be lower than end.");
  }

  check.objectArray("rarity.tiers", [
    { key: "key", kind: "string" },
    { key: "below", kind: "number", min: 0, max: 2 },
    { key: "color", kind: "number", min: 0, max: 0xffffff },
  ]);

  const tiers = check.at("rarity.tiers");

  if (Array.isArray(tiers) && tiers.length > 0) {
    let previous = -Infinity;

    tiers.forEach((tier, index) => {
      const below = (tier as { below?: unknown }).below;

      if (typeof below === "number") {
        if (below <= previous) {
          check.fail(
            `rarity.tiers[${index}].below`,
            "must be strictly increasing.",
          );
        }

        previous = below;
      }
    });

    if (
      (tiers[tiers.length - 1] as { below?: number } | undefined)?.below !==
      1.01
    ) {
      check.fail(
        "rarity.tiers",
        "last tier `below` must be 1.01 to cover the full range.",
      );
    }
  }

  check.number("catch.timeoutSeconds", { min: 1, integer: true });
  check.number("catch.cooldownSeconds", { min: 0, integer: true });
  check.number("catch.minNameLength", { min: 1, integer: true });
  check.number("catch.maxNameLength", { min: 1, integer: true });

  for (const key of ["catch", "inspect", "help"]) {
    check.string(`catch.labels.${key}`, { trim: true });
  }

  for (const key of ["title", "nameLabel", "namePlaceholder"]) {
    check.string(`catch.modal.${key}`, { trim: true });
  }

  check.stringArray("catch.messages.appeared");
  check.string("catch.messages.spawnHint");
  check.string("catch.messages.spawnSubtitle");
  check.string("catch.messages.revealedTitle");
  check.string("catch.messages.revealedSubtitle");
  check.string("catch.messages.kitLine");
  check.string("catch.messages.cooldown");
  check.stringArray("catch.messages.wrong");
  check.stringArray("catch.messages.slow");
  check.stringArray("catch.messages.caught");
  check.string("catch.help.rules");
  check.string("catch.help.rarityTitle", { trim: true });
  check.string("catch.help.raritySubtitle", { trim: true });
  check.string("catch.help.rarityLine");

  check.boolean("economy.enabled");
  check.string("economy.currency", { trim: true });
  check.number("economy.daily.amount", { min: 1, integer: true });
  check.string("economy.daily.emoji");

  const tiersCheck = check.at("rarity.tiers");

  if (Array.isArray(tiersCheck)) {
    for (const tier of tiersCheck as { key?: unknown }[]) {
      if (typeof tier.key === "string") {
        check.number(`economy.catchRewards.${tier.key}`, {
          min: 0,
          integer: true,
        });
      }
    }
  }

  check.string("economy.panels.walletTitle");
  check.string("economy.panels.walletSubtitle");
  check.string("economy.panels.walletTop");
  check.string("economy.panels.walletLine");
  check.string("economy.panels.walletEmpty");
  check.number("economy.panels.size", { min: 1, integer: true });

  for (const key of ["favorite", "unfavorite", "lock", "unlock"]) {
    check.string(`squad.labels.${key}`, { trim: true });
  }

  for (const key of [
    "empty",
    "notFound",
    "notYours",
    "favorited",
    "unfavorited",
    "locked",
    "unlocked",
    "wagesCooled",
    "lastEmpty",
  ]) {
    check.string(`squad.messages.${key}`);
  }

  for (const key of [
    "clubroomTitle",
    "clubroomSubtitle",
    "itemLine",
    "baseKit",
    "abilityLine",
    "dexTitle",
    "dexSubtitle",
    "kitLine",
    "favorite",
    "tradeable",
    "yes",
    "no",
    "progressTitle",
    "completionTitle",
    "completionSubtitle",
    "clubsLine",
    "kitsLine",
    "rarityLine",
    "lastTitle",
    "lastSubtitle",
    "wagesTitle",
    "wagesSubtitle",
    "newBalance",
    "ledgerTitle",
    "ledgerSubtitle",
  ]) {
    check.string(`squad.panels.${key}`);
  }

  check.objectArray("squad.ranks", [
    { key: "min", kind: "number", min: 0, max: 100 },
    { key: "title", kind: "string" },
  ]);

  check.boolean("transfers.enabled");
  check.number("transfers.feePercent", { min: 0, max: 100, integer: true });
  check.number("transfers.maxPerDay", { min: 1, integer: true });
  check.number("transfers.negotiationTimeoutSeconds", {
    min: 1,
    integer: true,
  });

  for (const key of ["accept", "decline"]) {
    check.string(`transfers.labels.${key}`, { trim: true });
  }

  for (const key of [
    "invalidTarget",
    "insufficientCoins",
    "notInClubroom",
    "clubLocked",
    "offerRejected",
    "reasonEscrow",
    "reasonDaily",
    "closed",
    "notParticipant",
    "expired",
    "onlyReceiver",
    "bundleGone",
    "inboxEmpty",
    "historyEmpty",
  ]) {
    check.string(`transfers.messages.${key}`);
  }

  for (const key of [
    "offerTitle",
    "offerSubtitle",
    "sends",
    "receives",
    "attachments",
    "fee",
    "none",
    "sealedTitle",
    "declinedTitle",
    "resolvedSubtitle",
    "inboxTitle",
    "inboxSubtitle",
    "inboxLine",
    "historyTitle",
    "historySubtitle",
    "historyLine",
    "statusCompleted",
    "statusDeclined",
    "statusExpired",
  ]) {
    check.string(`transfers.panels.${key}`);
  }

  check.boolean("matchday.enabled");
  check.number("matchday.winReward", { min: 0, integer: true });
  check.number("matchday.drawReward", { min: 0, integer: true });
  check.number("matchday.lossReward", { min: 0, integer: true });
  check.number("matchday.duelStake", { min: 0, integer: true });

  for (const key of [
    "noClub",
    "noOpponents",
    "duelSelf",
    "duelBot",
    "duelPending",
    "duelGone",
    "duelNotYours",
    "duelStakeGone",
    "rulesAccepted",
  ]) {
    check.string(`matchday.messages.${key}`);
  }

  for (const key of [
    "resultTitle",
    "resultSubtitle",
    "squadsLine",
    "balanceLine",
    "rulesTitle",
    "rulesSubtitle",
    "rewardsLine",
    "duelTitle",
    "duelSubtitle",
    "duelStakeLine",
    "duelWonTitle",
    "duelWonSubtitle",
    "duelScoreLine",
  ]) {
    check.string(`matchday.panels.${key}`);
  }

  for (const key of [
    "win",
    "draw",
    "loss",
    "winOutcome",
    "drawOutcome",
    "lossOutcome",
    "rulesAccept",
    "duelAccept",
    "duelDecline",
  ]) {
    check.string(`matchday.panels.labels.${key}`);
  }

  check.number("pitch.cacheTtlSeconds", { min: 1, integer: true });

  for (const key of ["enable", "disable", "pin"]) {
    check.string(`pitch.labels.${key}`, { trim: true });
  }

  for (const key of [
    "guildOnly",
    "needsManage",
    "spawnsOn",
    "spawnsOff",
    "anyChannel",
    "spawnForced",
    "spawnNoChannel",
    "banned",
    "unbanned",
  ]) {
    check.string(`pitch.messages.${key}`);
  }

  for (const key of ["title", "subtitle", "channelLine"]) {
    check.string(`pitch.panels.${key}`);
  }

  for (const key of [
    "aboutTitle",
    "clubLine",
    "collectorLine",
    "signatureLine",
    "tradeLine",
    "guildLine",
    "dugoutLine",
  ]) {
    check.string(`info.panels.${key}`);
  }

  if (check.issues.length > 0) {
    console.error("\n[Config] ✗ Configuration validation failed:");

    for (const issue of check.issues) {
      console.error(`  • ${issue.path}: ${issue.message}`);
    }

    throw new Error("Invalid FCDex configuration.");
  }

  const dugout = check.at("dugout");

  if (Array.isArray(dugout)) {
    const names = dugout.filter(
      (name): name is string => typeof name === "string",
    );
    const duplicates = names.filter(
      (name, index) => names.indexOf(name) !== index,
    );

    if (duplicates.length > 0) {
      throw new Error(
        `[Config] Duplicate package entries: ${[...new Set(duplicates)].join(", ")}`,
      );
    }
  }

  console.log("[Config] ✓ Configuration validated successfully.");
}
