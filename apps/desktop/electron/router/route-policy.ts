import { basename } from "node:path";
import {
  DIFFICULTY_BANDS,
  TASK_KINDS,
  routeCellKey,
  type DifficultyBand,
  type ModelRef,
  type RosterModelUse,
  type RouteMatrixCell,
  type RouteUse,
} from "../../contracts/router";
import type { SpecialtyKind } from "../../contracts/specialties";
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
  /** A narrow task (image, audio) that a specialty tool runs this turn. */
  readonly specialty?: SpecialtyKind;
}

/** Difficulty bands on Laya's compressed 0-4 scale; observed answers sit near 1.3-2.0. */
export function difficultyBand(difficulty: number): DifficultyBand {
  if (difficulty < 1.5) return "easy";
  if (difficulty < 1.8) return "moderate";
  return "hard";
}

const TIER_FALLBACKS: Record<ModelTier, readonly ModelTier[]> = {
  local: ["local", "hosted", "frontier"],
  hosted: ["hosted", "frontier", "local"],
  frontier: ["frontier", "hosted", "local"],
};

export function preferredTier(kind: TaskKind, band: DifficultyBand): ModelTier {
  if (band === "hard") return "frontier";
  // Easy work stays on this Mac when a local model is tagged for it (a local
  // coder for SQL and one-liners, a general model for quick facts).
  if (band === "easy") return "local";
  return kind === "coding" || kind === "research" ? "frontier" : "hosted";
}

export function thinkingFor(kind: TaskKind, band: DifficultyBand): RouteThinkingLevel {
  if (band === "hard") return "high";
  if (band === "moderate") return "medium";
  return kind === "general" || kind === "app" ? "off" : "low";
}

export function modeFor(kind: TaskKind, readOnly: number): RouteMode {
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

interface RosterPick {
  readonly model: RosterModel;
  readonly tier: ModelTier;
  readonly tagged: boolean;
  readonly pinned: boolean;
}

function sameModel(left: ModelRef, right: ModelRef): boolean {
  return left.provider === right.provider && left.modelId === right.modelId;
}

/**
 * The roster model for a matrix cell: the model the cell is pinned to when it
 * is usable, else the first model tagged for the task in the preferred tier,
 * else that tier's first model, falling back across tiers.
 */
function pickForCell(
  kind: TaskKind,
  band: DifficultyBand,
  usable: readonly RosterModel[],
  config: RouterConfig,
): RosterPick | undefined {
  const pinnedRef = config.routes?.[routeCellKey(kind, band)];
  const pinned = pinnedRef && usable.find((model) => sameModel(model, pinnedRef));
  if (pinned) return { model: pinned, tier: pinned.tier, tagged: true, pinned: true };
  for (const tier of TIER_FALLBACKS[preferredTier(kind, band)]) {
    const inTier = usable.filter((model) => model.tier === tier);
    const tagged = inTier.find((model) => model.capabilities.includes(capabilityFor(kind)));
    // Local models are small specialists: use one only for what it is tagged for.
    const model = tagged ?? (tier === "local" ? undefined : inTier[0]);
    if (model) return { model, tier, tagged: Boolean(tagged), pinned: false };
  }
  return undefined;
}

function usableModels(
  config: RouterConfig,
  availableModels: readonly AvailableModel[],
): RosterModel[] {
  return config.roster.filter((model) => isAvailable(model, availableModels));
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
  const usable = usableModels(config, availableModels);
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
      const pick = pickForCell(taskKind, difficulty, usable, config);
      if (pick)
        uses
          .get(`${pick.model.provider}/${pick.model.modelId}`)
          ?.uses.push({ taskKind, difficulty });
    }
  }
  return [...uses.values()];
}

/** Every task kind at every difficulty, as the router would resolve it now. */
export function routeMatrix(
  config: RouterConfig,
  availableModels: readonly AvailableModel[],
): RouteMatrixCell[] {
  const usable = usableModels(config, availableModels);
  return TASK_KINDS.flatMap((taskKind) =>
    DIFFICULTY_BANDS.map((difficulty) => {
      const key = routeCellKey(taskKind, difficulty);
      const pick = pickForCell(taskKind, difficulty, usable, config);
      const pinnedRef = config.routes?.[key];
      return {
        key,
        taskKind,
        difficulty,
        preferredTier: preferredTier(taskKind, difficulty),
        thinkingLevel: thinkingFor(taskKind, difficulty),
        mode: modeFor(taskKind, 0),
        ...(pick
          ? {
              pick: {
                provider: pick.model.provider,
                modelId: pick.model.modelId,
                tier: pick.tier,
              },
            }
          : {}),
        pinned: Boolean(pick?.pinned),
        ...(pinnedRef && !pick?.pinned ? { pinnedUnavailable: pinnedRef } : {}),
      };
    }),
  );
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

  const pick = pickForCell(taskKind, band, usable, config);
  const chosen = pick?.model;
  const chosenTier = pick?.tier ?? wantedTier;
  if (pick?.pinned) {
    reasons.push(`the routing matrix pins ${taskKind}/${band} to ${pick.model.modelId}`);
  } else if (config.routes?.[routeCellKey(taskKind, band)]) {
    reasons.push(`the model pinned for ${taskKind}/${band} is not usable; using roster order`);
  }
  if (pick && !pick.pinned && pick.tier !== wantedTier) {
    reasons.push(`no usable ${wantedTier} model; fell back to ${pick.tier}`);
  }
  if (pick && !pick.pinned && !pick.tagged) {
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
    context.specialty
      ? `${context.specialty.replace("-", " ")}: runs through Routey's ${context.specialty} tool`
      : mode === "plan"
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
    ...(context.specialty ? { specialty: context.specialty } : {}),
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
