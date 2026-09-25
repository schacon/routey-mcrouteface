import { execFile } from "node:child_process";
import type {
  GitButlerBranch,
  GitButlerChange,
  GitButlerStatus,
  GitButlerStatusResult,
} from "../../../contracts/gitbutler";
import { isolatedGitEnvironment } from "../files/git-environment";

const BUT_TIMEOUT_MS = 15_000;
const BUT_MAX_BUFFER = 16 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toChange(value: unknown): GitButlerChange {
  const entry = record(value);
  return {
    id: text(entry.cliId),
    path: text(entry.filePath),
    changeType: text(entry.changeType),
  };
}

function toBranch(value: unknown): GitButlerBranch {
  const entry = record(value);
  return {
    id: text(entry.cliId),
    name: text(entry.name),
    status: text(entry.branchStatus),
    commits: list(entry.commits).map((commitValue) => {
      const commit = record(commitValue);
      return {
        id: text(commit.cliId),
        sha: text(commit.commitId),
        title: text(commit.message).split("\n")[0] ?? "",
        authorName: text(commit.authorName),
        createdAt: text(commit.createdAt),
        conflicted: commit.conflicted === true,
      };
    }),
    upstreamOnlyCommits: list(entry.upstreamCommits).length,
  };
}

/** Tolerant of new fields and missing ones; `but status --json` is a CLI format, not a contract. */
export function normalizeButStatus(json: unknown): GitButlerStatus {
  const root = record(json);
  const base = record(root.mergeBase);
  const baseSha = text(base.commitId);
  return {
    unassignedChanges: list(root.uncommittedChanges).map(toChange),
    stacks: list(root.stacks).map((stackValue) => {
      const stack = record(stackValue);
      return {
        id: text(stack.cliId),
        assignedChanges: list(stack.assignedChanges).map(toChange),
        branches: list(stack.branches).map(toBranch),
      };
    }),
    ...(baseSha ? { base: { sha: baseSha, title: text(base.message).split("\n")[0] ?? "" } } : {}),
    behind:
      typeof record(root.upstreamState).behind === "number"
        ? (record(root.upstreamState).behind as number)
        : 0,
  };
}

export function classifyButError(
  message: string,
  code: string | number | undefined,
): Extract<GitButlerStatusResult, { state: "unavailable" }> {
  if (code === "ENOENT") {
    return {
      state: "unavailable",
      reason: "not-installed",
      message: "The GitButler CLI (but) is not installed or not on PATH.",
    };
  }
  const firstLine = message.replace(/^Error:\s*/, "").trim();
  if (/no git repository/i.test(message)) {
    return { state: "unavailable", reason: "not-a-repository", message: firstLine };
  }
  if (/but setup|target branch|not (been )?set ?up|not initiali[sz]ed/i.test(message)) {
    return { state: "unavailable", reason: "not-set-up", message: firstLine };
  }
  return { state: "unavailable", reason: "error", message: firstLine || "but status failed." };
}

/** Runs `but status --json` in a checkout. Read-only: it never sets anything up. */
export function readButStatus(cwd: string): Promise<GitButlerStatusResult> {
  return new Promise((resolve) => {
    execFile(
      "but",
      ["status", "--json"],
      {
        cwd,
        env: isolatedGitEnvironment(),
        timeout: BUT_TIMEOUT_MS,
        maxBuffer: BUT_MAX_BUFFER,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code;
          resolve(classifyButError(`${stderr}\n${stdout}`.trim() || error.message, code));
          return;
        }
        try {
          resolve({
            state: "ready",
            status: normalizeButStatus(JSON.parse(stdout) as unknown),
            checkedAt: new Date().toISOString(),
          });
        } catch {
          resolve({
            state: "unavailable",
            reason: "error",
            message: "but status returned output that is not JSON.",
          });
        }
      },
    );
  });
}
