import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import {
  cwdFromJsonlHead,
  discoverProjects,
  type DiscoveryRoots,
} from "../../electron/router/workspace-discovery";
import { DecisionLogStore } from "../../electron/router/decision-log-store";

async function fixture(): Promise<{ roots: DiscoveryRoots; projects: Record<string, string> }> {
  const home = await mkdtemp(join(tmpdir(), "routey-discovery-"));
  const projects = {
    alpha: join(home, "code", "alpha"),
    beta: join(home, "code", "beta"),
    gamma: join(home, "code", "gamma"),
    delta: join(home, "code", "delta"),
  };
  for (const path of Object.values(projects)) await mkdir(path, { recursive: true });
  const roots: DiscoveryRoots = {
    home,
    claudeProjects: join(home, ".claude", "projects"),
    codexSessions: join(home, ".codex", "sessions"),
    piSessions: join(home, ".pi", "agent", "sessions"),
    cursorWorkspaceStorage: join(home, "cursor", "workspaceStorage"),
    // The fixture home itself lives under the OS temp dir, so only exclude /private/tmp here.
    excludedPrefixes: ["/private/tmp"],
  };

  // Claude: the cwd shows up on a later record, not the first line.
  const claudeDir = join(roots.claudeProjects, "-code-alpha");
  await mkdir(claudeDir, { recursive: true });
  await writeFile(
    join(claudeDir, "one.jsonl"),
    `${JSON.stringify({ type: "summary" })}\n${JSON.stringify({ type: "user", cwd: projects.alpha })}\n`,
  );
  // Claude: a transcript for a folder that no longer exists, and one in /tmp.
  const goneDir = join(roots.claudeProjects, "-gone");
  await mkdir(goneDir, { recursive: true });
  await writeFile(join(goneDir, "a.jsonl"), `${JSON.stringify({ cwd: join(home, "gone") })}\n`);
  const tmpDir = join(roots.claudeProjects, "-tmp");
  await mkdir(tmpDir, { recursive: true });
  await writeFile(join(tmpDir, "a.jsonl"), `${JSON.stringify({ cwd: "/private/tmp/x" })}\n`);

  // Codex: session_meta payload on the first line.
  const codexDay = join(roots.codexSessions, "2026", "09", "20");
  await mkdir(codexDay, { recursive: true });
  const codexFile = join(codexDay, "rollout-1.jsonl");
  await writeFile(
    codexFile,
    `${JSON.stringify({ type: "session_meta", payload: { cwd: projects.beta } })}\n`,
  );

  // pi: header record with cwd; malformed lines are skipped.
  const piDir = join(roots.piSessions, "--code-gamma--");
  await mkdir(piDir, { recursive: true });
  await writeFile(
    join(piDir, "s.jsonl"),
    `not json\n${JSON.stringify({ type: "session", cwd: projects.gamma })}\n`,
  );

  // Cursor: workspace.json with a file URI; an empty window has none.
  const cursorEntry = join(roots.cursorWorkspaceStorage, "abc");
  await mkdir(cursorEntry, { recursive: true });
  await writeFile(
    join(cursorEntry, "workspace.json"),
    JSON.stringify({ folder: pathToFileURL(projects.delta).href }),
  );
  await mkdir(join(roots.cursorWorkspaceStorage, "empty"), { recursive: true });

  const old = new Date("2026-01-01T00:00:00Z");
  await utimes(codexFile, old, old);
  return { roots, projects };
}

test("finds working directories from Claude, Codex, pi and Cursor transcripts", async () => {
  const { roots, projects } = await fixture();
  const found = await discoverProjects(roots, [
    { path: projects.alpha, usedAt: "2026-09-24T00:00:00.000Z" },
  ]);
  const byName = new Map(found.map((project) => [project.name, project]));
  expect([...byName.keys()].sort()).toEqual(["alpha", "beta", "delta", "gamma"]);
  expect(byName.get("alpha")?.sources).toEqual(["claude", "routey"]);
  expect(byName.get("beta")?.sources).toEqual(["codex"]);
  expect(byName.get("gamma")?.sources).toEqual(["pi"]);
  expect(byName.get("delta")?.sources).toEqual(["cursor"]);
  // Oldest last: the Codex transcript was backdated.
  expect(found.at(-1)?.name).toBe("beta");
});

test("reads cwd from either a top-level field or a Codex payload", () => {
  expect(cwdFromJsonlHead('{"cwd":"/a"}\n')).toBe("/a");
  expect(cwdFromJsonlHead('{"type":"session_meta","payload":{"cwd":"/b"}}\n')).toBe("/b");
  expect(cwdFromJsonlHead('{"cwd":"relative"}\n{"cwd":"/c"}\n')).toBe("/c");
  expect(cwdFromJsonlHead('{"cwd":"/trunc')).toBeUndefined();
});

test("decision logs append per session and skip interrupted lines", async () => {
  const dir = await mkdtemp(join(tmpdir(), "routey-log-"));
  const store = new DecisionLogStore(dir);
  const ref = { workspaceId: "/w", sessionId: "abc-123" };
  const record = {
    id: "1",
    timestamp: "2026-09-25T00:00:00.000Z",
    promptExcerpt: "hi",
    firstTurn: true,
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
      tier: "local",
      provider: "ollama",
      modelId: "m",
      thinkingLevel: "off",
      mode: "answer",
      cwd: "/w",
      reasons: [],
    },
  } as const;
  await store.append(ref, record);
  await writeFile(join(dir, "router-decisions", "abc-123.jsonl"), '{"broken"\n', { flag: "a" });
  await store.append(ref, { ...record, id: "2" });
  await store.writePurpose(ref, { text: "Say hi", generatedAt: record.timestamp });
  const info = await store.read(ref);
  expect(info.decisions.map((decision) => decision.id)).toEqual(["1", "2"]);
  expect(info.purpose?.text).toBe("Say hi");
  await expect(store.read({ workspaceId: "/w", sessionId: "../escape" })).rejects.toThrow(
    /Unexpected session id/,
  );
});
