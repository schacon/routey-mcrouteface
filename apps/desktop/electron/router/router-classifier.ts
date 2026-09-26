import type {
  RouterCue,
  RouterQuestionAnswer,
  RouterSignals,
  RouterSource,
  TaskKind,
} from "../../contracts/router";
import type { LayaClassifier, LayaWireAnswer } from "./laya-client";
import {
  NONE_OF_THESE_PROJECTS,
  ROUTER_QUESTIONS,
  combineSignals,
  layaState,
  pickTaskKind,
  projectQuestion,
  toQuestionAnswers,
} from "./router-signals";
import type { RunnableSpecialty } from "../../contracts/specialties";

export interface Classification {
  readonly taskKind: TaskKind;
  readonly source: RouterSource;
  readonly signals: RouterSignals;
  readonly cues: readonly RouterCue[];
  readonly answers: readonly RouterQuestionAnswer[];
  readonly chosenProject?: string;
  /** Why the selected classifier was not the one that answered, for the Inspector. */
  readonly note?: string;
  /** A media task a specialty tool runs this turn. */
  readonly specialty?: RunnableSpecialty;
}

export interface ClassifyOptions {
  /** Known project paths, most recently used first. */
  readonly projects: readonly string[];
  /** Only a new session picks a directory. */
  readonly firstTurn: boolean;
  /** The session's previous request, so a follow-up is read in context. */
  readonly previousPrompt?: string;
  /** The previous turn's task kind; a follow-up no cue explains keeps it. */
  readonly previousKind?: TaskKind;
}

const PROJECT_CANDIDATE_LIMIT = 8;

/**
 * Laya's answers plus deterministic cues for one prompt. When Laya is
 * unavailable the cues alone decide and the source says why. Shared by the
 * router and the accuracy eval so both measure the same path.
 */
export async function classifyPrompt(
  laya: LayaClassifier,
  prompt: string,
  options: ClassifyOptions,
): Promise<Classification> {
  let answers: readonly LayaWireAnswer[] = [];
  let source: RouterSource;
  try {
    const result = await laya.answer(layaState(prompt, options.previousPrompt), ROUTER_QUESTIONS);
    answers = result.answers;
    source = { kind: "laya", latencyMs: result.latencyMs };
  } catch (error) {
    source = { kind: "heuristic", reason: error instanceof Error ? error.message : String(error) };
  }
  const { projects, firstTurn } = options;
  const { signals, cues } = combineSignals({ prompt, answers, knownProjects: projects });
  const questionAnswers = [...toQuestionAnswers(ROUTER_QUESTIONS, answers)];

  // Ask Laya for a project only when the prompt seems to need one it does not name.
  let chosenProject: string | undefined;
  if (
    firstTurn &&
    source.kind === "laya" &&
    !signals.mentionedProject &&
    pickTaskKind(signals, cues) === "coding" &&
    signals.needsProject >= 0.6
  ) {
    const candidates = projects.slice(0, PROJECT_CANDIDATE_LIMIT);
    if (candidates.length > 0) {
      const question = projectQuestion(candidates);
      try {
        const answer = (await laya.answer(layaState(prompt), [question])).answers[0];
        if (answer) {
          questionAnswers.push(...toQuestionAnswers([question], [answer]));
          const index = answer.labels.indexOf(answer.selected);
          if (answer.selected !== NONE_OF_THESE_PROJECTS && index >= 0) {
            chosenProject = candidates[index];
          }
        }
      } catch {
        // The kind answers already landed; keep going without a project pick.
      }
    }
  }
  // Laya and the cues read one message; a follow-up like "also handle heic
  // files" that names no kind continues whatever the session was doing.
  const picked = pickTaskKind(signals, cues);
  const kindCued = cues.some((cue) => cue.signal.startsWith("kind."));
  const taskKind =
    picked === "general" && !kindCued && options.previousKind ? options.previousKind : picked;
  return {
    taskKind,
    source,
    signals,
    cues,
    answers: questionAnswers,
    ...(chosenProject ? { chosenProject } : {}),
  };
}
