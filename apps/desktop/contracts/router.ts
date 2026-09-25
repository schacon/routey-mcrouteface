/**
 * Routey's turn router: every user turn is classified, then run with the model,
 * thinking level, mode and (on a session's first turn) working directory the
 * router picks. These values are browser-safe so the Info and Inspector panels
 * can render them.
 */

export const TASK_KINDS = ["coding", "general", "app", "writing", "research"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const MODEL_TIERS = ["local", "hosted", "frontier"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export const ROUTE_MODES = ["execute", "plan", "answer"] as const;
export type RouteMode = (typeof ROUTE_MODES)[number];

export const ROUTE_THINKING_LEVELS = ["off", "low", "medium", "high"] as const;
export type RouteThinkingLevel = (typeof ROUTE_THINKING_LEVELS)[number];

export const DIFFICULTY_BANDS = ["easy", "moderate", "hard"] as const;
export type DifficultyBand = (typeof DIFFICULTY_BANDS)[number];

/** One task kind and difficulty the router would send to a model. */
export interface RouteUse {
  readonly taskKind: TaskKind;
  readonly difficulty: DifficultyBand;
}

/** A usable roster model and every task kind and difficulty that would route to it. */
export interface RosterModelUse {
  readonly provider: string;
  readonly modelId: string;
  readonly tier: ModelTier;
  readonly uses: readonly RouteUse[];
}

export const MODEL_CAPABILITIES = [
  "coding",
  "general",
  "app",
  "writing",
  "research",
  "vision",
  "long-context",
] as const;
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

/** One model the router may pick, in preference order within its tier. */
export interface RosterModel {
  readonly provider: string;
  readonly modelId: string;
  readonly tier: ModelTier;
  readonly capabilities: readonly ModelCapability[];
  /** Free text: what this model is good at, shown in Settings and to the router's reasons. */
  readonly goodAt: string;
}

export interface RouterConfig {
  readonly version: 1;
  readonly roster: readonly RosterModel[];
  /** Projects the router may pick even when no transcript mentions them. */
  readonly pinnedProjects: readonly string[];
  /** Projects the router never picks. */
  readonly excludedProjects: readonly string[];
  /** Working directory for prompts that need no project. */
  readonly scratchDirectory: string;
  /** Absent means "auto". */
  readonly classifier?: ClassifierChoice;
}

/** One Laya question and its answer, kept for the Inspector. */
export interface RouterQuestionAnswer {
  readonly key: string;
  readonly type: "choice" | "score" | "noul";
  readonly instructions: string;
  readonly labels: readonly string[];
  readonly probabilities: readonly number[];
  readonly selected: string;
}

/** A keyword or context cue that raised a signal beyond what Laya answered. */
export interface RouterCue {
  readonly signal: string;
  readonly reason: string;
}

export interface RouterSignals {
  readonly kindScores: Readonly<Record<TaskKind, number>>;
  /** Expected difficulty level, 0 (trivial) to 4 (very hard). */
  readonly difficulty: number;
  readonly readOnly: number;
  readonly needsProject: number;
  readonly multiModel: number;
  /** A known project the prompt names, if any. */
  readonly mentionedProject?: string;
}

export type RouterSource =
  | { readonly kind: "model"; readonly model: string; readonly latencyMs: number }
  | { readonly kind: "laya"; readonly latencyMs: number }
  | { readonly kind: "heuristic"; readonly reason: string };

/**
 * What classifies each prompt. "auto" uses the best local model from the
 * ranked list that is installed, then Laya, then keyword cues.
 */
export type ClassifierChoice =
  | { readonly kind: "auto" }
  | { readonly kind: "ollama"; readonly model: string }
  | { readonly kind: "laya" }
  | { readonly kind: "keywords" };

export interface ClassifierOption {
  readonly choice: ClassifierChoice;
  readonly label: string;
  readonly description: string;
  readonly available: boolean;
}

export interface ClassifierState {
  readonly selected: ClassifierChoice;
  /** What "auto" (or the selection) resolves to right now. */
  readonly active: ClassifierChoice;
  readonly options: readonly ClassifierOption[];
}

export interface RouteDecision {
  readonly taskKind: TaskKind;
  readonly tier: ModelTier;
  readonly provider: string;
  readonly modelId: string;
  readonly thinkingLevel: RouteThinkingLevel;
  readonly mode: RouteMode;
  readonly cwd: string;
  readonly reasons: readonly string[];
}

export interface RouterDecisionRecord {
  readonly id: string;
  readonly timestamp: string;
  /** First 200 characters of the prompt. */
  readonly promptExcerpt: string;
  readonly firstTurn: boolean;
  readonly source: RouterSource;
  readonly signals: RouterSignals;
  readonly answers: readonly RouterQuestionAnswer[];
  readonly cues: readonly RouterCue[];
  readonly decision: RouteDecision;
  /** Why the selected classifier did not answer (it failed and another stood in). */
  readonly classifierNote?: string;
  /** Set when a follow-up seems to target a different project than the session's. */
  readonly suggestedProject?: string;
}

export interface SessionPurpose {
  readonly text: string;
  readonly generatedAt: string;
}

export interface RouterSessionInfo {
  readonly decisions: readonly RouterDecisionRecord[];
  readonly purpose?: SessionPurpose;
}

export type LayaStatus =
  | { readonly state: "stopped" }
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly lengths: readonly number[] }
  | { readonly state: "unavailable"; readonly message: string };

export interface DiscoveredProject {
  readonly path: string;
  readonly name: string;
  readonly lastUsedAt: string;
  readonly sources: readonly ("claude" | "codex" | "pi" | "cursor" | "routey")[];
}

export interface RouterOverview {
  readonly laya: LayaStatus;
  readonly config: RouterConfig;
  readonly projects: readonly DiscoveredProject[];
  readonly classifier: ClassifierState;
  /** Usable roster models and what the router would send to each. */
  readonly modelUses: readonly RosterModelUse[];
  /** Models the runtime can use right now, for the roster editor. */
  readonly availableModels: readonly {
    readonly provider: string;
    readonly modelId: string;
    readonly label: string;
    readonly supportsImages: boolean;
  }[];
}

export interface StartRoutedSessionInput {
  readonly prompt: string;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

function expectStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`${label} must be an array of strings`);
  }
  return value as readonly string[];
}

