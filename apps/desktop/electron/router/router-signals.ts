import { basename } from "node:path";
import type {
  RouterCue,
  RouterQuestionAnswer,
  RouterSignals,
  TaskKind,
} from "../../contracts/router";
import type { LayaWireAnswer, LayaWireQuestion } from "./laya-client";

/**
 * Laya answers each task kind as its own yes/no question. On a probe set that
 * scored better than one five-way choice, which confused coding with
 * questions about the assistant. Wording without extra context scored best.
 */
export const ROUTER_QUESTIONS: readonly LayaWireQuestion[] = [
  {
    key: "kind.coding",
    type: "noul",
    instructions:
      "The user wants help with software: writing, changing, running, debugging or explaining code or a software project.",
    options: [],
  },
  {
    key: "kind.app",
    type: "noul",
    instructions:
      "The request tells the assistant which AI model, thinking level or setting to use, or asks which models or settings it has.",
    options: [],
  },
  {
    key: "kind.writing",
    type: "noul",
    instructions:
      "The user wants a piece of prose written or edited, such as an email, essay, post or document.",
    options: [],
  },
  {
    key: "kind.research",
    type: "noul",
    instructions: "Answering well requires searching the web or reading current sources.",
    options: [],
  },
  {
    key: "difficulty",
    type: "score",
    instructions: "How hard is this request for a capable engineer or expert?",
    options: [["trivial"], ["easy"], ["moderate"], ["hard"], ["very hard"]],
  },
  {
    key: "readOnly",
    type: "noul",
    instructions:
      "The user only wants an explanation, answer or plan, and does not want any files changed.",
    options: [],
  },
  {
    key: "needsProject",
    type: "noul",
    instructions: "The task needs to work inside a specific project directory.",
    options: [],
  },
  {
    key: "multiModel",
    type: "noul",
    instructions:
      "The request would benefit from several independent expert opinions being compared.",
    options: [],
  },
];

export const NONE_OF_THESE_PROJECTS = "none of these";

/** Asked only when a project seems needed and the prompt names none. */
export function projectQuestion(candidates: readonly string[]): LayaWireQuestion {
  return {
    key: "project",
    type: "choice",
    instructions: "Which software project is this request about?",
    options: [
      ...candidates.map((path) => [basename(path), path] as const),
      [NONE_OF_THESE_PROJECTS, "the request is about none of these projects"],
    ],
  };
}

export function layaState(prompt: string, previousPrompt?: string): string {
  return previousPrompt
    ? `Previous request: ${previousPrompt.trim()}\nUser request: ${prompt.trim()}`
    : `User request: ${prompt.trim()}`;
}

/**
 * Replies that only continue the previous request ("do it", "yes", "try
 * again"). They keep the previous turn's routing instead of being classified
 * on their own, where "do it for me - fully disabled" reads like a settings
 * change. "ok" is left out: "ok now refactor it" starts a new instruction.
 */
