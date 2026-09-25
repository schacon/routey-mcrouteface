import { basename } from "node:path";
import {
  DIFFICULTY_BANDS,
  TASK_KINDS,
  type DifficultyBand,
  type RosterModelUse,
  type RouteUse,
} from "../../contracts/router";
import type {
  ModelCapability,
  ModelTier,
  RosterModel,
  RouteDecision,
  RouteMode,
  RouterConfig,
  RouterSignals,
  RouteThinkingLevel,
  TaskKind,
} from "../../contracts/router";

export interface AvailableModel {
  readonly provider: string;
  readonly modelId: string;
  readonly supportsImages: boolean;
}

export interface RouteContext {
  readonly taskKind: TaskKind;
  readonly signals: RouterSignals;
  readonly config: RouterConfig;
  readonly availableModels: readonly AvailableModel[];
  /** The runtime's default model, used when the roster has nothing usable. */
  readonly fallbackModel?: { readonly provider: string; readonly modelId: string };
  readonly hasImages: boolean;
  /** The session's fixed cwd on follow-ups; undefined on a first turn. */
  readonly sessionCwd?: string;
  /** Laya's project pick on a first turn, when it asked. */
  readonly chosenProject?: string;
}

/** Difficulty bands on Laya's compressed 0-4 scale; observed answers sit near 1.3-2.0. */
function difficultyBand(difficulty: number): DifficultyBand {
  if (difficulty < 1.5) return "easy";
  if (difficulty < 1.8) return "moderate";
  return "hard";
}

const TIER_FALLBACKS: Record<ModelTier, readonly ModelTier[]> = {
  local: ["local", "hosted", "frontier"],
  hosted: ["hosted", "frontier", "local"],
  frontier: ["frontier", "hosted", "local"],
};

function preferredTier(kind: TaskKind, band: DifficultyBand): ModelTier {
  if (band === "hard") return "frontier";
  // Easy work stays on this Mac when a local model is tagged for it (a local
  // coder for SQL and one-liners, a general model for quick facts).
  if (band === "easy") return "local";
  return kind === "coding" || kind === "research" ? "frontier" : "hosted";
}

function thinkingFor(kind: TaskKind, band: DifficultyBand): RouteThinkingLevel {
  if (band === "hard") return "high";
  if (band === "moderate") return "medium";
  return kind === "general" || kind === "app" ? "off" : "low";
}

function modeFor(kind: TaskKind, readOnly: number): RouteMode {
  if (kind === "coding") return readOnly >= 0.7 ? "plan" : "execute";
  // Research may read and search but not write; the rest need no tools.
  if (kind === "research") return "plan";
  return "answer";
}

function capabilityFor(kind: TaskKind): ModelCapability {
  return kind;
}

function isAvailable(model: RosterModel, available: readonly AvailableModel[]): boolean {
  return available.some(
    (candidate) => candidate.provider === model.provider && candidate.modelId === model.modelId,
  );
}

function supportsImages(model: RosterModel, available: readonly AvailableModel[]): boolean {
  return (
    model.capabilities.includes("vision") ||
    available.some(
      (candidate) =>
        candidate.provider === model.provider &&
        candidate.modelId === model.modelId &&
        candidate.supportsImages,
    )
  );
}

/**
 * The roster model for a task kind: the first model tagged for it in the
 * preferred tier, else that tier's first model, falling back across tiers.
 */
function pickRosterModel(
  kind: TaskKind,
  wantedTier: ModelTier,
  usable: readonly RosterModel[],
): { readonly model: RosterModel; readonly tier: ModelTier; readonly tagged: boolean } | undefined {
  for (const tier of TIER_FALLBACKS[wantedTier]) {
    const inTier = usable.filter((model) => model.tier === tier);
    const tagged = inTier.find((model) => model.capabilities.includes(capabilityFor(kind)));
    // Local models are small specialists: use one only for what it is tagged for.
    const model = tagged ?? (tier === "local" ? undefined : inTier[0]);
    if (model) return { model, tier, tagged: Boolean(tagged) };
  }
  return undefined;
}

