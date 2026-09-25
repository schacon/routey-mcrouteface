import { expect, test } from "@playwright/test";
import type { RouteMode, RouterDecisionRecord, TaskKind } from "../../contracts/router";
import { followUpAnchor, toolFloorKind } from "../../electron/router/session-routing";

function turn(id: string, taskKind: TaskKind, mode: RouteMode): RouterDecisionRecord {
  return {
    id,
    timestamp: `2026-09-25T10:0${id}:00.000Z`,
    promptExcerpt: id,
    firstTurn: id === "1",
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
      taskKind,
      tier: "local",
      provider: "ollama",
      modelId: "m",
      thinkingLevel: "off",
      mode,
      cwd: "/w",
      reasons: [],
    },
  };
}

// The nvim session: two coding turns, then "do it for me - fully disabled"
// misrouted to answer mode, then "try again" copying that bad route.
const nvimSession = [
  turn("1", "coding", "plan"),
  turn("2", "coding", "execute"),
  turn("3", "app", "answer"),
  turn("4", "general", "answer"),
];

test("follow-ups continue the session's last turn that ran with tools", () => {
  expect(followUpAnchor(nvimSession)?.id).toBe("2");
  expect(followUpAnchor([turn("1", "general", "answer")])?.id).toBe("1");
  expect(followUpAnchor([])).toBeUndefined();
});

test("a session that used tools never drops a follow-up to answer mode", () => {
  const anchor = followUpAnchor(nvimSession);
  expect(toolFloorKind(anchor, "answer")).toBe("coding");
  expect(toolFloorKind(anchor, "execute")).toBeUndefined();
  // A chat-only session may keep answering without tools.
  expect(toolFloorKind(turn("1", "general", "answer"), "answer")).toBeUndefined();
  expect(toolFloorKind(undefined, "answer")).toBeUndefined();
});
