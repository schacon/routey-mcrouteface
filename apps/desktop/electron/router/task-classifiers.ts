import { basename } from "node:path";
import {
  TASK_KINDS,
  type ClassifierChoice,
  type RouterQuestionAnswer,
  type TaskKind,
} from "../../contracts/router";
import type { LayaClassifier, LayaWireAnswer } from "./laya-client";
import { ollamaChatJson } from "./ollama-client";
import { classifyPrompt, type Classification, type ClassifyOptions } from "./router-classifier";
import { combineSignals } from "./router-signals";

/** Classifies one prompt for routing. */
export interface TaskClassifier {
  readonly choice: ClassifierChoice;
  classify(prompt: string, options: ClassifyOptions): Promise<Classification>;
}

/**
 * Local Ollama models to use as the prompt classifier, best first. Ranked by the
 * 80-prompt routing eval (all-correct, then latency on an M-series Mac):
 * gemma4:e4b-it-qat 77/80 at ~350 ms, qwen3.5:9b 75/80 at ~550 ms,
 * qwen3.5:4b 73/80 at ~350 ms, gemma4:12b 73/80 at ~900 ms, qwen2.5:7b 68/80.
 * Untested sibling tags are placed next to their measured variant.
 */
export const OLLAMA_CLASSIFIER_RANKING = [
  "gemma4:e4b-it-qat",
  "gemma4:e4b",
  "qwen3.5:9b",
  "qwen3.5:9b-cap8k",
  "qwen3.5:4b-cap8k",
  "qwen3.5:4b",
  "gemma4:12b-it-qat",
  "gemma4:12b",
  "qwen2.5:7b-cap8k",
  "qwen2.5:7b",
] as const;

const CLASSIFIER_TIMEOUT_MS = 2_500;

const DIFFICULTY_LEVELS = ["trivial", "easy", "moderate", "hard", "very hard"] as const;
/** Positions on Laya's compressed difficulty scale, so the policy's bands apply unchanged. */
const DIFFICULTY_SCALE: Record<(typeof DIFFICULTY_LEVELS)[number], number> = {
  trivial: 0.8,
  easy: 1.3,
  moderate: 1.65,
  hard: 2.2,
  "very hard": 3,
};

const unavailableLaya: LayaClassifier = {
  status: () => ({ state: "unavailable", message: "keyword cues only" }),
  warm: () => undefined,
  answer: () => Promise.reject(new Error("Keyword cues only.")),
  dispose: () => undefined,
};

export function keywordClassifier(): TaskClassifier {
  return {
    choice: { kind: "keywords" },
    classify: (prompt, options) => classifyPrompt(unavailableLaya, prompt, options),
  };
}

export function layaTaskClassifier(laya: LayaClassifier): TaskClassifier {
  return {
    choice: { kind: "laya" },
    classify: (prompt, options) => classifyPrompt(laya, prompt, options),
  };
}

export function classifierSystemPrompt(projectNames: readonly string[]): string {
  return `You route requests for a desktop AI assistant. Classify the user's request.
kind:
- "coding": software work: writing, changing, running, debugging or explaining code, scripts, repos, builds, shell commands.
- "general": a general-knowledge question or chit-chat that needs no files or web search.
- "app": the user is talking to the assistant about its own configuration: which AI models it uses or should use, thinking level, routing, which projects it can work in, why it chose a model.
- "writing": write or edit prose: emails, notes, posts, stories, poems, bios, titles, rewording.
- "research": needs current or external information from the web: news, latest releases, prices, recent papers, reviews.
difficulty: how hard the request is for a capable expert.
read_only: true if the user only wants an explanation, review, answer or plan and no files should be changed.
project: one of ${JSON.stringify(projectNames)} if the request is about that project, otherwise null.
When a previous request is given, classify the new request in that context: a short reply that continues or refines the previous request keeps its kind.`;
}

const CLASSIFIER_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: [...TASK_KINDS] },
    difficulty: { type: "string", enum: [...DIFFICULTY_LEVELS] },
    read_only: { type: "boolean" },
    project: { type: ["string", "null"] },
  },
  required: ["kind", "difficulty", "read_only", "project"],
};

interface ModelVerdict {
  readonly kind: TaskKind;
  readonly difficulty: (typeof DIFFICULTY_LEVELS)[number];
  readonly readOnly: boolean;
  readonly project: string | null;
}

