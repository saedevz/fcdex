import { join } from "node:path";

const configDirectory = join(import.meta.dir);
const configPath = join(configDirectory, "config.ts");

if (await Bun.file(configPath).exists()) {
  console.log("⚠️ src/config/config.ts already exists — left untouched.");
  process.exit();
}

const configTemplate = String.raw`export const config = {
  discord: {
    token: "YOUR_BOT_TOKEN",
    clientId: "YOUR_APPLICATION_ID",
  },

  bot: {
    name: "FCDex",
    description: "Catch, collect and exchange football clubs on Discord!",
    version: "1.0.0",
    locale: "en-US",
    commandError: "{emoji} An error occurred while executing this command.",
    banned: "{emoji} You are banned from the pitch.",
    noPermission: "{emoji} You lack the permissions required for this command.",
  },

  dugout: ["clubs", "squad", "transfers", "matchday", "pitch", "guard", "info"],

  commands: {
    rarity: "Show the FCDex rarity chart.",
    squad: "Clubroom commands.",
    squadProgress: "Your collection progress, rarity spread and clubs.",
    squadLast: "Show your latest signed club.",
    squadInspect: "Open the dex card for one of your clubs.",
    squadInspectItem: "Club instance id from /squad progress",
    economy: "Coin commands.",
    economyDaily: "Claim your daily wages.",
    economyWallet: "Your balance and the top collectors.",
    transfers: "Transfer market commands.",
    transfersOffer: "Offer a club from your clubroom to another collector.",
    transfersOfferCollector: "Who receives the offer",
    transfersOfferClub: "Your club instance id (/squad progress)",
    transfersOfferCoins: "Coins bundled with the offer",
    transfersInbox: "Incoming transfer offers.",
    transfersHistory: "Resolved transfer history.",
    matchday: "Matchday commands.",
    matchdayPlay: "Play a friendly against a random club.",
    matchdayDuel: "Challenge another collector to a club duel.",
    matchdayDuelOpponent: "Who faces your club",
    matchdayDuelClub: "Your club instance id (/squad progress)",
    pitch: "Pitch commands.",
    pitchStatus: "Show the spawn controls for this pitch.",
    pitchForce: "Release a club on the pitch immediately.",
    pitchBan: "Ban or unban a collector from the pitch.",
    pitchBanCollector: "Who to ban or unban",
    pitchWave: "Spawn wave ledger management.",
    pitchWaveAction: "Wave action to run",
    pitchWaveKey: "Wave key for annul or revert",
    fcdex: "About {name} and live statistics.",
  },

  permissions: {
    adminUserIds: [] as string[],
    levels: {
      rarity: "everyone",
      squad: "everyone",
      economy: "everyone",
      transfers: "everyone",
      matchday: "everyone",
      fcdex: "everyone",
      pitch: "manageGuild",
      "pitch.status": "manageGuild",
      "pitch.force": "administrator",
      "pitch.ban": "administrator",
      "pitch.wave": "administrator",
    },
  },

  waves: {
    chancePercent: 8,
    staggerMs: 1500,
    timeoutSeconds: 90,
    bands: [
      {
        below: 0.3,
        chancePercent: 4,
        size: [2, 4],
        dailyMax: 1,
        label: "elite",
      },
      {
        below: 0.6,
        chancePercent: 6,
        size: [3, 6],
        dailyMax: 2,
        label: "contender",
      },
      {
        below: 1.01,
        chancePercent: 8,
        size: [4, 8],
        dailyMax: 3,
        label: "feeder",
      },
    ],
    messages: {
      startedTitle: "Spawn wave detected",
      startedSubtitle: "{label} wave • {count} clubs inbound",
      bandLine: "-# Rarity band: {floor} – {ceiling}",
      annulled: "{emoji} Wave {wave} annulled.",
      reverted: "{emoji} Wave {wave} reverted — {instances} signatures withdrawn, {rewards} coins returned.",
      notFound: "{emoji} No wave found with key {wave}.",
      listTitle: "Spawn wave ledger",
      listLine: "-# {key} • {label} • {status} • {caught}/{size} caught",
      listEmpty: "{emoji} No spawn waves recorded on this pitch.",
      dailyCap: "{emoji} Daily {label} wave budget reached — wave skipped.",
    },
    labels: {
      list: "List waves",
      annul: "Annul",
      revert: "Revert",
    },
  },

  guard: {
    minMembers: 20,
    botFloodCount: 10,
    minRealMembers: 5,
    scanDelayMs: 2500,
    messages: {
      leaveReason:
        "FCDex anti-farming: this pitch does not meet the minimum community requirements.",
      left: "{emoji} Left guild {guild} ({id}) — anti-farm: {reason}",
      blacklisted: "{emoji} Guild {guild} ({id}) blacklisted.",
    },
  },

  collectible: {
    singular: "club",
    plural: "clubs",
  },

  appearance: {
    accentColor: 0x1a7f37,
    successEmoji: "✅",
    errorEmoji: "❌",
    warningEmoji: "⚠️",
    infoEmoji: "ℹ️",
    footerText: "FCDex • Football Club Dex",
    accents: {
      transfer: 0x0ea5e9,
      success: 0x16a34a,
      neutral: 0x9ca3af,
    },
    icons: {
      ball: "⚽",
      sparkle: "✨",
      coin: "🪙",
      crest: "🪪",
      stadium: "🏟️",
      calendar: "📅",
      inbox: "📥",
      deal: "🤝",
      cross: "✖️",
      heart: "❤️",
      lock: "🔒",
      gear: "⚙️",
      pin: "📌",
      clipboard: "📋",
      trophy: "🏆",
      whistle: "🧑‍⚖️",
      shirt: "👕",
      chart: "📈",
      history: "🕘",
      book: "📖",
    },
  },

  spawning: {
    enabled: true,
    minMessages: 15,
    chanceRangeMinutes: [30, 50],
    catalogTtlSeconds: 300,
  },

  rarity: {
    tiers: [
      { key: "icon", below: 0.13, color: 0xf59e0b },
      { key: "legendary", below: 0.2, color: 0xa855f7 },
      { key: "rare", below: 0.3, color: 0x3b82f6 },
      { key: "uncommon", below: 0.5, color: 0x22c55e },
      { key: "common", below: 1.01, color: 0x9ca3af },
    ],
  },

  media: {
    spawnBaseUrl: "https://cdn.fcdex.app/spawn",
    collectionBaseUrl: "https://cdn.fcdex.app/collection",
  },

  catch: {
    timeoutSeconds: 90,
    cooldownSeconds: 5,
    minNameLength: 2,
    maxNameLength: 48,
    labels: {
      catch: "Catch",
      inspect: "Rarity",
      help: "Pitch rules",
    },
    modal: {
      title: "Guess the club",
      nameLabel: "Which club is this?",
      namePlaceholder: "Type the club name...",
    },
    messages: {
      appeared: [
        "A wild {collectible} appeared! Before it leaves: name it to sign it.",
        "{collectible.capitalize} spotted on the pitch! First correct name wins the signature.",
      ],
      spawnHint: "First correct name wins the signature.",
      spawnSubtitle: "first {label} signs it • {tier} tier",
      revealedTitle: "{club}",
      revealedSubtitle: "{rarity} • signed for {reward}",
      kitLine: "-# {emoji} {kit} variant",
      cooldown: "{emoji} Steady... wait {seconds}s between attempts.",
      wrong: [
        "{emoji} Off the post! {user}, wrong name.",
        "{emoji} Saved by the keeper! Not quite, {user}.",
        "{emoji} Flag raised — offside guess, {user}.",
      ],
      slow: [
        "{emoji} Full time! {user}, the {collectible} slipped away.",
        "{emoji} Another collector grabbed it first, {user}.",
      ],
      caught: [
        "{emoji} GOAL! {user} signed {club}!",
        "{emoji} Transfer window magic: {user} landed {club}!",
        "{emoji} What a steal! {user} captured {club}!",
      ],
    },
    help: {
      rules:
        "## ⚽ Pitch rules\\nSpawns appear as chats warm up. Press **Catch**, guess the club shown and the first correct name signs it.\\nWins pay {currency}, rarity raises the payout.\\nDaily wages and the transfer market live in \`/economy\` and \`/transfers\`.",
      rarityTitle: "Rarity chart",
      raritySubtitle: "Weighted spawn tiers",
      rarityLine: "-# **{tier}** — weight {weight}, reward {reward}",
    },
  },

  economy: {
    enabled: true,
    currency: "coins",
    daily: { amount: 250, emoji: "🪙" },
    catchRewards: {
      common: 10,
      uncommon: 25,
      rare: 50,
      legendary: 100,
      icon: 250,
    },
    panels: {
      walletTitle: "{user}'s wallet",
      walletSubtitle: "{balance} available",
      walletTop: "top {count}",
      walletLine: "-# {position}. {player} — {balance}",
      walletEmpty: "{emoji} Nobody has coins yet.",
      size: 5,
    },
  },

  squad: {
    labels: {
      favorite: "Favorite",
      unfavorite: "Unfavorite",
      lock: "Lock",
      unlock: "Unlock",
    },
    messages: {
      empty:
        "{emoji} Your clubroom is empty. Catch {collectible} as they spawn on the pitch!",
      notFound: "{emoji} No club item found with that id in your clubroom.",
      notYours: "{emoji} That club is not yours.",
      favorited: "{emoji} {club} added to favorites.",
      unfavorited: "{emoji} {club} removed from favorites.",
      locked: "{emoji} {club} is now locked from transfers.",
      unlocked: "{emoji} {club} is now unlocked.",
      wagesCooled:
        "{emoji} Wages already collected. Next payout <t:{window}:R>.",
      lastEmpty: "{emoji} You have not signed any {collectible} yet.",
    },
    panels: {
      clubroomTitle: "{user}'s clubroom",
      clubroomSubtitle: "{count} {collectible} collected",
      itemLine: "-# **{name}** • {rarity}{markers}",
      dexTitle: "{club}",
      dexSubtitle: "{rarity} • obtained {obtained}",
      kitLine: "Variant: {emoji} {kit}",
      completionTitle: "{user}'s completion",
      completionSubtitle: "{rank}",
      progressTitle: "{user}'s progress",
      baseKit: "base",
      abilityLine: "Ability: {ability}",
      clubsLine: "-# Clubs: {count}/{total} ({percent}%)",
      kitsLine: "-# Kits: {count}/{total} ({percent}%)",
      rarityLine: "-# {tier}: {count}",
      lastTitle: "{user}'s last signature",
      lastSubtitle: "{club} • {when}",
      favorite: "Favorite",
      tradeable: "Tradeable",
      yes: "yes",
      no: "no",
      wagesTitle: "Wages collected",
      wagesSubtitle: "{reward} banked",
      newBalance: "New balance: {balance}",
      ledgerTitle: "Coin ledger",
      ledgerSubtitle: "{balance} available",
    },
    ranks: [
      { min: 95, title: "Club legend" },
      { min: 75, title: "Trophy manager" },
      { min: 50, title: "Transfer wizard" },
      { min: 25, title: "Squad builder" },
      { min: 0, title: "Rookie collector" },
    ],
  },

  transfers: {
    enabled: true,
    feePercent: 5,
    maxPerDay: 5,
    negotiationTimeoutSeconds: 300,
    labels: {
      accept: "Seal the deal",
      decline: "Decline",
    },
    messages: {
      invalidTarget: "{emoji} Invalid transfer target.",
      insufficientCoins: "{emoji} Not enough coins for that bundle.",
      notInClubroom: "{emoji} That club item is not in your clubroom.",
      clubLocked: "{emoji} That club is locked from transfers.",
      offerRejected: "{emoji} Offer rejected: {reason}.",
      reasonEscrow: "club already in escrow",
      reasonDaily: "daily transfer limit reached",
      closed: "{emoji} This negotiation is closed.",
      notParticipant: "{emoji} Not your negotiation.",
      expired: "{emoji} That offer expired.",
      onlyReceiver: "{emoji} Only the receiver can seal it.",
      bundleGone: "Creator no longer holds the bundled coins.",
      inboxEmpty: "{emoji} Inbox empty.",
      historyEmpty: "{emoji} No transfer history yet.",
    },
    panels: {
      offerTitle: "Transfer offer",
      offerSubtitle: "expires <t:{window}:R>",
      sends: "Sends: {items}",
      receives: "Receives: {items} {fee}",
      attachments: "Attachments: {coins}",
      fee: "Fee on completion: {fee}%",
      none: "—",
      sealedTitle: "Transfer sealed",
      declinedTitle: "Transfer declined",
      resolvedSubtitle: "by {user}",
      inboxTitle: "Transfer inbox",
      inboxSubtitle: "{count} pending",
      inboxLine: "-# {creator} — expires <t:{window}:R>",
      historyTitle: "Transfer history",
      historySubtitle: "last {count}",
      historyLine: "-# {status} • {items} — <t:{when}:R>",
      statusCompleted: "completed",
      statusDeclined: "declined",
      statusExpired: "expired",
    },
  },

  matchday: {
    enabled: true,
    winReward: 150,
    drawReward: 60,
    lossReward: 20,
    duelStake: 100,
    messages: {
      noClub: "{emoji} Sign a club first — your clubroom is empty.",
      noOpponents: "{emoji} No clubs available to face.",
      duelSelf: "{emoji} You cannot duel yourself.",
      duelBot: "{emoji} Bots cannot duel.",
      duelPending: "{emoji} A duel is already running. Finish it first.",
      duelGone: "{emoji} This duel expired.",
      duelNotYours: "{emoji} Not your duel.",
      duelStakeGone:
        "{emoji} A duelist can no longer cover the stake of {stake}.",
      rulesAccepted:
        "{emoji} Rules accepted — you are cleared for matchday.",
    },
    panels: {
      resultTitle: "FT {home} {scored} : {conceded} {away}",
      resultSubtitle: "{outcome} • {reward} earned",
      squadsLine: "-# Squads: {home} ({homeRarity}) vs {away} ({awayRarity})",
      balanceLine: "-# Balance: {balance}",
      rulesTitle: "Matchday book",
      rulesSubtitle: "friendly kickouts",
      rewardsLine: "-# {label}: {reward}",
      duelTitle: "Duel challenged",
      duelSubtitle: "{challenger} vs {opponent}",
      duelStakeLine: "-# Stake: {stake} each",
      duelWonTitle: "Duel settled",
      duelWonSubtitle: "{winner} takes the pot",
      duelScoreLine: "-# {home} ({homeRarity}) vs {away} ({awayRarity})",
      unknownAway: "???",
      noWinner: "—",
      labels: {
        win: "Win",
        draw: "Draw",
        loss: "Loss",
        winOutcome: "WIN",
        drawOutcome: "DRAW",
        lossOutcome: "LOSS",
        rulesAccept: "Accept rules",
        duelAccept: "Accept duel",
        duelDecline: "Decline duel",
      },
    },
  },

  pitch: {
    cacheTtlSeconds: 30,
    labels: {
      enable: "Enable spawns",
      disable: "Disable spawns",
      pin: "Pin spawns here",
    },
    messages: {
      guildOnly: "Guild pitches only.",
      needsManage: "{emoji} Manage Guild required.",
      spawnsOn: "enabled",
      spawnsOff: "disabled",
      anyChannel: "any text channel",
      spawnForced: "{emoji} A club was released on the pitch.",
      spawnNoChannel: "{emoji} No sendable pitch channel found.",
      banned: "{emoji} {user} is banned from the pitch.",
      unbanned: "{emoji} {user} is unbanned from the pitch.",
    },
    panels: {
      title: "{guild} pitch control",
      subtitle: "spawns {state}",
      channelLine: "-# Spawn channel: {channel}",
    },
  },

  info: {
    panels: {
      aboutTitle: "{name} — v{version}",
      clubLine: "-# Clubs in the dex: {clubs}",
      collectorLine: "-# Collectors: {collectors}",
      signatureLine: "-# Signatures: {signatures}",
      tradeLine: "-# Trades completed: {trades}",
      guildLine: "-# Guilds: {guilds}",
      dugoutLine: "-# Dugout: {modules}",
    },
  },
} as const;
`;

await Bun.write(configPath, configTemplate);
console.log(`✅ Generated ${configPath.replace(`${process.cwd()}/`, "")}`);
console.log(
  "🔐 configuration is git-excluded; open it to customise your FCDex settings.",
);
