
import { z } from "zod";
import { config } from "./config.js";

const configSchema = z.object({
  discord: z.object({
    token: z.string().trim().min(1, "Discord bot token is missing."),
    clientId: z.string().trim().min(1, "Discord client ID is missing."),
  }),

  bot: z.object({
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    embedColor: z.number().int().min(0).max(0xffffff),
  }),

  packages: z.array(z.string().trim().min(1)).min(1),

  rarity: z.object({
    minTier: z.number().int().positive(),
    maxTier: z.number().int().positive(),
    spawnWeights: z.record(z.string(), z.number().nonnegative()),
  }),

  appearance: z.object({
    errorEmoji: z.string().min(1),
  }),
});

export function validateConfig(): void {
  const result = configSchema.safeParse(config);

  if (!result.success) {
    console.error("\n[Config] ✗ Configuration validation failed:");

    for (const issue of result.error.issues) {
      console.error(
        `  • ${issue.path.join(".") || "config"}: ${issue.message}`,
      );
    }

    throw new Error("Invalid FCDex configuration.");
  }

  if (config.rarity.minTier > config.rarity.maxTier) {
    throw new Error(
      "[Config] rarity.minTier cannot be greater than rarity.maxTier.",
    );
  }

  const duplicatePackages = config.packages.filter(
    (name, index, packages) => packages.indexOf(name) !== index,
  );

  if (duplicatePackages.length > 0) {
    throw new Error(
      `[Config] Duplicate package entries: ${[...new Set(duplicatePackages)].join(", ")}`,
    );
  }

  console.log("[Config] ✓ Configuration validated successfully.");
}