function decodeVerdict(value: unknown): ModelVerdict {
  const record = (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const kind = TASK_KINDS.find((candidate) => candidate === record.kind);
  if (!kind) throw new Error(`The classifier returned an unknown kind: ${String(record.kind)}`);
  const difficulty =
    DIFFICULTY_LEVELS.find((candidate) => candidate === record.difficulty) ?? "easy";
  return {
    kind,
    difficulty,
    readOnly: record.read_only === true,
    project: typeof record.project === "string" ? record.project : null,
  };
}

function oneHot(labels: readonly string[], selected: string): number[] {
  return labels.map((label) => (label === selected ? 1 : 0));
}

/**
 * A local model reads the prompt and returns kind, difficulty, read-only and
 * project as JSON. Its verdict is fed through the same keyword cues as Laya's
 * answers, so explicit wording ("don't change anything", a named project, a
 * write verb) still applies, but the model's task kind is kept. Any failure
 * falls back to `fallback` and says why.
 */
export function ollamaTaskClassifier(
  baseUrl: string,
  model: string,
  fallback: TaskClassifier,
): TaskClassifier {
  return {
    choice: { kind: "ollama", model },
    async classify(prompt, options) {
      const projectNames = options.projects.map((path) => basename(path));
      const started = performance.now();
      let verdict: ModelVerdict;
      try {
        verdict = decodeVerdict(
          await ollamaChatJson(
            baseUrl,
            model,
            classifierSystemPrompt(projectNames),
            options.previousPrompt
              ? `Previous request: ${options.previousPrompt}\nNew request: ${prompt}`
              : prompt,
            CLASSIFIER_SCHEMA,
            CLASSIFIER_TIMEOUT_MS,
          ),
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const fallen = await fallback.classify(prompt, options);
        return { ...fallen, note: `${model} could not classify this prompt: ${reason}` };
      }
      const latencyMs = performance.now() - started;

      // Express the verdict as Laya-style answers so the cue logic applies unchanged.
      const noul = (key: string, yes: boolean): LayaWireAnswer => ({
        key,
        labels: ["false", "true"],
        probabilities: yes ? [0, 1] : [1, 0],
        selected: yes ? "true" : "false",
        confidence: 1,
        truncated: false,
      });
      const level = DIFFICULTY_SCALE[verdict.difficulty];
      const answers: LayaWireAnswer[] = [
        ...TASK_KINDS.filter((kind) => kind !== "general").map((kind) =>
          noul(`kind.${kind}`, verdict.kind === kind),
        ),
        noul("readOnly", verdict.readOnly),
        noul("needsProject", verdict.project !== null),
      ];
      const { signals, cues } = combineSignals({
        prompt,
        answers,
        knownProjects: options.projects,
      });
      const projectPath =
        options.firstTurn && verdict.kind === "coding" && verdict.project
          ? options.projects.find((path) => basename(path) === verdict.project)
          : undefined;
      const questionAnswers: RouterQuestionAnswer[] = [
        {
          key: "kind",
          type: "choice",
          instructions: "Task kind",
          labels: [...TASK_KINDS],
          probabilities: oneHot(TASK_KINDS, verdict.kind),
          selected: verdict.kind,
        },
        {
          key: "difficulty",
          type: "score",
          instructions: "Difficulty",
          labels: [...DIFFICULTY_LEVELS],
          probabilities: oneHot(DIFFICULTY_LEVELS, verdict.difficulty),
          selected: verdict.difficulty,
        },
        {
          key: "readOnly",
          type: "noul",
          instructions: "Only wants an explanation, answer or plan",
          labels: ["no", "yes"],
          probabilities: verdict.readOnly ? [0, 1] : [1, 0],
          selected: verdict.readOnly ? "yes" : "no",
        },
        {
          key: "project",
          type: "choice",
          instructions: "Project",
          labels: [verdict.project ?? "none"],
          probabilities: [1],
          selected: verdict.project ?? "none",
        },
      ];
      return {
        taskKind: verdict.kind,
        source: { kind: "model", model, latencyMs },
        // combineSignals only raises difficulty for very long prompts (to 1.9).
        signals: {
          ...signals,
          difficulty: signals.difficulty >= 1.9 ? Math.max(level, 1.9) : level,
        },
        cues,
        answers: questionAnswers,
        ...(projectPath ? { chosenProject: projectPath } : {}),
      };
    },
  };
}
