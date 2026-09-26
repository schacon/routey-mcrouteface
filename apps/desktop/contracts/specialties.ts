/**
 * Narrow, non-chat tasks (media, retrieval) and the engines that can run
 * them, local and hosted. Picks come from docs/research/routing-model-matrix-2026.md
 * (September 2026). Runnable specialties are exposed to the agent as tools; the
 * rest are recommendations until Routey can run them.
 */

export const SPECIALTY_KINDS = [
  "image-generation",
  "image-editing",
  "vision",
  "transcription",
  "speech",
  "embeddings",
  "reranking",
  "video-understanding",
  "video-generation",
  "music",
] as const;
export type SpecialtyKind = (typeof SPECIALTY_KINDS)[number];

/** Specialties that run as agent tools when an engine is set up. */
export const RUNNABLE_SPECIALTIES = [
  "image-generation",
  "image-editing",
  "transcription",
  "speech",
] as const satisfies readonly SpecialtyKind[];
export type RunnableSpecialty = (typeof RUNNABLE_SPECIALTIES)[number];

export function isRunnableSpecialty(kind: SpecialtyKind): kind is RunnableSpecialty {
  return (RUNNABLE_SPECIALTIES as readonly string[]).includes(kind);
}

/**
 * How an engine runs.
 * - openrouter: a hosted model through the OpenRouter provider pi signs in to.
 * - mflux / mlx-audio: local MLX command-line tools.
 * - macos-say: the speech synthesizer every Mac has.
 * - roster: a chat model (vision runs on whichever vision model the router picks).
 * - info: not runnable by Routey yet; shown as a recommendation.
 */
export const SPECIALTY_RUNTIMES = [
  "openrouter",
  "mflux",
  "mlx-audio",
  "macos-say",
  "roster",
  "info",
] as const;
export type SpecialtyRuntime = (typeof SPECIALTY_RUNTIMES)[number];

/** The engine picked for a specialty, saved in router-config.json. */
export interface SpecialtyEngineRef {
  readonly runtime: SpecialtyRuntime;
  readonly modelId: string;
}

export interface SpecialtyEngine extends SpecialtyEngineRef {
  readonly name: string;
  readonly where: "local" | "hosted";
  readonly note: string;
  /** Shell command that installs the local tool, when one is needed. */
  readonly install?: string;
  /** Ollama tag that provides this engine (vision and OCR models). */
  readonly ollamaTag?: string;
}

export interface SpecialtyProfile {
  readonly kind: SpecialtyKind;
  readonly label: string;
  readonly description: string;
  /** Engines in preference order; the first usable one is the default. */
  readonly engines: readonly SpecialtyEngine[];
}

const MFLUX_INSTALL = "uv tool install --upgrade mflux";
const MLX_AUDIO_INSTALL = "uv tool install --upgrade mlx-audio";

