import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DiscoveredProject } from "../../contracts/router";

type DiscoverySource = DiscoveredProject["sources"][number];

interface Sighting {
  readonly path: string;
  readonly usedAtMs: number;
  readonly source: DiscoverySource;
}

export interface DiscoveryRoots {
  readonly home: string;
  readonly claudeProjects: string;
  readonly codexSessions: string;
  readonly piSessions: string;
  readonly cursorWorkspaceStorage: string;
  /** Temporary locations whose projects are never offered. */
  readonly excludedPrefixes: readonly string[];
}

export function defaultDiscoveryRoots(home = homedir()): DiscoveryRoots {
  return {
    home,
    claudeProjects: join(home, ".claude", "projects"),
    codexSessions: join(home, ".codex", "sessions"),
    piSessions: join(home, ".pi", "agent", "sessions"),
    cursorWorkspaceStorage: join(
      home,
      "Library",
      "Application Support",
      "Cursor",
      "User",
      "workspaceStorage",
    ),
    excludedPrefixes: ["/tmp", "/private/tmp", "/private/var", "/var/folders"],
  };
}

/** Transcript heads are small; the cwd sits in the first record of every format read here. */
const HEAD_BYTES = 16 * 1024;
/** Newest transcripts to read per Claude/pi project folder, and overall for Codex. */
const FILES_PER_FOLDER = 3;
const CODEX_FILE_LIMIT = 400;

async function readHead(path: string): Promise<string> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function listDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

async function mtimeMs(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return undefined;
  }
}

/** The first `"cwd"` string in a JSONL head, from whichever record carries it. */
export function cwdFromJsonlHead(head: string): string | undefined {
  for (const line of head.split("\n")) {
    if (!line.includes('"cwd"')) continue;
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      const payload = record.payload as Record<string, unknown> | undefined;
      const cwd = record.cwd ?? payload?.cwd;
      if (typeof cwd === "string" && cwd.startsWith("/")) return cwd;
    } catch {
      // A truncated last line in the head; keep scanning earlier-complete lines.
    }
  }
  return undefined;
}

async function newestJsonl(folder: string, limit: number): Promise<{ path: string; ms: number }[]> {
  const files = (await listDir(folder)).filter((name) => name.endsWith(".jsonl"));
  const withTimes = await Promise.all(
    files.map(async (name) => {
      const path = join(folder, name);
      return { path, ms: (await mtimeMs(path)) ?? 0 };
    }),
  );
  return withTimes.sort((left, right) => right.ms - left.ms).slice(0, limit);
}

async function sightingsFromFolders(root: string, source: DiscoverySource): Promise<Sighting[]> {
  const sightings: Sighting[] = [];
  for (const folder of await listDir(root)) {
    for (const file of await newestJsonl(join(root, folder), FILES_PER_FOLDER)) {
      try {
        const cwd = cwdFromJsonlHead(await readHead(file.path));
        if (cwd) {
          sightings.push({ path: cwd, usedAtMs: file.ms, source });
          break;
        }
      } catch {
        // Unreadable transcript: skip it.
      }
    }
  }
  return sightings;
}

async function codexSightings(root: string): Promise<Sighting[]> {
  // Layout: sessions/YYYY/MM/DD/rollout-*.jsonl. Walk newest days first.
  const files: string[] = [];
  const descending = (names: string[]) => names.sort((left, right) => right.localeCompare(left));
  outer: for (const year of descending(await listDir(root))) {
    for (const month of descending(await listDir(join(root, year)))) {
      for (const day of descending(await listDir(join(root, year, month)))) {
        const dayDir = join(root, year, month, day);
        for (const name of descending(await listDir(dayDir))) {
          if (!name.endsWith(".jsonl")) continue;
          files.push(join(dayDir, name));
          if (files.length >= CODEX_FILE_LIMIT) break outer;
        }
      }
    }
  }
  const sightings: Sighting[] = [];
  for (const file of files) {
    try {
      const cwd = cwdFromJsonlHead(await readHead(file));
      const ms = await mtimeMs(file);
      if (cwd && ms !== undefined) sightings.push({ path: cwd, usedAtMs: ms, source: "codex" });
    } catch {
      // Unreadable transcript: skip it.
    }
  }
  return sightings;
}

async function cursorSightings(root: string): Promise<Sighting[]> {
  const sightings: Sighting[] = [];
  for (const entry of await listDir(root)) {
    const file = join(root, entry, "workspace.json");
    try {
      const record = JSON.parse(await readFile(file, "utf8")) as { folder?: unknown };
      if (typeof record.folder !== "string" || !record.folder.startsWith("file://")) continue;
      const ms = await mtimeMs(join(root, entry));
      if (ms !== undefined) {
        sightings.push({ path: fileURLToPath(record.folder), usedAtMs: ms, source: "cursor" });
      }
    } catch {
      // No workspace.json (empty window) or malformed: skip it.
    }
  }
  return sightings;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function isExcludedLocation(path: string, roots: DiscoveryRoots): boolean {
  if (path === "/" || path === roots.home) return true;
  return roots.excludedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Working directories the user has run coding agents in, newest first. Only the
 * `cwd` of each transcript is kept; no conversation content leaves this function.
 */
export async function discoverProjects(
  roots: DiscoveryRoots,
  extra: readonly { readonly path: string; readonly usedAt: string }[] = [],
): Promise<DiscoveredProject[]> {
  const batches = await Promise.all([
    sightingsFromFolders(roots.claudeProjects, "claude"),
    codexSightings(roots.codexSessions),
    sightingsFromFolders(roots.piSessions, "pi"),
    cursorSightings(roots.cursorWorkspaceStorage),
  ]);
  const sightings = [
    ...batches.flat(),
    ...extra.map((entry) => ({
      path: entry.path,
      usedAtMs: Date.parse(entry.usedAt) || 0,
      source: "routey" as const,
    })),
  ];

  const byPath = new Map<string, { usedAtMs: number; sources: Set<DiscoverySource> }>();
  for (const sighting of sightings) {
    const path = resolve(sighting.path);
    if (isExcludedLocation(path, roots)) continue;
    const entry = byPath.get(path) ?? { usedAtMs: 0, sources: new Set<DiscoverySource>() };
    entry.usedAtMs = Math.max(entry.usedAtMs, sighting.usedAtMs);
    entry.sources.add(sighting.source);
    byPath.set(path, entry);
  }

  const existing = await Promise.all(
    [...byPath.entries()].map(async ([path, entry]): Promise<DiscoveredProject | undefined> =>
      (await isDirectory(path))
        ? {
            path,
            name: basename(path),
            lastUsedAt: new Date(entry.usedAtMs).toISOString(),
            sources: [...entry.sources].sort(),
          }
        : undefined,
    ),
  );
  return existing
    .filter((project): project is DiscoveredProject => project !== undefined)
    .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));
}
