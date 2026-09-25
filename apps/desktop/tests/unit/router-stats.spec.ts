import { expect, test } from "@playwright/test";
import type { RouterDecisionRecord } from "../../contracts/router";
import { aggregateRouterStats } from "../../electron/router/router-stats";

function decision(provider: string, modelId: string, timestamp: string): RouterDecisionRecord {
  return {
    id: timestamp,
    timestamp,
    promptExcerpt: "p",
    firstTurn: false,
    source: { kind: "heuristic", reason: "test" },
    signals: {
      kindScores: { coding: 0, general: 0, app: 0, writing: 0, research: 0 },
      difficulty: 1,
      readOnly: 0,
      needsProject: 0,
      multiModel: 0,
    },
    answers: [],
    cues: [],
    decision: {
      taskKind: "general",
      tier: provider === "ollama" ? "local" : "frontier",
      provider,
      modelId,
      thinkingLevel: "off",
      mode: "answer",
      cwd: "/w",
      reasons: [],
    },
  };
}

test("sums routed turns and tokens per model across sessions, busiest first", () => {
  const stats = aggregateRouterStats("all", [
    {
      decisions: [
        decision("ollama", "gemma", "2026-09-25T10:00:00.000Z"),
        decision("ollama", "gemma", "2026-09-25T10:05:00.000Z"),
      ],
      usage: [
        { provider: "ollama", modelId: "gemma", input: 100, output: 20, cacheRead: 0 },
        { provider: "ollama", modelId: "gemma", input: 50, output: 10, cacheRead: 5 },
      ],
    },
    {
      decisions: [decision("anthropic", "claude", "2026-09-24T09:00:00.000Z")],
      usage: [{ provider: "anthropic", modelId: "claude", input: 4000, output: 800, cacheRead: 0 }],
    },
    { decisions: [], usage: [] },
  ]);
  expect(stats).toEqual({
    scope: "all",
    sessions: 2,
    turns: 3,
    since: "2026-09-24T09:00:00.000Z",
    models: [
      {
        provider: "ollama",
        modelId: "gemma",
        tier: "local",
        turns: 2,
        input: 150,
        output: 30,
        cacheRead: 5,
      },
      {
        provider: "anthropic",
        modelId: "claude",
        tier: "frontier",
        turns: 1,
        input: 4000,
        output: 800,
        cacheRead: 0,
      },
    ],
  });
});

test("counts tokens for a model that ran without being routed to", () => {
  // A routed model that failed to load leaves the turn on the session's current model.
  const stats = aggregateRouterStats("session", [
    {
      decisions: [decision("ollama", "missing", "2026-09-25T10:00:00.000Z")],
      usage: [{ provider: "anthropic", modelId: "claude", input: 10, output: 5, cacheRead: 0 }],
    },
  ]);
  expect(stats.models.map((model) => [model.modelId, model.turns, model.input])).toEqual([
    ["missing", 1, 0],
    ["claude", 0, 10],
  ]);
});