export const SPECIALTY_CATALOG: readonly SpecialtyProfile[] = [
  {
    kind: "image-generation",
    label: "Image generation",
    description: "Make a picture, logo, icon or illustration from a description.",
    engines: [
      {
        runtime: "openrouter",
        modelId: "openai/gpt-image-2",
        name: "GPT Image 2",
        where: "hosted",
        note: "Best value near the top of the arena; about $0.05 per 1K image at medium quality.",
      },
      {
        runtime: "openrouter",
        modelId: "openai/gpt-image-2.5-sunburst",
        name: "GPT Image 2.5 Sunburst",
        where: "hosted",
        note: "#1 on the LMArena text-to-image board (Sep 2026).",
      },
      {
        runtime: "openrouter",
        modelId: "black-forest-labs/flux.2-klein-4b",
        name: "FLUX.2 klein 4B",
        where: "hosted",
        note: "Cheapest good option, about $0.014 per megapixel.",
      },
      {
        runtime: "openrouter",
        modelId: "google/gemini-3.1-flash-image",
        name: "Gemini 3.1 Flash Image",
        where: "hosted",
        note: "Fast; good at text in images.",
      },
      {
        runtime: "mflux",
        modelId: "z-image-turbo",
        name: "Z-Image Turbo (mflux)",
        where: "local",
        note: "Fast, realistic, runs on this Mac through MLX; about 8-13 GB.",
        install: MFLUX_INSTALL,
      },
    ],
  },
  {
    kind: "image-editing",
    label: "Image editing",
    description: "Change an attached image: remove a background, restyle, add or replace things.",
    engines: [
      {
        runtime: "openrouter",
        modelId: "openai/gpt-image-2",
        name: "GPT Image 2",
        where: "hosted",
        note: "Near the top of the image-edit arena at a fraction of Sunburst's price.",
      },
      {
        runtime: "openrouter",
        modelId: "openai/gpt-image-2.5-sunburst",
        name: "GPT Image 2.5 Sunburst",
        where: "hosted",
        note: "#1 on the LMArena image-edit board (Sep 2026).",
      },
      {
        runtime: "openrouter",
        modelId: "google/gemini-3.1-flash-image",
        name: "Gemini 3.1 Flash Image",
        where: "hosted",
        note: "Cheap, quick edits.",
      },
      {
        runtime: "info",
        modelId: "qwen-image-edit-2511",
        name: "Qwen-Image-Edit-2511 (mflux)",
        where: "local",
        note: "Best commercially usable local editor (Apache 2.0); needs 64 GB+.",
        install: MFLUX_INSTALL,
      },
    ],
  },
  {
    kind: "vision",
    label: "Image understanding and OCR",
    description: "Read screenshots, photos and documents attached to a prompt.",
    engines: [
      {
        runtime: "roster",
        modelId: "",
        name: "The routed vision model",
        where: "local",
        note: "Prompts with images go to the first vision-tagged model in the chosen tier.",
      },
      {
        runtime: "info",
        modelId: "glm-ocr",
        name: "GLM-OCR 0.9B",
        where: "local",
        note: "OmniDocBench 95.2; beats 235B general models at document parsing. `ollama pull glm-ocr`.",
        ollamaTag: "glm-ocr",
      },
      {
        runtime: "info",
        modelId: "qwen3-vl:8b",
        name: "Qwen3-VL 8B",
        where: "local",
        note: "General image questions on this Mac.",
        ollamaTag: "qwen3-vl:8b",
      },
      {
        runtime: "info",
        modelId: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro",
        where: "hosted",
        note: "Strongest hosted image and document understanding.",
      },
    ],
  },
  {
    kind: "transcription",
    label: "Speech to text",
    description: "Transcribe a recording, meeting or voice memo.",
    engines: [
      {
        runtime: "mlx-audio",
        modelId: "mlx-community/parakeet-tdt-0.6b-v3",
        name: "Parakeet TDT 0.6B v3 (mlx-audio)",
        where: "local",
        note: "About 110x real time, 2.4% WER; English and 25 European languages.",
        install: MLX_AUDIO_INSTALL,
      },
      {
        runtime: "mlx-audio",
        modelId: "mlx-community/whisper-large-v3-turbo-asr-fp16",
        name: "Whisper large-v3 turbo (mlx-audio)",
        where: "local",
        note: "99 languages; 1.7% WER.",
        install: MLX_AUDIO_INSTALL,
      },
      {
        runtime: "openrouter",
        modelId: "google/gemini-3.8-flash",
        name: "Gemini 3.8 Flash",
        where: "hosted",
        note: "Hears audio directly; good for long or noisy recordings and speaker labels.",
      },
      {
        runtime: "openrouter",
        modelId: "google/gemini-3.1-flash-lite",
        name: "Gemini 3.1 Flash-Lite",
        where: "hosted",
        note: "Cheapest hosted audio input.",
      },
    ],
  },
  {
    kind: "speech",
    label: "Text to speech",
    description: "Read text aloud into an audio file.",
    engines: [
      {
        runtime: "mlx-audio",
        modelId: "mlx-community/Kokoro-82M-bf16",
        name: "Kokoro 82M (mlx-audio)",
        where: "local",
        note: "Natural voice in about 170 MB, faster than real time.",
        install: MLX_AUDIO_INSTALL,
      },
      {
        runtime: "macos-say",
        modelId: "say",
        name: "macOS speech",
        where: "local",
        note: "Built into every Mac; robotic next to Kokoro but always there.",
      },
      {
        runtime: "info",
        modelId: "gemini-3.1-flash-tts",
        name: "Gemini 3.1 Flash TTS",
        where: "hosted",
        note: "Top of the Artificial Analysis TTS arena (Elo 1214).",
      },
    ],
  },
  {
    kind: "embeddings",
    label: "Embeddings",
    description: "Vectors for search over notes, code and documents.",
    engines: [
      {
        runtime: "info",
        modelId: "qwen3-embedding:0.6b",
        name: "Qwen3-Embedding 0.6B",
        where: "local",
        note: "639 MB; MTEB multilingual 64.3, above text-embedding-3-large.",
        ollamaTag: "qwen3-embedding:0.6b",
      },
      {
        runtime: "info",
        modelId: "qwen3-embedding:8b",
        name: "Qwen3-Embedding 8B",
        where: "local",
        note: "Best open embedding model (MTEB multilingual 70.6).",
        ollamaTag: "qwen3-embedding:8b",
      },
      {
        runtime: "info",
        modelId: "google/gemini-embedding-2",
        name: "Gemini Embedding 2",
        where: "hosted",
        note: "Top hosted score, strong on code (MTEB Code 84.0).",
      },
    ],
  },
  {
    kind: "reranking",
    label: "Reranking",
    description: "Reorder search results by relevance.",
    engines: [
      {
        runtime: "info",
        modelId: "Qwen3-Reranker-0.6B",
        name: "Qwen3-Reranker 0.6B",
        where: "local",
        note: "MTEB-R 65.8; needs llama.cpp or MLX (Ollama has no rerank API).",
      },
      {
        runtime: "info",
        modelId: "cohere/rerank-4-pro",
        name: "Cohere Rerank 4 Pro",
        where: "hosted",
        note: "Available through OpenRouter's /rerank endpoint.",
      },
    ],
  },
  {
    kind: "video-understanding",
    label: "Video understanding",
    description: "Answer questions about a video clip.",
    engines: [
      {
        runtime: "info",
        modelId: "google/gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro",
        where: "hosted",
        note: "Watches and hears the clip; the strongest option.",
      },
      {
        runtime: "info",
        modelId: "google/gemini-3.5-flash-lite",
        name: "Gemini 3.5 Flash-Lite",
        where: "hosted",
        note: "Cheap video input.",
      },
    ],
  },
  {
    kind: "video-generation",
    label: "Video generation",
    description: "Make a short clip from a description.",
    engines: [
      {
        runtime: "info",
        modelId: "ltx-2.3",
        name: "LTX-2.3 (mlx-video)",
        where: "local",
        note: "About 19 GB at 4-bit; 32 GB+ Macs only.",
      },
      {
        runtime: "info",
        modelId: "wan-3.0",
        name: "Wan 3.0",
        where: "hosted",
        note: "#1 on the Artificial Analysis video arena without audio.",
      },
      {
        runtime: "info",
        modelId: "gemini-omni-flash",
        name: "Gemini Omni Flash",
        where: "hosted",
        note: "#1 with audio. (OpenAI removed the Sora API on 2026-09-24.)",
      },
    ],
  },
  {
    kind: "music",
    label: "Music",
    description: "Generate music or sound.",
    engines: [
      {
        runtime: "info",
        modelId: "ace-step-1.5",
        name: "ACE-Step 1.5",
        where: "local",
        note: "Open music model with official Mac support.",
      },
      {
        runtime: "info",
        modelId: "google/lyria-3-pro-preview",
        name: "Lyria 3 Pro",
        where: "hosted",
        note: "Music output through OpenRouter.",
      },
    ],
  },
];

export function specialtyProfile(kind: SpecialtyKind): SpecialtyProfile {
  const profile = SPECIALTY_CATALOG.find((entry) => entry.kind === kind);
  if (!profile) throw new Error(`Unknown specialty ${kind}`);
  return profile;
}

/** Whether an engine can be selected to run a specialty (not just recommended). */
export function isRunnableEngine(engine: SpecialtyEngineRef): boolean {
  return engine.runtime !== "info" && engine.runtime !== "roster";
}

/** One specialty's state for the Routing panel. */
export interface SpecialtyStatus {
  readonly kind: SpecialtyKind;
  /** The saved choice, if the user picked one. */
  readonly selected?: SpecialtyEngineRef;
  /** What runs right now: the saved choice when usable, else the first usable engine. */
  readonly active?: SpecialtyEngineRef;
  /** Per engine (same order as the catalog): usable now, or why not. */
  readonly engines: readonly {
    readonly engine: SpecialtyEngineRef;
    readonly usable: boolean;
    readonly reason?: string;
  }[];
}

export function sameEngine(left: SpecialtyEngineRef, right: SpecialtyEngineRef): boolean {
  return left.runtime === right.runtime && left.modelId === right.modelId;
}
