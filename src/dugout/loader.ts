import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";

export interface FCDexCommand {
  data: { toJSON(): RESTPostAPIApplicationCommandsJSONBody };
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<unknown>;
}

export interface FCDexModule {
  name: string;
  register?: (client: Client) => Promise<void> | void;
  commands?: FCDexCommand[];
}

export interface DugoutConfig {
  dugout: readonly string[];
}

const dugoutDirectory = import.meta.dir;

function log(message: string): void {
  console.log(`[Dugout] ${message}`);
}

async function loadDugoutModules(
  config: DugoutConfig,
): Promise<Map<string, FCDexModule>> {
  const entries = await readdir(dugoutDirectory, { withFileTypes: true });

  const discoveredModules = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const enabledModules = [...new Set(config.dugout)];

  for (const moduleName of enabledModules) {
    if (!discoveredModules.includes(moduleName)) {
      throw new Error(
        `Module "${moduleName}" is enabled in config, but its folder was not found.`,
      );
    }
  }

  const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
  const loaded = new Map<string, FCDexModule>();

  for (const moduleName of discoveredModules) {
    if (!enabledModules.includes(moduleName)) {
      continue;
    }

    const entryPath = join(dugoutDirectory, moduleName, `index${extension}`);

    const loadedModule: { default?: FCDexModule } = await import(entryPath);

    const module = loadedModule.default;

    if (
      !module ||
      module.name !== moduleName ||
      (module.register && typeof module.register !== "function")
    ) {
      throw new Error(
        `Module "${moduleName}" must default-export an object with a matching name and register() function.`,
      );
    }

    loaded.set(moduleName, module);
  }

  return loaded;
}

function collectCommands(module: FCDexModule): FCDexCommand[] {
  if (!module.commands) return [];

  for (const command of module.commands) {
    if (typeof command.execute !== "function") {
      throw new Error(
        `Module "${module.name}" has a command without an execute handler.`,
      );
    }
  }

  return module.commands;
}

export async function loadModuleCommands(
  config: DugoutConfig,
): Promise<FCDexCommand[]> {
  const modules = await loadDugoutModules(config);

  for (const [moduleName, module] of modules) {
    log(`Loaded ${moduleName}`);
    collectCommands(module);
  }

  return [...modules.values()].flatMap((module) => collectCommands(module));
}

export async function loadModules(
  client: Client,
  config: DugoutConfig,
): Promise<FCDexCommand[]> {
  const modules = await loadDugoutModules(config);
  const commands: FCDexCommand[] = [];

  for (const [moduleName, module] of modules) {
    log(`Loaded ${moduleName}`);

    if (module.register) {
      await module.register(client);
    }

    commands.push(...collectCommands(module));
  }

  return commands;
}
