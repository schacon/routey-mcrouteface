import { basename, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { RosterModel, RouterConfig, TaskKind } from "../../contracts/router";
import { LayaProcessClient } from "../../electron/router/laya-client";
import { ollamaBaseUrl } from "../../electron/router/ollama-client";
import { resolveRouteDecision } from "../../electron/router/route-policy";
import {
  keywordClassifier,
  layaTaskClassifier,
  ollamaTaskClassifier,
  type TaskClassifier,
} from "../../electron/router/task-classifiers";
import {
  EVAL_PROJECTS,
  ROUTER_EVAL_CASES,
  ROUTER_HELDOUT_CASES,
  type RouterEvalCase,
} from "../fixtures/router-eval-prompts";

/**
 * Scores the router against a labeled prompt set: task kind, mode and (on a
 * new session) project. Runs heuristics-only by default so the score is
 * deterministic; set ROUTEY_LAYA_HELPER to a built helper to score Laya too.
 * Prints a scorecard and every miss, and attaches a JSON report.
 */

const SCRATCH = "/Users/eval/routey-mcrouteface";
const roster: RosterModel[] = [
  {
    provider: "ollama",
    modelId: "local-general",
    tier: "local",
    capabilities: ["general", "writing", "app"],
    goodAt: "",
  },
  {
    provider: "ollama",
    modelId: "local-coder",
    tier: "local",
    capabilities: ["coding"],
    goodAt: "",
  },
  {
    provider: "hosted",
    modelId: "hosted-all",
    tier: "hosted",
    capabilities: ["coding", "general", "writing", "research", "app"],
    goodAt: "",
  },
  {
    provider: "frontier",
    modelId: "frontier-all",
    tier: "frontier",
    capabilities: ["coding", "general", "writing", "research", "app"],
    goodAt: "",
  },
];
const config: RouterConfig = {
  version: 1,
  roster,
  pinnedProjects: [],
  excludedProjects: [],
  scratchDirectory: SCRATCH,
};

/** "All correct" counts from the latest run of each set, heuristics only. */
const HEURISTIC_FLOORS = { tuned: 50, heldOut: 17 } as const;

const heuristicsOnly = keywordClassifier();

interface Score {
  readonly scored: number;
  readonly correct: number;
}

interface EvalReport {
  readonly source: string;
  readonly cases: number;
  readonly kind: Score;
  readonly mode: Score;
  readonly project: Score;
  readonly allCorrect: Score;
  readonly byKind: Record<string, Score>;
  readonly misses: readonly {
    readonly prompt: string;
    readonly expected: string;
    readonly got: string;
  }[];
}

const pct = (score: Score) =>
  score.scored === 0
    ? "n/a"
    : `${score.correct}/${score.scored} (${Math.round((100 * score.correct) / score.scored)}%)`;

async function runEval(
  classifier: TaskClassifier,
  source: string,
  cases: readonly RouterEvalCase[],
): Promise<EvalReport> {
  const tally = {
    kind: { scored: 0, correct: 0 },
    mode: { scored: 0, correct: 0 },
    project: { scored: 0, correct: 0 },
    all: { scored: 0, correct: 0 },
  };
  const byKind: Record<string, { scored: number; correct: number }> = {};
  const misses: { prompt: string; expected: string; got: string }[] = [];

  for (const testCase of cases) {
    const classification = await classifier.classify(testCase.prompt, {
      projects: EVAL_PROJECTS,
      firstTurn: true,
    });
    const taskKind: TaskKind = classification.taskKind;
    const decision = resolveRouteDecision({
      taskKind,
      signals: classification.signals,
      config,
      availableModels: roster.map((model) => ({ ...model, supportsImages: false })),
      hasImages: false,
      ...(classification.chosenProject ? { chosenProject: classification.chosenProject } : {}),
    });
    const project = decision.cwd === SCRATCH ? "scratch" : basename(decision.cwd);

    const kindOk = taskKind === testCase.kind;
    const modeOk = testCase.mode === undefined || decision.mode === testCase.mode;
    const projectOk = testCase.project === undefined || project === testCase.project;
    tally.kind.scored += 1;
    if (kindOk) tally.kind.correct += 1;
    if (testCase.mode !== undefined) {
      tally.mode.scored += 1;
      if (modeOk) tally.mode.correct += 1;
    }
    if (testCase.project !== undefined) {
      tally.project.scored += 1;
      if (projectOk) tally.project.correct += 1;
    }
    tally.all.scored += 1;
    if (kindOk && modeOk && projectOk) tally.all.correct += 1;
    const bucket = (byKind[testCase.kind] ??= { scored: 0, correct: 0 });
    bucket.scored += 1;
    if (kindOk) bucket.correct += 1;

    if (!(kindOk && modeOk && projectOk)) {
      misses.push({
        prompt: testCase.prompt,
        expected: `${testCase.kind}/${testCase.mode ?? "*"}/${testCase.project ?? "*"}`,
        got: `${taskKind}/${decision.mode}/${project}`,
      });
    }
  }
  return {
    source,
    cases: cases.length,
    kind: tally.kind,
    mode: tally.mode,
    project: tally.project,
    allCorrect: tally.all,
    byKind,
    misses,
  };
}

function printReport(report: EvalReport): void {
  const lines = [
    `Router accuracy (${report.source}), ${report.cases} prompts`,
    `  task kind   ${pct(report.kind)}`,
    `  mode        ${pct(report.mode)}`,
    `  project     ${pct(report.project)}`,
    `  all correct ${pct(report.allCorrect)}`,
    ...Object.entries(report.byKind).map(([kind, score]) => `    ${kind.padEnd(9)} ${pct(score)}`),
    `  misses (expected kind/mode/project -> got):`,
    ...report.misses.map((miss) => `    ${miss.expected} -> ${miss.got}  ${miss.prompt}`),
  ];
  console.log(lines.join("\n"));
}

test("heuristics-only routing stays above its measured floors", async ({}, testInfo) => {
  const tuned = await runEval(heuristicsOnly, "heuristics only, tuning set", ROUTER_EVAL_CASES);
  const heldOut = await runEval(heuristicsOnly, "heuristics only, held-out", ROUTER_HELDOUT_CASES);
  printReport(tuned);
  printReport(heldOut);
  await testInfo.attach("router-accuracy-heuristics.json", {
    body: JSON.stringify({ tuned, heldOut }, null, 2),
    contentType: "application/json",
  });
  // Floors from the latest measurement; raise them as routing improves.
  expect(tuned.allCorrect.correct).toBeGreaterThanOrEqual(HEURISTIC_FLOORS.tuned);
  expect(heldOut.allCorrect.correct).toBeGreaterThanOrEqual(HEURISTIC_FLOORS.heldOut);
});

test("Laya routing accuracy", async ({}, testInfo) => {
  const helper = process.env.ROUTEY_LAYA_HELPER?.trim();
  test.skip(!helper, "Set ROUTEY_LAYA_HELPER to a built routey-laya-helper to score Laya.");
  test.setTimeout(120_000);
  const laya = new LayaProcessClient(resolve(helper ?? ""));
  try {
    laya.warm();
    // Loading the Core ML buckets takes a few seconds; score only once Laya is ready.
    await expect.poll(() => laya.status().state, { timeout: 60_000 }).toBe("ready");
    const classifier = layaTaskClassifier(laya);
    const tuned = await runEval(classifier, "Laya + cues, tuning set", ROUTER_EVAL_CASES);
    const heldOut = await runEval(classifier, "Laya + cues, held-out", ROUTER_HELDOUT_CASES);
    printReport(tuned);
    printReport(heldOut);
    await testInfo.attach("router-accuracy-laya.json", {
      body: JSON.stringify({ tuned, heldOut }, null, 2),
      contentType: "application/json",
    });
  } finally {
    laya.dispose();
  }
});

test("local model classifier accuracy", async ({}, testInfo) => {
  const selected = process.env.ROUTEY_EVAL_CLASSIFIER?.trim();
  test.skip(
    !selected?.startsWith("ollama:"),
    "Set ROUTEY_EVAL_CLASSIFIER=ollama:<model> to score a local model classifier.",
  );
  test.setTimeout(300_000);
  const model = (selected ?? "").slice("ollama:".length);
  const classifier = ollamaTaskClassifier(await ollamaBaseUrl(), model, keywordClassifier());
  await classifier.classify("warm up", { projects: [], firstTurn: false });
  const tuned = await runEval(classifier, `${model}, tuning set`, ROUTER_EVAL_CASES);
  const heldOut = await runEval(classifier, `${model}, held-out`, ROUTER_HELDOUT_CASES);
  printReport(tuned);
  printReport(heldOut);
  await testInfo.attach("router-accuracy-model.json", {
    body: JSON.stringify({ model, tuned, heldOut }, null, 2),
    contentType: "application/json",
  });
});
