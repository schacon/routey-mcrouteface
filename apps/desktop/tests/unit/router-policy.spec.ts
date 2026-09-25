import { expect, test } from "@playwright/test";
import type { RosterModel, RouterConfig } from "../../contracts/router";
import { decodeRouterConfig } from "../../contracts/router";
import {
  resolveRouteDecision,
  rosterModelUses,
  type AvailableModel,
} from "../../electron/router/route-policy";
import { describeModelUses } from "../../src/features/workbench/info-available-models";
import { seedRoster } from "../../electron/router/router-config-store";
import {
  combineSignals,
  findMentionedProject,
  pickTaskKind,
} from "../../electron/router/router-signals";
import type { LayaWireAnswer } from "../../electron/router/laya-client";

const localGeneral: RosterModel = {
  provider: "ollama",
  modelId: "qwen3.5:9b",
  tier: "local",
  capabilities: ["general", "writing", "app"],
  goodAt: "fast private answers",
};
const localCoder: RosterModel = {
  provider: "ollama",
  modelId: "qwen3-coder:30b",
  tier: "local",
  capabilities: ["coding"],
  goodAt: "local coding",
};
const frontier: RosterModel = {
  provider: "openai-codex",
  modelId: "gpt-frontier",
  tier: "frontier",
  capabilities: ["coding", "research", "general", "vision"],
  goodAt: "hardest tasks",
};

const config: RouterConfig = {
  version: 1,
  roster: [localGeneral, localCoder, frontier],
  pinnedProjects: [],
  excludedProjects: [],
  scratchDirectory: "/Users/me/routey-mcrouteface",
};

const available: AvailableModel[] = [localGeneral, localCoder, frontier].map((model) => ({
  provider: model.provider,
  modelId: model.modelId,
  supportsImages: model.capabilities.includes("vision"),
}));

const projects = ["/Users/me/projects/pi-gui", "/Users/me/projects/pi", "/Users/me/blogerator"];

function noul(key: string, yes: number): LayaWireAnswer {
  return {
    key,
    labels: ["false", "true"],
    probabilities: [1 - yes, yes],
    selected: yes >= 0.5 ? "true" : "false",
    confidence: 0,
    truncated: false,
  };
}

function difficulty(expected: number): LayaWireAnswer {
  // A distribution whose expected level is `expected` on the five-level scale.
  const low = Math.floor(expected);
  const high = Math.min(low + 1, 4);
  const probabilities = [0, 0, 0, 0, 0];
  probabilities[low] = high === low ? 1 : high - expected;
  if (high !== low) probabilities[high] = expected - low;
  return {
    key: "difficulty",
    labels: ["0", "1", "2", "3", "4"],
    probabilities,
    selected: String(low),
    confidence: 0,
    truncated: false,
  };
}

function route(
  prompt: string,
  answers: LayaWireAnswer[] = [],
  extra: Partial<Parameters<typeof resolveRouteDecision>[0]> = {},
) {
  const { signals, cues } = combineSignals({ prompt, answers, knownProjects: projects });
  return resolveRouteDecision({
    taskKind: pickTaskKind(signals, cues),
    signals,
    config,
    availableModels: available,
    hasImages: false,
    ...extra,
  });
}

test("names the longest matching project and ignores partial words", () => {
  expect(findMentionedProject("in pi-gui, refactor the panel", projects)).toBe(
    "/Users/me/projects/pi-gui",
  );
  // Names under three characters are too ambiguous to match in prose.
  expect(findMentionedProject("ask pi about it", projects)).toBeUndefined();
  expect(findMentionedProject("add a toggle to the blog", projects)).toBeUndefined();
});

test("a named project makes a coding task that runs in that project", () => {
  const decision = route("in pi-gui, refactor the workbench persistence", [
    noul("kind.coding", 0.3),
    difficulty(1.75),
  ]);
  expect(decision.taskKind).toBe("coding");
  expect(decision.cwd).toBe("/Users/me/projects/pi-gui");
  expect(decision.mode).toBe("execute");
  expect(decision.tier).toBe("frontier");
});