/**
 * Which task kinds and difficulties would route to each usable roster model,
 * by running the same selection as resolveRouteDecision over every
 * combination. Powers the Info panel's "what Routey uses it for" text.
 */
export function rosterModelUses(
  config: RouterConfig,
  availableModels: readonly AvailableModel[],
): RosterModelUse[] {
  const usable = config.roster.filter((model) => isAvailable(model, availableModels));
  const uses = new Map(
    usable.map((model) => [
      `${model.provider}/${model.modelId}`,
      {
        provider: model.provider,
        modelId: model.modelId,
        tier: model.tier,
        uses: [] as RouteUse[],
      },
    ]),
  );
  for (const taskKind of TASK_KINDS) {
    for (const difficulty of DIFFICULTY_BANDS) {
      const pick = pickRosterModel(taskKind, preferredTier(taskKind, difficulty), usable);
      if (pick)
        uses
          .get(`${pick.model.provider}/${pick.model.modelId}`)
          ?.uses.push({ taskKind, difficulty });
    }
  }
  return [...uses.values()];
}

export function resolveRouteDecision(context: RouteContext): RouteDecision {
  const { taskKind, signals, config, availableModels } = context;
  const reasons: string[] = [];
  const band = difficultyBand(signals.difficulty);
  const wantedTier = preferredTier(taskKind, band);
  reasons.push(`${taskKind} task, ${band} difficulty: prefer the ${wantedTier} tier`);

  const usable = config.roster.filter(
    (model) =>
      isAvailable(model, availableModels) &&
      (!context.hasImages || supportsImages(model, availableModels)),
  );
  if (context.hasImages) reasons.push("images attached: only vision-capable models");

  const pick = pickRosterModel(taskKind, wantedTier, usable);
  const chosen = pick?.model;
  const chosenTier = pick?.tier ?? wantedTier;
  if (pick && pick.tier !== wantedTier) {
    reasons.push(`no usable ${wantedTier} model; fell back to ${pick.tier}`);
  }
  if (pick && !pick.tagged) {
    reasons.push(`no ${pick.tier} model is tagged for ${taskKind}; using the first one`);
  }

  let provider: string;
  let modelId: string;
  if (chosen) {
    provider = chosen.provider;
    modelId = chosen.modelId;
    reasons.push(
      chosen.goodAt
        ? `${modelId}: ${chosen.goodAt}`
        : `${modelId} is first in the ${chosenTier} tier`,
    );
  } else if (context.fallbackModel) {
    provider = context.fallbackModel.provider;
    modelId = context.fallbackModel.modelId;
    reasons.push("no roster model is usable; using the default model");
  } else {
    const first = availableModels[0];
    if (!first) throw new Error("No models are available. Connect a provider in Settings.");
    provider = first.provider;
    modelId = first.modelId;
    reasons.push("no roster or default model; using the first available model");
  }

  const mode = modeFor(taskKind, signals.readOnly);
  reasons.push(
    mode === "plan"
      ? "read-only: plan or explain without changing files"
      : mode === "answer"
        ? "answer directly without tools"
        : "may edit files and run commands",
  );

  return {
    taskKind,
    tier: chosen ? chosenTier : wantedTier,
    provider,
    modelId,
    thinkingLevel: thinkingFor(taskKind, band),
    mode,
    cwd: resolveCwd(context, reasons),
    reasons,
  };
}

function resolveCwd(context: RouteContext, reasons: string[]): string {
  if (context.sessionCwd) return context.sessionCwd;
  const { signals } = context;
  if (signals.mentionedProject) {
    reasons.push(`works in ${basename(signals.mentionedProject)}, which the request names`);
    return signals.mentionedProject;
  }
  if (context.chosenProject) {
    reasons.push(`works in ${basename(context.chosenProject)}, Laya's best project match`);
    return context.chosenProject;
  }
  reasons.push("no project needed or named: works in the scratch directory");
  return context.config.scratchDirectory;
}
