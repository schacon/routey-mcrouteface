import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SessionRef } from "@pi-gui/session-driver";
import type {
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
    const decisions: RouterDecisionRecord[] = [];
    try {
      const raw = await readFile(join(this.directory, `${id}.jsonl`), "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          decisions.push(JSON.parse(line) as RouterDecisionRecord);
        } catch {
          // Interrupted append: skip the partial line.
        }
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const purpose = await this.readPurpose(id);
    return purpose ? { decisions, purpose } : { decisions };
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
