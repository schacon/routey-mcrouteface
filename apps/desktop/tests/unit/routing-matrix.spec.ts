import { expect, test } from "@playwright/test";
import type { RosterModel, RouterConfig, RouterSignals } from "../../contracts/router";
import { decodeRouterConfig } from "../../contracts/router";
import { cellSuggestions } from "../../electron/router/cell-suggestions";
import {
  resolveRouteDecision,
  routeMatrix,
  type AvailableModel,
} from "../../electron/router/route-policy";
import { detectSpecialty } from "../../electron/router/specialty-cues";
import { activeEngine, specialtyStatuses } from "../../electron/router/specialty-engines";

const localGeneral: RosterModel = {
  provider: "ollama",
  modelId: "qwen3.5:9b",
  tier: "local",
  capabilities: ["general", "writing", "app"],
  goodAt: "fast private answers",
};
const frontier: RosterModel = {
  provider: "anthropic",
  modelId: "claude-opus-5-5",
  tier: "frontier",
  capabilities: ["coding", "research", "general"],
  goodAt: "hardest tasks",
};
const sonnet: RosterModel = {
  provider: "openrouter",
  modelId: "anthropic/claude-sonnet-5",
  tier: "hosted",
  capabilities: ["coding"],
  goodAt: "workhorse",
};

const base: RouterConfig = {
  version: 1,
  roster: [localGeneral, frontier, sonnet],
  pinnedProjects: [],
  excludedProjects: [],
  scratchDirectory: "/Users/me/routey-mcrouteface",
};

const available: AvailableModel[] = base.roster.map((model) => ({
  provider: model.provider,
  modelId: model.modelId,
  supportsImages: false,
}));

function signals(difficulty: number): RouterSignals {
  return {
    kindScores: { coding: 1, general: 0, app: 0, writing: 0, research: 0 },
    difficulty,
    readOnly: 0,
    needsProject: 0,
    multiModel: 0,
  };
}

test("the matrix follows roster order until a cell is pinned", () => {
  const cell = routeMatrix(base, available).find((entry) => entry.key === "coding:moderate");
  expect(cell).toMatchObject({
    preferredTier: "frontier",
    pinned: false,
    pick: { modelId: "claude-opus-5-5", tier: "frontier" },
  });

  const pinned: RouterConfig = {
    ...base,
    routes: { "coding:moderate": { provider: "openrouter", modelId: "anthropic/claude-sonnet-5" } },
  };
  const pinnedCell = routeMatrix(pinned, available).find(
    (entry) => entry.key === "coding:moderate",
  );
  expect(pinnedCell).toMatchObject({
    pinned: true,
    pick: { modelId: "anthropic/claude-sonnet-5" },
  });

  const decision = resolveRouteDecision({
    taskKind: "coding",
    signals: signals(1.65),
    config: pinned,
    availableModels: available,
    hasImages: false,
  });
  expect(decision.modelId).toBe("anthropic/claude-sonnet-5");
  expect(decision.reasons.join(" ")).toContain("pins coding/moderate");
  // Other cells are unaffected.
  expect(
    resolveRouteDecision({
      taskKind: "coding",
      signals: signals(2.5),
      config: pinned,
      availableModels: available,
      hasImages: false,
    }).modelId,
  ).toBe("claude-opus-5-5");
});

test("a pin to a model that is not usable falls back to roster order", () => {
  const config: RouterConfig = {
    ...base,
    routes: { "general:easy": { provider: "openrouter", modelId: "openai/gpt-6-luna" } },
  };
  const cell = routeMatrix(config, available).find((entry) => entry.key === "general:easy");
  expect(cell).toMatchObject({
    pinned: false,
    pinnedUnavailable: { modelId: "openai/gpt-6-luna" },
    pick: { modelId: "qwen3.5:9b" },
  });
});

test("router config round-trips routes and specialties and rejects bad cells", () => {
  const config: RouterConfig = {
    ...base,
    routes: { "writing:hard": { provider: "anthropic", modelId: "claude-opus-5-5" } },
    specialties: { speech: { runtime: "macos-say", modelId: "say" } },
  };
  expect(decodeRouterConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
  expect(() =>
    decodeRouterConfig({ ...base, routes: { "cooking:hard": { provider: "a", modelId: "b" } } }),
  ).toThrow(/task kind/);
  expect(() =>
    decodeRouterConfig({ ...base, specialties: { speech: { runtime: "cloud", modelId: "x" } } }),
  ).toThrow(/runtime/);
});

test("suggestions resolve against the roster and connected providers", () => {
  const suggestions = cellSuggestions(base, [
    ...available,
    { provider: "openrouter", modelId: "openai/gpt-6-sol", supportsImages: false },
  ])["coding:moderate"];
  const byName = new Map(suggestions?.map((entry) => [entry.name, entry]));
  expect(byName.get("GPT-6 Sol")).toMatchObject({
    state: "add",
    ref: { provider: "openrouter", modelId: "openai/gpt-6-sol" },
  });
  expect(byName.get("GLM-5.3")).toMatchObject({ state: "sign-in" });
  // Suggestions that are already routed sort after the ones the user can act on.
  expect(suggestions?.at(0)?.state).toBe("add");
});

test("specialty cues catch media requests and skip software that mentions images", () => {
  const kind = (prompt: string, images = false) => detectSpecialty(prompt, images)?.kind;
  expect(kind("generate an image of a fox reading a newspaper")).toBe("image-generation");
  expect(kind("draw me a logo for a coffee shop called Bean There")).toBe("image-generation");
  expect(kind("build a docker image for this service")).toBeUndefined();
  expect(kind("make an avatar component in React")).toBeUndefined();
  expect(kind("remove the background from this photo", true)).toBe("image-editing");
  expect(kind("what's in this picture?", true)).toBeUndefined();
  expect(kind("transcribe ~/Downloads/standup.m4a")).toBe("transcription");
  expect(kind("what did they say in meeting.mp3")).toBe("transcription");
  expect(kind("read this aloud: the quick brown fox")).toBe("speech");
  expect(kind("what's the capital of Peru")).toBeUndefined();
});

test("specialty engines: saved choice when usable, else the first usable engine", () => {
  const env = {
    openRouterConnected: false,
    commands: new Set(["say", "afconvert"]),
    platform: "darwin" as const,
  };
  expect(activeEngine("speech", base, env)).toEqual({ runtime: "macos-say", modelId: "say" });
  expect(activeEngine("image-generation", base, env)).toBeUndefined();

  const connected = { ...env, openRouterConnected: true };
  expect(activeEngine("image-generation", base, connected)).toEqual({
    runtime: "openrouter",
    modelId: "openai/gpt-image-2",
  });
  const chosen: RouterConfig = {
    ...base,
    specialties: {
      "image-generation": { runtime: "openrouter", modelId: "black-forest-labs/flux.2-klein-4b" },
      transcription: { runtime: "mlx-audio", modelId: "mlx-community/parakeet-tdt-0.6b-v3" },
    },
  };
  expect(activeEngine("image-generation", chosen, connected)?.modelId).toBe(
    "black-forest-labs/flux.2-klein-4b",
  );
  // mlx-audio is not installed, so transcription falls back to OpenRouter.
  expect(activeEngine("transcription", chosen, connected)).toEqual({
    runtime: "openrouter",
    modelId: "google/gemini-3.8-flash",
  });
  const status = specialtyStatuses(chosen, env).find((entry) => entry.kind === "transcription");
  expect(status?.active).toBeUndefined();
  expect(status?.engines.map((entry) => entry.reason)).toContain("Install mlx-audio");
});
