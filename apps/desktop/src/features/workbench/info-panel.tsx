import type { PiDesktopApi } from "../../../contracts/ipc";
import type { RouterDecisionRecord } from "../../../contracts/router";
import { formatRelativeTime } from "../../lib/string-utils";
import { InfoAvailableModels } from "./info-available-models";
import { useRouterSessionInfo } from "./use-router-session-info";

interface InfoPanelProps {
  readonly api: PiDesktopApi;
  readonly target: { readonly workspaceId: string; readonly sessionId: string } | null;
  readonly workspacePath: string;
  readonly sessionTitle: string;
  readonly onOpenInspector: () => void;
}

interface ModelUsage {
  readonly key: string;
  readonly modelId: string;
  readonly provider: string;
  readonly tier: string;
  readonly turns: number;
}

function modelUsage(decisions: readonly RouterDecisionRecord[]): ModelUsage[] {
  const byModel = new Map<string, ModelUsage>();
  for (const { decision } of decisions) {
    const key = `${decision.provider}/${decision.modelId}`;
    const existing = byModel.get(key);
    byModel.set(key, {
      key,
      modelId: decision.modelId,
      provider: decision.provider,
      tier: decision.tier,
      turns: (existing?.turns ?? 0) + 1,
    });
  }
  return [...byModel.values()].sort((left, right) => right.turns - left.turns);
}

/** The default side panel: where the session works, which models it used, and what it is for. */
export function InfoPanel({
  api,
  target,
  workspacePath,
  sessionTitle,
  onOpenInspector,
}: InfoPanelProps) {
  const state = useRouterSessionInfo(api, target);
  const decisions = state.status === "ready" ? state.info.decisions : [];
  const latest = decisions.at(-1);
  const usage = modelUsage(decisions);
  const purpose = state.status === "ready" ? state.info.purpose : undefined;

  return (
    <div className="routey-panel" data-testid="info-panel">
      <section className="routey-panel__section">
        <h2 className="routey-panel__heading">Purpose</h2>
        <p className="routey-panel__purpose" data-testid="info-purpose">
          {purpose?.text ?? (sessionTitle || "Summarized after the first reply.")}
        </p>
      </section>

      <section className="routey-panel__section">
        <h2 className="routey-panel__heading">Working in</h2>
        <div className="routey-panel__row">
          <code className="routey-panel__path" data-testid="info-cwd" title={workspacePath}>
            {workspacePath}
          </code>
          {target ? (
            <button
              className="routey-panel__link"
              type="button"
              onClick={() => {
                void api.revealWorkspaceFile(target.workspaceId, ".").catch((error: unknown) => {
                  console.error("[renderer] reveal folder failed", error);
                });
              }}
            >
              Reveal
            </button>
          ) : null}
        </div>
      </section>

      <section className="routey-panel__section">
        <h2 className="routey-panel__heading">Right now</h2>
        {latest ? (
          <dl className="routey-panel__facts">
            <dt>Task</dt>
            <dd>{latest.decision.taskKind}</dd>
            <dt>Mode</dt>
            <dd>{latest.decision.mode}</dd>
            <dt>Thinking</dt>
            <dd>{latest.decision.thinkingLevel}</dd>
            <dt>Routed by</dt>
            <dd>{latest.source.kind === "laya" ? "Laya" : "heuristics"}</dd>
          </dl>
        ) : (
          <p className="routey-panel__muted">
            {state.status === "error"
              ? state.message
              : "This session has no routed turns yet. Sessions from before Routey keep their model."}
          </p>
        )}
      </section>

      <section className="routey-panel__section">
        <div className="routey-panel__row">
          <h2 className="routey-panel__heading">Models used</h2>
          {decisions.length > 0 ? (
            <button className="routey-panel__link" type="button" onClick={onOpenInspector}>
              Why?
            </button>
          ) : null}
        </div>
        {usage.length > 0 ? (
          <ul className="routey-panel__list" data-testid="info-models">
            {usage.map((model) => (
              <li key={model.key} className="routey-panel__model">
                <span className={`routey-tier routey-tier--${model.tier}`}>{model.tier}</span>
                <span className="routey-panel__model-name" title={model.key}>
                  {model.modelId}
                </span>
                <span className="routey-panel__muted">
                  {model.turns} {model.turns === 1 ? "turn" : "turns"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="routey-panel__muted">None yet.</p>
        )}
        {latest ? (
          <p className="routey-panel__muted">Last routed {formatRelativeTime(latest.timestamp)}</p>
        ) : null}
      </section>

      <section className="routey-panel__section">
        <h2 className="routey-panel__heading">Available models</h2>
        <InfoAvailableModels api={api} />
      </section>
    </div>
  );
}
