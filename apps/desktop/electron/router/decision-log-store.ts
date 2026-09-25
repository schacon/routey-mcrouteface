import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SessionRef } from "@pi-gui/session-driver";
import type {
  ModelTokenUsage,
  RouterDecisionRecord,
  RouterSessionInfo,
  SessionPurpose,
} from "../../contracts/router";

/** Session ids are pi's UUIDs; anything else is rejected so paths stay inside the log directory. */
function safeSessionId(sessionRef: SessionRef): string {
  if (!/^[A-Za-z0-9_-]+$/.test(sessionRef.sessionId)) {
    throw new Error(`Unexpected session id: ${sessionRef.sessionId}`);
  }
  return sessionRef.sessionId;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

/**
 * One append-only JSONL file of routing decisions per session, plus a small
 * purpose file, under `<userData>/router-decisions/`. A malformed line (an
 * interrupted append) is skipped rather than failing the whole log.
 */
export class DecisionLogStore {
  private readonly directory: string;

  constructor(userDataDir: string) {
    this.directory = join(userDataDir, "router-decisions");
  }

  async append(sessionRef: SessionRef, record: RouterDecisionRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await appendFile(
      join(this.directory, `${safeSessionId(sessionRef)}.jsonl`),
      `${JSON.stringify(record)}\n`,
      "utf8",
    );
  }

  async read(sessionRef: SessionRef): Promise<RouterSessionInfo> {
    const id = safeSessionId(sessionRef);
    const decisions = await this.readLines<RouterDecisionRecord>(`${id}.jsonl`);
    const purpose = await this.readPurpose(id);
    return purpose ? { decisions, purpose } : { decisions };
  }

  /** Appends tokens a model used in this session (one line per usage update). */
  async appendUsage(sessionRef: SessionRef, usage: ModelTokenUsage): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await appendFile(
      join(this.directory, `${safeSessionId(sessionRef)}.usage.jsonl`),
      `${JSON.stringify({ ...usage, at: new Date().toISOString() })}\n`,
      "utf8",
    );
  }

  /** Every session's decisions and token usage, for router stats. */
  async readAllSessions(): Promise<
    { readonly decisions: RouterDecisionRecord[]; readonly usage: ModelTokenUsage[] }[]
  > {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const ids = [
      ...new Set(
        names.flatMap((name) => {
          const match = /^([A-Za-z0-9_-]+)\.(jsonl|usage\.jsonl)$/.exec(name);
          return match?.[1] ? [match[1]] : [];
        }),
      ),
    ];
    return Promise.all(
      ids.map(async (id) => ({
        decisions: await this.readLines<RouterDecisionRecord>(`${id}.jsonl`),
        usage: await this.readLines<ModelTokenUsage>(`${id}.usage.jsonl`),
      })),
    );
  }

  async readUsage(sessionRef: SessionRef): Promise<ModelTokenUsage[]> {
    return this.readLines<ModelTokenUsage>(`${safeSessionId(sessionRef)}.usage.jsonl`);
  }

  private async readLines<T>(name: string): Promise<T[]> {
    try {
      const raw = await readFile(join(this.directory, name), "utf8");
      return raw.split("\n").flatMap((line) => {
        if (!line.trim()) return [];
        try {
          return [JSON.parse(line) as T];
        } catch {
          return []; // Interrupted append.
        }
      });
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }

  async writePurpose(sessionRef: SessionRef, purpose: SessionPurpose): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(
      join(this.directory, `${safeSessionId(sessionRef)}.purpose.json`),
      `${JSON.stringify(purpose)}\n`,
      "utf8",
    );
  }

  private async readPurpose(id: string): Promise<SessionPurpose | undefined> {
    try {
      const parsed = JSON.parse(
        await readFile(join(this.directory, `${id}.purpose.json`), "utf8"),
      ) as Partial<SessionPurpose>;
      return typeof parsed.text === "string" && typeof parsed.generatedAt === "string"
        ? { text: parsed.text, generatedAt: parsed.generatedAt }
        : undefined;
    } catch {
      return undefined;
    }
  }
}
