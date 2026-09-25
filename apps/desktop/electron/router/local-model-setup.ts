import {
  LOCAL_MODEL_CATALOG,
  type LocalModelPull,
  type LocalModelSetup,
} from "../../contracts/local-models";
import type { RosterModel } from "../../contracts/router";

/**
 * The local-model guide's state: whether Ollama answers, and for each catalog
 * model whether it is installed, already routed, fits this Mac, and any pull
 * in progress. Setup is needed while the roster has no local model.
 */
export function buildLocalModelSetup(input: {
  readonly ollamaUrl: string;
  /** Installed tags, or undefined when Ollama did not answer. */
  readonly installed: readonly string[] | undefined;
  readonly roster: readonly RosterModel[];
  readonly memoryGb: number;
  readonly pulls: ReadonlyMap<string, LocalModelPull>;
}): LocalModelSetup {
  const installed = input.installed ?? [];
  return {
    ollama: input.installed === undefined ? "unreachable" : "running",
    ollamaUrl: input.ollamaUrl,
    memoryGb: input.memoryGb,
    needsSetup: !input.roster.some((model) => model.tier === "local"),
    models: LOCAL_MODEL_CATALOG.map((profile) => {
      const tags = [profile.tag, ...profile.aliases];
      const installedTag = installed.find(
        (tag) => tags.includes(tag) || tag.startsWith(`${profile.tag}-`),
      );
      const pull = input.pulls.get(profile.tag);
      return {
        profile,
        ...(installedTag ? { installedTag } : {}),
        routed: input.roster.some(
          (model) => tags.includes(model.modelId) || model.modelId.startsWith(`${profile.tag}-`),
        ),
        fits: profile.minMemoryGb <= input.memoryGb,
        ...(pull ? { pull } : {}),
      };
    }),
  };
}
