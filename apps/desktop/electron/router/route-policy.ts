import { basename } from "node:path";
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
function difficultyBand(difficulty: number): "easy" | "moderate" | "hard" {
  if (difficulty < 1.5) return "easy";
  if (difficulty < 1.8) return "moderate";
  return "hard";
}

const TIER_FALLBACKS: Record<ModelTier, readonly ModelTier[]> = {
  local: ["local", "hosted", "frontier"],
  hosted: ["hosted", "frontier", "local"],
  frontier: ["frontier", "hosted", "local"],
};

function preferredTier(kind: TaskKind, band: ReturnType<typeof difficultyBand>): ModelTier {
  if (band === "hard") return "frontier";
  if (kind === "coding" || kind === "research") return band === "moderate" ? "frontier" : "hosted";
  // Settings questions, chat and writing stay local unless they look hard.
  return band === "moderate" ? "hosted" : "local";
}

function thinkingFor(kind: TaskKind, band: ReturnType<typeof difficultyBand>): RouteThinkingLevel {
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

  let chosen: RosterModel | undefined;
  let chosenTier: ModelTier = wantedTier;
  for (const tier of TIER_FALLBACKS[wantedTier]) {
    const inTier = usable.filter((model) => model.tier === tier);
    const capable = inTier.find((model) => model.capabilities.includes(capabilityFor(taskKind)));
    chosen = capable ?? inTier[0];
    if (chosen) {
      chosenTier = tier;
      if (tier !== wantedTier) reasons.push(`no usable ${wantedTier} model; fell back to ${tier}`);
      if (!capable) reasons.push(`no ${tier} model is tagged for ${taskKind}; using the first one`);
      break;
    }
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