test("a trivial general question stays local, answers without tools, in the scratch dir", () => {
  const decision = route("what is the capital of Peru?", [difficulty(1.3)]);
  expect(decision.taskKind).toBe("general");
  expect(decision.modelId).toBe("qwen3.5:9b");
  expect(decision.mode).toBe("answer");
  expect(decision.thinkingLevel).toBe("off");
  expect(decision.cwd).toBe(config.scratchDirectory);
});

test("a settings instruction is an app task even when it mentions coding", () => {
  const decision = route("use a local model for coding questions from now on", [
    noul("kind.coding", 0.7),
  ]);
  expect(decision.taskKind).toBe("app");
});

test("explain and plan requests run read-only; explicit write verbs do not", () => {
  expect(route("explain how the router in pi-gui picks a model").mode).toBe("plan");
  expect(route("fix the failing test in parser.rs", [noul("readOnly", 0.69)]).mode).toBe("execute");
  expect(route("plan the Swift port of pi-gui, don't change anything yet").mode).toBe("plan");
});

test("falls back across tiers and requires vision for images", () => {
  const onlyLocal = route("design a byzantine fault tolerant protocol", [difficulty(2.4)], {
    availableModels: available.filter((model) => model.provider === "ollama"),
  });
  expect(onlyLocal.tier).toBe("local");
  expect(onlyLocal.reasons.join(" ")).toContain("fell back to local");

  const withImage = route("what is in this picture?", [difficulty(1.2)], { hasImages: true });
  expect(withImage.modelId).toBe("gpt-frontier");
});

test("follow-ups keep the session directory", () => {
  const decision = route("now in blogerator do the same", [], {
    sessionCwd: "/Users/me/projects/pi-gui",
  });
  expect(decision.cwd).toBe("/Users/me/projects/pi-gui");
});

test("uses the default model when no roster model is usable", () => {
  const decision = route("hello", [], {
    config: { ...config, roster: [] },
    fallbackModel: { provider: "anthropic", modelId: "claude" },
  });
  expect(decision.modelId).toBe("claude");
});

test("seeds local providers as local and known providers as frontier", () => {
  const roster = seedRoster(
    [
      { provider: "ollama", modelId: "qwen3-coder:30b", supportsImages: false },
      { provider: "ollama", modelId: "gemma4:12b", supportsImages: true },
      { provider: "openai-codex", modelId: "gpt-x", supportsImages: true },
      { provider: "openrouter", modelId: "mix", supportsImages: false },
    ],
    new Set(["ollama"]),
  );
  expect(roster.map((model) => [model.modelId, model.tier])).toEqual([
    ["qwen3-coder:30b", "local"],
    ["gemma4:12b", "local"],
    ["gpt-x", "frontier"],
    ["mix", "hosted"],
  ]);
  expect(roster[0]?.capabilities).toContain("coding");
  expect(roster[1]?.capabilities).toContain("vision");
  expect(decodeRouterConfig({ ...config, roster })).toEqual({ ...config, roster });
});

test("router config decoding rejects unknown fields and versions", () => {
  expect(() => decodeRouterConfig({ ...config, extra: true })).toThrow(/unsupported fields/);
  expect(() => decodeRouterConfig({ ...config, version: 2 })).toThrow(/version/);
  expect(() => decodeRouterConfig({ ...config, roster: [{ ...frontier, tier: "cloud" }] })).toThrow(
    /tier/,
  );
});

test("describes what the router sends to each usable roster model", () => {
  const uses = rosterModelUses(config, available);
  const byModel = new Map(uses.map((use) => [use.modelId, describeModelUses(use.uses)]));
  // Local general takes easy chat, settings and writing; the local coder is never
  // preferred because easy coding goes to hosted, which falls back to frontier here.
  expect(byModel.get("qwen3.5:9b")).toBe("Easy general questions, Routey settings and writing.");
  expect(byModel.get("qwen3-coder:30b")).toBe(
    "Not picked right now: another model comes first in its tier.",
  );
  expect(byModel.get("gpt-frontier")).toBe(
    "Easy coding and research; every moderate prompt; every hard prompt.",
  );

  const withoutFrontier = rosterModelUses(
    config,
    available.filter((m) => m.provider === "ollama"),
  );
  expect(withoutFrontier.map((use) => use.modelId)).toEqual(["qwen3.5:9b", "qwen3-coder:30b"]);
});
