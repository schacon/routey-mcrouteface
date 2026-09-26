import { localModelProfile } from "../../contracts/local-models";
import { suggestionsFor } from "../../contracts/model-catalog";
import {
  DIFFICULTY_BANDS,
  TASK_KINDS,
  routeCellKey,
  type CellSuggestion,
  type ModelRef,
  type RouteCellKey,
  type RouterConfig,
} from "../../contracts/router";
import type { AvailableModel } from "./route-policy";

const PER_CELL = 5;

function has(models: readonly ModelRef[], ref: ModelRef): boolean {
  return models.some((model) => model.provider === ref.provider && model.modelId === ref.modelId);
}

/**
 * Catalog suggestions for every matrix cell, each resolved to how this machine
 * can reach it: already routed, addable now through a connected provider,
 * an Ollama download away, or waiting on an OpenRouter sign-in.
 */
export function cellSuggestions(
  config: RouterConfig,
  availableModels: readonly AvailableModel[],
): Partial<Record<RouteCellKey, CellSuggestion[]>> {
  const result: Partial<Record<RouteCellKey, CellSuggestion[]>> = {};
  for (const taskKind of TASK_KINDS) {
    for (const difficulty of DIFFICULTY_BANDS) {
      result[routeCellKey(taskKind, difficulty)] = suggestionsFor(taskKind, difficulty)
        .map((suggestion): CellSuggestion => {
          const base = {
            name: suggestion.name,
            note: suggestion.note,
            tier: suggestion.tier,
            ...(suggestion.price ? { price: suggestion.price } : {}),
            ...(suggestion.ollamaTag ? { ollamaTag: suggestion.ollamaTag } : {}),
          };
          if (suggestion.ollamaTag) {
            const routed = config.roster.find(
              (model) => localModelProfile(model.modelId)?.tag === suggestion.ollamaTag,
            );
            return routed
              ? { ...base, ref: routed, state: "routed" }
              : {
                  ...base,
                  ref: { provider: "ollama", modelId: suggestion.ollamaTag },
                  state: "pull",
                };
          }
          const routed = suggestion.refs.find((ref) => has(config.roster, ref));
          if (routed) return { ...base, ref: routed, state: "routed" };
          const addable = suggestion.refs.find((ref) => has(availableModels, ref));
          if (addable) return { ...base, ref: addable, state: "add" };
          const fallback = suggestion.refs.at(-1) ?? suggestion.refs[0];
          if (!fallback) throw new Error(`${suggestion.name} has no model reference`);
          return { ...base, ref: fallback, state: "sign-in" };
        })
        // Things the user can act on first, then what is already in use.
        .sort((left, right) => rank(left.state) - rank(right.state))
        .slice(0, PER_CELL);
    }
  }
  return result;
}

function rank(state: CellSuggestion["state"]): number {
  return state === "add" ? 0 : state === "pull" ? 1 : state === "sign-in" ? 2 : 3;
}