export const CONTINUATION_CUE =
  /^\s*(yes|yep|yeah|sure|please do|go ahead|do it|do that|try again|again|retry|continue|keep going|proceed|let'?s do it|make it so)\b/i;

const CODING_CUE =
  /\b(refactor|debug|bug|stack ?trace|compile|build|lint|unit tests?|tests?|function|method|class|variable|repo(sitory)?|commit|branch|merge|pull request|script|code|api|endpoint|component|css|html|typescript|javascript|python|rust|swift|golang|java|sql|regex|toggle|deploy|bash|shell|one-liner|command line|terminal command|git)\b/i;
const FILE_CUE =
  /\b[\w./-]+\.(ts|tsx|js|jsx|mjs|py|rs|go|swift|java|rb|c|cc|cpp|h|css|html|json|ya?ml|toml|sh)\b/i;
// Settings phrasing only: bare words like "model" or "routing" also appear in coding
// and research prompts, so they do not count on their own.
const APP_CUE =
  /\b(from now on|always use|never use|don'?t use|stop using|stop routing|from routing|use (a |the )?(local|hosted|frontier|cheaper|faster|bigger|smaller|different) models?|(local|hosted|frontier) models? for|as an? (local|hosted|frontier)( \w+)? model|(which|what) models? (do|are|have|can) you|your (current )?settings|thinking level|default model|router settings)\b/i;
const RESEARCH_CUE =
  /\b(latest|news|recent(ly)?|today'?s|this week|current(ly)?|papers?|search the web|look up|sources?|stock market|people saying)\b/i;
const WRITING_CUE =
  /\b(draft|proofread|rewrite|haiku|poem|limerick|lyrics|tweet|punchier|write (an?|the|my) (email|letter|post|essay|blog post|tweet|message|bio|cover letter|story)|edit (my|this) (text|essay|email|post))\b/i;
const READ_ONLY_CUE =
  /\b(explain|how does|how do|why does|what does|plan|planning|review|walk me through|don'?t change|do not change|without changing|read[- ]only)\b/i;
const EXPLICIT_NO_CHANGES_CUE = /\b(don'?t change|do not change|without changing|read[- ]only)\b/i;
const WRITE_CUE =
  /\b(fix|implement|add|change|refactor|update|create|delete|remove|rename|write|migrate|bump)\b/i;

function answerProbability(answers: readonly LayaWireAnswer[], key: string): number {
  const answer = answers.find((candidate) => candidate.key === key);
  return answer?.probabilities[1] ?? 0;
}

function expectedScore(answers: readonly LayaWireAnswer[], key: string): number | undefined {
  const answer = answers.find((candidate) => candidate.key === key);
  if (!answer) return undefined;
  return answer.probabilities.reduce((sum, probability, index) => sum + probability * index, 0);
}

function projectToken(path: string): string {
  return basename(path).toLowerCase();
}

/** A known project named in the prompt: whole-word match on its folder name. */
export function findMentionedProject(
  prompt: string,
  projects: readonly string[],
): string | undefined {
  const text = prompt.toLowerCase();
  const matches = projects.filter((path) => {
    const token = projectToken(path);
    if (token.length < 3) return false;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\w-])${escaped}($|[^\\w-])`).test(text);
  });
  // Prefer the longest name so "pi-gui" wins over "pi".
  return matches.sort((left, right) => projectToken(right).length - projectToken(left).length)[0];
}

export interface SignalInput {
  readonly prompt: string;
  readonly answers: readonly LayaWireAnswer[];
  readonly knownProjects: readonly string[];
}

export interface SignalResult {
  readonly signals: RouterSignals;
  readonly cues: readonly RouterCue[];
}

/**
 * Combines Laya's probabilities with deterministic cues. A cue can only raise a
 * signal, and every cue that fires is recorded for the Inspector. With no Laya
 * answers (the fallback path) the cues alone decide.
 */
export function combineSignals({ prompt, answers, knownProjects }: SignalInput): SignalResult {
  const cues: RouterCue[] = [];
  // Every cue that matches is recorded, even when Laya already agreed, because
  // pickTaskKind prefers the kinds a cue named.
  const raise = (current: number, floor: number, signal: string, reason: string) => {
    cues.push({ signal, reason });
    return Math.max(current, floor);
  };

  const mentionedProject = findMentionedProject(prompt, knownProjects);
  let coding = answerProbability(answers, "kind.coding");
  let app = answerProbability(answers, "kind.app");
  let writing = answerProbability(answers, "kind.writing");
  let research = answerProbability(answers, "kind.research");
  let needsProject = answerProbability(answers, "needsProject");
  let readOnly = answerProbability(answers, "readOnly");

  if (mentionedProject) {
    const name = basename(mentionedProject);
    coding = raise(coding, 0.85, "kind.coding", `names the project ${name}`);
    needsProject = raise(needsProject, 0.9, "needsProject", `names the project ${name}`);
  }
  const codingMatch = CODING_CUE.exec(prompt) ?? FILE_CUE.exec(prompt);
  if (codingMatch) coding = raise(coding, 0.8, "kind.coding", `mentions "${codingMatch[0]}"`);
  const appMatch = APP_CUE.exec(prompt);
  if (appMatch) app = raise(app, 0.9, "kind.app", `mentions "${appMatch[0]}"`);
  const researchMatch = RESEARCH_CUE.exec(prompt);
  if (researchMatch) {
    research = raise(research, 0.8, "kind.research", `mentions "${researchMatch[0]}"`);
  }
  const writingMatch = WRITING_CUE.exec(prompt);
  if (writingMatch) writing = raise(writing, 0.85, "kind.writing", `mentions "${writingMatch[0]}"`);

  const readOnlyMatch = READ_ONLY_CUE.exec(prompt);
  const noChangesMatch = EXPLICIT_NO_CHANGES_CUE.exec(prompt);
  const writeMatch = WRITE_CUE.exec(prompt);
  if (noChangesMatch) {
    readOnly = raise(readOnly, 0.95, "readOnly", `says "${noChangesMatch[0]}"`);
  } else if (readOnlyMatch && (!writeMatch || readOnlyMatch.index < writeMatch.index)) {
    // "why does the build fail after the update": the question comes first.
    readOnly = raise(readOnly, 0.8, "readOnly", `asks "${readOnlyMatch[0]}"`);
  } else if (writeMatch) {
    if (readOnly > 0.3) cues.push({ signal: "readOnly", reason: `asks to "${writeMatch[0]}"` });
    readOnly = Math.min(readOnly, 0.3);
  }

  let difficulty = expectedScore(answers, "difficulty") ?? 1.5;
  if (prompt.length > 600) {
    cues.push({ signal: "difficulty", reason: "long request" });
    difficulty = Math.max(difficulty, 1.9);
  }

  const kindScores: Record<TaskKind, number> = {
    coding,
    general: 0,
    app,
    writing,
    research,
  };
  return {
    signals: {
      kindScores,
      difficulty,
      readOnly,
      needsProject,
      multiModel: answerProbability(answers, "multiModel"),
      ...(mentionedProject ? { mentionedProject } : {}),
    },
    cues,
  };
}

/**
 * The task kind: an explicit settings cue wins, then the strongest signal at
 * or above 0.5, otherwise a general question.
 */
export function pickTaskKind(signals: RouterSignals, cues: readonly RouterCue[]): TaskKind {
  if (cues.some((cue) => cue.signal === "kind.app")) return "app";
  // When keyword cues fired, choose among the kinds they named; Laya's yes/no
  // scores decide alone only when no cue did (it confidently mislabels coding
  // prompts as settings or research on the eval set).
  const cued = TASK_KIND_CANDIDATES.filter((kind) =>
    cues.some((cue) => cue.signal === `kind.${kind}`),
  );
  let best: TaskKind = "general";
  let bestScore = 0.5;
  for (const kind of cued.length > 0 ? cued : TASK_KIND_CANDIDATES) {
    const score = signals.kindScores[kind];
    if (score >= bestScore) {
      best = kind;
      bestScore = score;
    }
  }
  return best;
}

const TASK_KIND_CANDIDATES = ["coding", "app", "writing", "research"] as const;

export function toQuestionAnswers(
  questions: readonly LayaWireQuestion[],
  answers: readonly LayaWireAnswer[],
): readonly RouterQuestionAnswer[] {
  return answers.flatMap((answer) => {
    const question = questions.find((candidate) => candidate.key === answer.key);
    if (!question) return [];
    return [
      {
        key: answer.key,
        type: question.type,
        instructions: question.instructions,
        labels:
          question.type === "score"
            ? question.options.map(([label]) => label)
            : question.type === "choice"
              ? answer.labels
              : ["no", "yes"],
        probabilities: answer.probabilities,
        selected:
          question.type === "score"
            ? (question.options[Number(answer.selected)]?.[0] ?? answer.selected)
            : question.type === "noul"
              ? answer.selected === "true"
                ? "yes"
                : "no"
              : answer.selected,
      },
    ];
  });
}
