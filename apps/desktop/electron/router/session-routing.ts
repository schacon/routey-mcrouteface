import type { RouterDecisionRecord, TaskKind } from "../../contracts/router";

/**
 * The turn a follow-up continues: the latest turn that ran with tools (plan or
 * execute), else simply the latest turn. A session that has used tools keeps
 * them, so a misrouted answer-only turn is never what "try again" repeats.
 */
export function followUpAnchor(
  decisions: readonly RouterDecisionRecord[],
): RouterDecisionRecord | undefined {
  for (let index = decisions.length - 1; index >= 0; index -= 1) {
    const record = decisions[index];
    if (record && record.decision.mode !== "answer") return record;
  }
  return decisions.at(-1);
}

/**
 * A follow-up in a session that has used tools must keep them: answer mode
 * strips every tool, and a model that expects tools then prints fake tool
 * calls as text. Returns the task kind to route with instead, or undefined
 * when the follow-up may stay tool-free.
 */
export function toolFloorKind(
  anchor: RouterDecisionRecord | undefined,
  routedMode: RouterDecisionRecord["decision"]["mode"],
): TaskKind | undefined {
  if (!anchor || anchor.decision.mode === "answer" || routedMode !== "answer") return undefined;
  return anchor.decision.taskKind;
}
