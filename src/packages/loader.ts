
import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Client } from "discord.js";

export interface FCDexPackage {
  name: string;
  register: (client: Client) => Promise<void> | void;
}

export interface PackageConfig {
  packages: readonly string[];
}

const packagesDirectory = dirname(fileURLToPath(import.meta.url));

function log(message: string): void {
  console.log(`[Packages] ${message}`);
}

export async function loadPackages(
  client: Client,
  config: PackageConfig,
): Promise<void> {
  log("Discovering packages...");

  const entries = await readdir(packagesDirectory, {
    withFileTypes: true,
  });

  const discoveredPackages = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const enabledPackages = [...new Set(config.packages)];

  log(`Discovered ${discoveredPackages.length} package folder(s).`);

  for (const packageName of enabledPackages) {
    if (!discoveredPackages.includes(packageName)) {
      throw new Error(
        `Package "${packageName}" is enabled in config, but its folder was not found.`,
      );
    }
  }

  // tsx runs the source TypeScript files; production runs compiled JavaScript.
  const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
  let loadedCount = 0;

  for (const packageName of discoveredPackages) {
    if (!enabledPackages.includes(packageName)) {
      log(`Skipping disabled package: ${packageName}`);
      continue;
    }

    const entryPath = join(
      packagesDirectory,
      packageName,
      `index${extension}`,
    );

    log(`Loading package: ${packageName}`);

    try {
      await access(entryPath, constants.R_OK);

      const loadedModule: { default?: FCDexPackage } = await import(
        pathToFileURL(entryPath).href
      );

      const featurePackage = loadedModule.default;

      if (
        !featurePackage ||
        featurePackage.name !== packageName ||
        typeof featurePackage.register !== "function"
      ) {
        throw new Error(
          `Package "${packageName}" must default-export an object with a matching name and register() function.`,
        );
      }

      await featurePackage.register(client);

      loadedCount++;
      log(`✓ ${packageName} loaded successfully.`);
    } catch (error) {
      log(`✗ Failed to load "${packageName}".`);
      throw error;
    }
  }

  log(`Package loading complete. ${loadedCount} package(s) loaded.`);
}