function expectOneOf<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new TypeError(`${label} must be one of ${options.join(", ")}`);
  }
  return value as T;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unknown.length > 0)
    throw new TypeError(`${label} has unsupported fields: ${unknown.join(", ")}`);
}

export function decodeRosterModel(value: unknown, label = "model"): RosterModel {
  const record = expectRecord(value, label);
  rejectUnknownKeys(record, ["provider", "modelId", "tier", "capabilities", "goodAt"], label);
  const capabilities = expectStringArray(record.capabilities, `${label}.capabilities`).map(
    (capability, index) =>
      expectOneOf(capability, MODEL_CAPABILITIES, `${label}.capabilities[${index}]`),
  );
  const provider = expectString(record.provider, `${label}.provider`).trim();
  const modelId = expectString(record.modelId, `${label}.modelId`).trim();
  if (!provider || !modelId) throw new TypeError(`${label} needs a provider and model id`);
  return {
    provider,
    modelId,
    tier: expectOneOf(record.tier, MODEL_TIERS, `${label}.tier`),
    capabilities,
    goodAt: expectString(record.goodAt, `${label}.goodAt`),
  };
}

/** Strict decoder: unknown fields and versions are errors, never silently dropped. */
export function decodeRouterConfig(value: unknown): RouterConfig {
  const record = expectRecord(value, "routerConfig");
  rejectUnknownKeys(
    record,
    ["version", "roster", "pinnedProjects", "excludedProjects", "scratchDirectory", "classifier"],
    "routerConfig",
  );
  if (record.version !== 1) throw new TypeError("routerConfig.version must be 1");
  if (!Array.isArray(record.roster)) throw new TypeError("routerConfig.roster must be an array");
  const scratchDirectory = expectString(record.scratchDirectory, "routerConfig.scratchDirectory");
  if (!scratchDirectory.trim()) throw new TypeError("routerConfig.scratchDirectory is empty");
  return {
    version: 1,
    roster: record.roster.map((entry, index) => decodeRosterModel(entry, `roster[${index}]`)),
    pinnedProjects: expectStringArray(record.pinnedProjects, "routerConfig.pinnedProjects"),
    excludedProjects: expectStringArray(record.excludedProjects, "routerConfig.excludedProjects"),
    scratchDirectory,
    ...(record.classifier === undefined
      ? {}
      : { classifier: decodeClassifierChoice(record.classifier) }),
  };
}

export function decodeClassifierChoice(value: unknown): ClassifierChoice {
  const record = expectRecord(value, "classifier");
  switch (record.kind) {
    case "auto":
    case "laya":
    case "keywords":
      rejectUnknownKeys(record, ["kind"], "classifier");
      return { kind: record.kind };
    case "ollama": {
      rejectUnknownKeys(record, ["kind", "model"], "classifier");
      const model = expectString(record.model, "classifier.model").trim();
      if (!model) throw new TypeError("classifier.model is empty");
      return { kind: "ollama", model };
    }
    default:
      throw new TypeError("classifier.kind must be auto, ollama, laya or keywords");
  }
}

export function sameClassifier(left: ClassifierChoice, right: ClassifierChoice): boolean {
  return (
    left.kind === right.kind &&
    (left.kind !== "ollama" || (right.kind === "ollama" && left.model === right.model))
  );
}

export function decodeStartRoutedSessionInput(value: unknown): StartRoutedSessionInput {
  const record = expectRecord(value, "input");
  return { prompt: expectString(record.prompt, "input.prompt") };
}
