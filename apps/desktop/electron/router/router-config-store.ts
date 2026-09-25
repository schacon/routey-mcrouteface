import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  decodeRouterConfig,
  type ModelCapability,
  type ModelTier,
  type RosterModel,
  type RouterConfig,
} from "../../contracts/router";
import { readJsonWithBackup, writeFileAtomicQueued } from "../persistence/atomic-file-write";
import type { AvailableModel } from "./route-policy";

export const DEFAULT_SCRATCH_DIRECTORY = join(homedir(), "routey-mcrouteface");

/** Providers whose models are frontier-class; everything else remote is "hosted". */
const FRONTIER_PROVIDERS = new Set([
  "anthropic",
  "openai",
  "openai-codex",
  "google",
  "google-gemini-cli",
  "google-vertex",
  "github-copilot",
  "xai",
]);

/**
 * `router-config.json` in userData. The first read with no file seeds a roster
 * from the models the runtime can use; later reads never rewrite what the user
 * changed.
 */
export class RouterConfigStore {
  private readonly filePath: string;
  private cached: RouterConfig | undefined;

  constructor(userDataDir: string) {
    this.filePath = join(userDataDir, "router-config.json");
  }

  async read(): Promise<RouterConfig | undefined> {
    if (this.cached) return this.cached;
    const result = await readJsonWithBackup(this.filePath);
    if (result.value === undefined) {
      if (result.corrupted) throw new Error(`${this.filePath} is corrupt; repair or remove it.`);
      return undefined;
    }
    this.cached = decodeRouterConfig(result.value);
    return this.cached;
  }

  async write(config: RouterConfig): Promise<RouterConfig> {
    const decoded = decodeRouterConfig(config);
    await writeFileAtomicQueued(
      this.filePath,
      `${JSON.stringify(decoded, null, 2)}\n`,
      decodeRouterConfig,
    );
    this.cached = decoded;
    return decoded;
  }

  /** The saved config, or a seeded one written on first use. */
  async readOrSeed(availableModels: readonly AvailableModel[]): Promise<RouterConfig> {
    const existing = await this.read();
    if (existing) return existing;
    const localProviders = await readLocalProviderIds();
    return this.write({
      version: 1,
      roster: seedRoster(availableModels, localProviders),
      pinnedProjects: [],
      excludedProjects: [],
      scratchDirectory: DEFAULT_SCRATCH_DIRECTORY,
    });
  }
}

/** Custom providers in pi's models.json whose base URL points at this machine. */
async function readLocalProviderIds(): Promise<ReadonlySet<string>> {
  const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
  try {
    const parsed = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8")) as {
      providers?: Record<string, { baseUrl?: unknown }>;
    };
    return new Set(
      Object.entries(parsed.providers ?? {})
        .filter(
          ([, provider]) =>
            typeof provider.baseUrl === "string" &&
            /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(provider.baseUrl),
        )
        .map(([id]) => id),
    );
  } catch {
    return new Set();
  }
}

function capabilitiesFor(model: AvailableModel, tier: ModelTier): ModelCapability[] {
  const id = model.modelId.toLowerCase();
  const capabilities = new Set<ModelCapability>();
  if (/coder|code|codex|devstral/.test(id)) capabilities.add("coding");
  else capabilities.add("general").add("writing").add("app");
  if (tier !== "local") capabilities.add("coding").add("research").add("general");
  if (model.supportsImages) capabilities.add("vision");
  return [...capabilities];
}

export function seedRoster(
  availableModels: readonly AvailableModel[],
  localProviders: ReadonlySet<string>,
): RosterModel[] {
  return availableModels.map((model) => {
    const tier: ModelTier = localProviders.has(model.provider)
      ? "local"
      : FRONTIER_PROVIDERS.has(model.provider)
        ? "frontier"
        : "hosted";
    const capabilities = capabilitiesFor(model, tier);
    return {
      provider: model.provider,
      modelId: model.modelId,
      tier,
      capabilities,
      goodAt:
        tier === "local"
          ? capabilities.includes("coding")
            ? "local coding model"
            : "fast private everyday answers"
          : tier === "frontier"
            ? "hardest coding and reasoning tasks"
            : "capable remote model for moderate tasks",
    };
  });
}
