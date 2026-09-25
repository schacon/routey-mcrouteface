import type { ModelCapability } from "./router";

/**
 * What small local models are good at, from model cards, public benchmarks and
 * Routey's own routing eval (September 2026). The router uses it to tag local
 * models it seeds into the roster; onboarding uses it to recommend downloads.
 * See docs/local-model-matrix.md for sources and the full matrix.
 */

export type LocalStrength =
  | "code"
  | "coding-agent"
  | "sql"
  | "shell"
  | "quick-facts"
  | "long-text"
  | "writing"
  | "reasoning"
  | "routing"
  | "vision"
  | "multilingual";

export interface LocalModelProfile {
  /** Ollama tag to pull. */
  readonly tag: string;
  /** Other tags of the same weights (quantizations, context caps). */
  readonly aliases: readonly string[];
  readonly name: string;
  readonly sizeGb: number;
  readonly thinking: "off" | "toggle" | "always";
  readonly speed: "fast" | "medium" | "slow";
  readonly strengths: readonly LocalStrength[];
  /** Roster tags when this model is seeded into the local tier. */
  readonly capabilities: readonly ModelCapability[];
  /** One line on what Routey uses it for. */
  readonly summary: string;
  /** Offered, pre-checked, in onboarding. */
  readonly recommended: boolean;
  /** Smallest Mac memory it runs comfortably in, in GB. */
  readonly minMemoryGb: number;
}

export const LOCAL_MODEL_CATALOG: readonly LocalModelProfile[] = [
  {
    tag: "gemma4:e4b-it-qat",
    aliases: ["gemma4:e4b"],
    name: "Gemma 4 E4B (QAT)",
    sizeGb: 6.1,
    thinking: "off",
    speed: "fast",
    strengths: ["routing", "quick-facts", "vision", "multilingual"],
    capabilities: ["general", "app", "vision"],
    summary:
      "Classifies every prompt for routing (best on Routey's eval) and answers quick questions.",
    recommended: true,
    minMemoryGb: 16,
  },
  {
    tag: "qwen3.5:9b",
    aliases: ["qwen3.5:9b-cap8k"],
    name: "Qwen3.5 9B",
    sizeGb: 6.6,
    thinking: "toggle",
    speed: "fast",
    strengths: ["quick-facts", "long-text", "vision", "multilingual", "routing"],
    capabilities: ["general", "writing", "research", "app", "vision", "long-context"],
    summary: "Best all-rounder under 10B: quick facts, questions over long pasted text, images.",
    recommended: true,
    minMemoryGb: 16,
  },
  {
    tag: "qwen3-coder:30b",
    aliases: [],
    name: "Qwen3-Coder 30B-A3B",
    sizeGb: 18,
    thinking: "off",
    speed: "fast",
    strengths: ["code", "sql", "shell"],
    capabilities: ["coding"],
    summary:
      "Code, SQL and shell one-liners; non-thinking with 3B active parameters, so it answers fast.",
    recommended: true,
    minMemoryGb: 32,
  },
  {
    tag: "gemma4:12b-it-qat",
    aliases: ["gemma4:12b"],
    name: "Gemma 4 12B (QAT)",
    sizeGb: 7.2,
    thinking: "off",
    speed: "medium",
    strengths: ["writing", "long-text", "vision", "multilingual"],
    capabilities: ["writing", "general", "long-context", "vision"],
    summary: "Writing and rewriting prose, and reading long documents.",
    recommended: true,
    minMemoryGb: 16,
  },
  {
    tag: "qwen3.5:4b",
    aliases: ["qwen3.5:4b-cap8k"],
    name: "Qwen3.5 4B",
    sizeGb: 3.4,
    thinking: "toggle",
    speed: "fast",
    strengths: ["routing", "quick-facts", "vision"],
    capabilities: ["general", "app", "vision"],
    summary: "Small and fast; a prompt classifier for Macs with less memory.",
    recommended: false,
    minMemoryGb: 8,
  },
  {
    tag: "qwen3.6:35b",
    aliases: [],
    name: "Qwen3.6 35B-A3B",
    sizeGb: 23,
    thinking: "toggle",
    speed: "fast",
    strengths: ["coding-agent", "code", "long-text", "vision"],
    capabilities: ["coding", "general", "long-context", "vision"],
    summary: "Local multi-step coding agent (SWE-bench Verified 73%).",
    recommended: false,
    minMemoryGb: 48,
  },
  {
    tag: "glm-4.7-flash",
    aliases: ["glm-4.7-flash:latest"],
    name: "GLM-4.7-Flash 30B-A3B",
    sizeGb: 19,
    thinking: "toggle",
    speed: "fast",
    strengths: ["coding-agent", "code", "reasoning"],
    capabilities: ["coding", "general"],
    summary: "Agentic tool use and coding with strong math; text only.",
    recommended: false,
    minMemoryGb: 32,
  },
  {
    tag: "gpt-oss:20b",
    aliases: [],
    name: "gpt-oss 20B",
    sizeGb: 13,
    thinking: "always",
    speed: "medium",
    strengths: ["reasoning", "quick-facts"],
    capabilities: ["general", "research"],
    summary: "Reasoning and math; always thinks, so it is slower to answer.",
    recommended: false,
    minMemoryGb: 24,
  },
  {
    tag: "gpt-oss:120b",
    aliases: [],
    name: "gpt-oss 120B",
    sizeGb: 65,
    thinking: "always",
    speed: "medium",
    strengths: ["reasoning", "code", "quick-facts"],
    capabilities: ["general", "research", "coding"],
    summary: "Strongest local reasoning; needs a 96 GB+ Mac and always thinks.",
    recommended: false,
    minMemoryGb: 96,
  },
  {
    tag: "qwen3.8:27b",
    aliases: [],
    name: "Qwen3.8 27B",
    sizeGb: 29,
    thinking: "toggle",
    speed: "slow",
    strengths: ["reasoning", "coding-agent", "long-text", "vision"],
    capabilities: ["coding", "general", "long-context", "vision"],
    summary: "Strongest dense model that fits a laptop; slow, so kept for hard local work.",
    recommended: false,
    minMemoryGb: 48,
  },
  {
    tag: "devstral-small-2",
    aliases: [],
    name: "Devstral Small 2 24B",
    sizeGb: 15,
    thinking: "off",
    speed: "slow",
    strengths: ["coding-agent", "code"],
    capabilities: ["coding"],
    summary: "Multi-file agentic editing (SWE-bench Verified 68%); dense, so slower.",
    recommended: false,
    minMemoryGb: 32,
  },
];

