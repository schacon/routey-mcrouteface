import { LOCAL_MODEL_CATALOG } from "./local-models";
import type { DifficultyBand, ModelRef, ModelTier, TaskKind } from "./router";

/**
 * Strong models to suggest for each routing-matrix cell, from
 * docs/research/routing-model-matrix-2026.md (September 2026). Each lists every way
 * pi can reach it, a direct provider first and OpenRouter last, so a user
 * signed in to either can add it.
 */
export interface SuggestedModel {
  readonly name: string;
  /** The roster tier it joins when added. */
  readonly tier: ModelTier;
  readonly kinds: readonly TaskKind[];
  readonly bands: readonly DifficultyBand[];
  readonly refs: readonly ModelRef[];
  readonly note: string;
  /** Dollars per 1M input/output tokens on OpenRouter. */
  readonly price?: string;
  /** Ollama tag, for local suggestions pulled through the local-model guide. */
  readonly ollamaTag?: string;
}

const ALL_KINDS: readonly TaskKind[] = ["coding", "general", "app", "writing", "research"];

function openRouter(modelId: string): ModelRef {
  return { provider: "openrouter", modelId };
}

const REMOTE_SUGGESTIONS: readonly SuggestedModel[] = [
  {
    name: "Claude Opus 5.5",
    tier: "frontier",
    kinds: ALL_KINDS,
    bands: ["moderate", "hard"],
    refs: [
      { provider: "anthropic", modelId: "claude-opus-5-5" },
      openRouter("anthropic/claude-opus-5.5"),
    ],
    note: "#1 on the Artificial Analysis index (58); verbose, about 119k tokens per task.",
    price: "$4 / $20",
  },
  {
    name: "GPT-6 Astra",
    tier: "frontier",
    kinds: ["coding", "research", "general"],
    bands: ["hard"],
    refs: [{ provider: "openai", modelId: "gpt-6-astra" }, openRouter("openai/gpt-6-astra")],
    note: "Index 53 at about 27k tokens per task: the most token-efficient frontier model.",
    price: "$10 / $50",
  },
  {
    name: "Claude Fable 5.1",
    tier: "frontier",
    kinds: ["coding"],
    bands: ["hard"],
    refs: [
      { provider: "anthropic", modelId: "claude-fable-5-1" },
      openRouter("anthropic/claude-fable-5.1"),
    ],
    note: "Built for long autonomous coding runs; Coding Agent Index 62.",
    price: "$10 / $50",
  },
  {
    name: "Claude Sonnet 5",
    tier: "hosted",
    kinds: ["coding", "writing", "general", "research", "app"],
    bands: ["moderate", "hard"],
    refs: [
      { provider: "anthropic", modelId: "claude-sonnet-5" },
      openRouter("anthropic/claude-sonnet-5"),
    ],
    note: "The workhorse for most coding, writing and analysis.",
    price: "$2 / $10",
  },
  {
    name: "GPT-6 Sol",
    tier: "hosted",
    kinds: ["coding", "general", "research", "writing"],
    bands: ["moderate"],
    refs: [{ provider: "openai", modelId: "gpt-6-sol" }, openRouter("openai/gpt-6-sol")],
    note: "Mid-tier GPT-6; about half the factual errors of GPT-5.6.",
    price: "$2 / $10",
  },
  {
    name: "Kimi K3",
    tier: "hosted",
    kinds: ["writing", "coding"],
    bands: ["moderate", "hard"],
    refs: [openRouter("moonshotai/kimi-k3")],
    note: "Open weights; #2 on the EQ-Bench creative writing board.",
    price: "$3 / $15",
  },
  {
    name: "GLM-5.3",
    tier: "hosted",
    kinds: ["coding"],
    bands: ["moderate"],
    refs: [openRouter("z-ai/glm-5.3")],
    note: "Top open-weight model on the Artificial Analysis index (45); very cheap.",
    price: "$0.38 / $1.19",
  },
  {
    name: "Gemini 3.8 Flash",
    tier: "hosted",
    kinds: ["general", "research", "app"],
    bands: ["easy", "moderate"],
    refs: [
      { provider: "google", modelId: "gemini-3.8-flash" },
      openRouter("google/gemini-3.8-flash"),
    ],
    note: "Fast and multimodal (audio, video, files); beats Opus 5 on some benchmarks.",
    price: "$0.75 / $3.75",
  },
  {
    name: "Grok 4.7",
    tier: "hosted",
    kinds: ["research", "general"],
    bands: ["moderate"],
    refs: [{ provider: "xai", modelId: "grok-4.7" }, openRouter("x-ai/grok-4.7")],
    note: "Index 46 with a 500k context.",
    price: "$1.60 / $4.80",
  },
  {
    name: "GPT-6 Luna",
    tier: "hosted",
    kinds: ["general", "app", "writing", "research"],
    bands: ["easy", "moderate"],
    refs: [{ provider: "openai", modelId: "gpt-6-luna" }, openRouter("openai/gpt-6-luna")],
    note: "The cheap, fast tier with a 1M context.",
    price: "$0.10 / $0.50",
  },
  {
    name: "DeepSeek V4.1 Flash",
    tier: "hosted",
    kinds: ["coding"],
    bands: ["easy", "moderate"],
    refs: [openRouter("deepseek/deepseek-v4.1-flash")],
    note: "Cheap code generation and shell one-liners.",
    price: "$0.30 / $1.20",
  },
  {
    name: "Gemini 3.5 Flash-Lite",
    tier: "hosted",
    kinds: ["general", "app"],
    bands: ["easy"],
    refs: [
      { provider: "google", modelId: "gemini-3.5-flash-lite" },
      openRouter("google/gemini-3.5-flash-lite"),
    ],
    note: "Cheap multimodal answers.",
    price: "$0.30 / $2.50",
  },
];

/** Local catalog models, suggested for the easy cells their tags cover. */
const LOCAL_SUGGESTIONS: readonly SuggestedModel[] = LOCAL_MODEL_CATALOG.map((profile) => ({
  name: profile.name,
  tier: "local",
  kinds: ALL_KINDS.filter((kind) => profile.capabilities.includes(kind)),
  bands: ["easy"],
  refs: [{ provider: "ollama", modelId: profile.tag }],
  note: `${profile.summary} ${profile.sizeGb} GB.`,
  ollamaTag: profile.tag,
}));

export const MODEL_SUGGESTIONS: readonly SuggestedModel[] = [
  ...LOCAL_SUGGESTIONS,
  ...REMOTE_SUGGESTIONS,
];

export function suggestionsFor(kind: TaskKind, band: DifficultyBand): readonly SuggestedModel[] {
  return MODEL_SUGGESTIONS.filter(
    (suggestion) => suggestion.kinds.includes(kind) && suggestion.bands.includes(band),
  );
}
