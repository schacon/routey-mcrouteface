import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { RouteMode } from "../../contracts/router";

/** Tools that change files or run arbitrary commands; plan mode blocks them. */
const MUTATING_TOOLS = new Set(["edit", "write", "bash", "powershell"]);

const PLAN_GUIDELINE =
  "Routey routed this turn in plan mode: investigate with read-only tools, then explain or propose a plan. Do not modify files or run commands.";
const ANSWER_GUIDELINE =
  "Routey routed this turn in answer mode: reply directly from your own knowledge without using tools.";

/**
 * Applies the router's per-turn mode. `modeFor` is read at the start of every
 * run and before every tool call, keyed by pi's session id, so a follow-up that
 * the router moves to another mode takes effect immediately.
 */
export function createRouteyModeExtension(
  modeFor: (sessionId: string) => RouteMode | undefined,
): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.on("before_agent_start", (event, ctx) => {
      const mode = modeFor(ctx.sessionManager.getSessionId());
      const options = event.systemPromptOptions;
      if (mode === "plan") {
        options.selectedTools = options.selectedTools.filter((tool) => !MUTATING_TOOLS.has(tool));
        options.promptGuidelines.push(PLAN_GUIDELINE);
      } else if (mode === "answer") {
        options.selectedTools = [];
        options.promptGuidelines.push(ANSWER_GUIDELINE);
      }
      return undefined;
    });

    pi.on("tool_call", (event, ctx) => {
      const mode = modeFor(ctx.sessionManager.getSessionId());
      if (mode === "answer") {
        return { block: true, reason: "Routey routed this turn to answer without tools." };
      }
      if (mode === "plan" && MUTATING_TOOLS.has(event.toolName)) {
        return {
          block: true,
          reason: `Routey routed this turn in plan mode, which does not allow ${event.toolName}.`,
        };
      }
      return undefined;
    });
  };
}