/** The catalog entry for an installed tag, matching variants like `qwen3.8:27b-max`. */
export function localModelProfile(tag: string): LocalModelProfile | undefined {
  return LOCAL_MODEL_CATALOG.find(
    (profile) =>
      profile.tag === tag || profile.aliases.includes(tag) || tag.startsWith(`${profile.tag}-`),
  );
}

export type LocalModelPull =
  | { readonly state: "queued" }
  | {
      readonly state: "pulling";
      readonly status: string;
      readonly completed?: number;
      readonly total?: number;
    }
  | { readonly state: "done" }
  | { readonly state: "failed"; readonly message: string };

export interface LocalModelStatus {
  readonly profile: LocalModelProfile;
  /** The installed tag (the profile's tag or an alias), when Ollama has it. */
  readonly installedTag?: string;
  /** The router's roster already includes it. */
  readonly routed: boolean;
  /** Fits this Mac's memory. */
  readonly fits: boolean;
  readonly pull?: LocalModelPull;
}

export interface LocalModelSetup {
  readonly ollama: "running" | "unreachable";
  readonly ollamaUrl: string;
  readonly memoryGb: number;
  /** True when no local model is in the roster yet, so onboarding should show. */
  readonly needsSetup: boolean;
  readonly models: readonly LocalModelStatus[];
}

export function decodeLocalModelTags(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string" || !tag.trim())) {
    throw new TypeError("tags must be an array of model tags");
  }
  const known = new Set(LOCAL_MODEL_CATALOG.map((profile) => profile.tag));
  const tags = value as string[];
  const unknown = tags.filter((tag) => !known.has(tag));
  if (unknown.length > 0) throw new TypeError(`Unknown local models: ${unknown.join(", ")}`);
  return tags;
}
