import { useEffect, useState } from "react";
import type { PiDesktopApi } from "../../../contracts/ipc";
import type { RouterStats } from "../../../contracts/router";
import { formatRelativeTime } from "../../lib/string-utils";

interface StatsPanelProps {
  readonly api: PiDesktopApi;
  readonly target: { readonly workspaceId: string; readonly sessionId: string } | null;
}

type Scope = "session" | "all";

const numberFormat = new Intl.NumberFormat(undefined, { notation: "compact" });

function tokens(value: number): string {
  return value === 0 ? "–" : numberFormat.format(value);
}

/** How many routed turns and tokens each model took, for this session or all sessions. */
export function StatsPanel({ api, target }: StatsPanelProps) {
  const [scope, setScope] = useState<Scope>("session");
  const [stats, setStats] = useState<RouterStats | null>(null);
  const [error, setError] = useState<string | undefined>();
  const workspaceId = target?.workspaceId;
  const sessionId = target?.sessionId;

  useEffect(() => {
    let current = true;
    const load = () => {
      const request =
        scope === "session" && workspaceId && sessionId
          ? api.getRouterStats({ workspaceId, sessionId })
          : api.getRouterStats(null);
      request.then(
        (next) => {
          if (current) setStats(next);
        },
        (reason: unknown) => {
          if (current) setError(reason instanceof Error ? reason.message : String(reason));
        },
      );
    };
    load();
    const unsubscribe = api.onRouterChanged((changed) => {
      if (scope === "all" || !changed || changed.sessionId === sessionId) load();
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [api, scope, workspaceId, sessionId]);

  const totals = (stats?.models ?? []).reduce(
    (sum, model) => ({
      input: sum.input + model.input,
      output: sum.output + model.output,
    }),
    { input: 0, output: 0 },
  );

  return (
    <div className="routey-panel" data-testid="stats-panel">
      <div className="settings-segmented" role="group" aria-label="Stats scope">
        {(["session", "all"] as const).map((option) => (
          <button
            key={option}
            aria-pressed={scope === option}
            className="settings-segmented__option"
            type="button"
            onClick={() => setScope(option)}
          >
            {option === "session" ? "This session" : "All sessions"}
          </button>
        ))}
      </div>
      {!stats ? (
        <p className="routey-panel__muted">{error ?? "Loading stats…"}</p>
      ) : stats.models.length === 0 ? (
        <p className="routey-panel__muted">No routed turns yet.</p>
      ) : (
        <>
          <p className="routey-panel__muted">
            {stats.turns} routed {stats.turns === 1 ? "turn" : "turns"}
            {stats.scope === "all"
              ? ` across ${stats.sessions} ${stats.sessions === 1 ? "session" : "sessions"}`
              : ""}
            {stats.since ? `, since ${formatRelativeTime(stats.since)}` : ""}
          </p>
          <table className="routey-stats" data-testid="stats-table">
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Turns</th>
                <th scope="col">In</th>
                <th scope="col">Out</th>
              </tr>
            </thead>
            <tbody>
              {stats.models.map((model) => (
                <tr key={`${model.provider}/${model.modelId}`}>
                  <th scope="row" title={`${model.provider}/${model.modelId}`}>
                    {model.tier ? (
                      <span className={`routey-tier routey-tier--${model.tier}`}>{model.tier}</span>
                    ) : null}
                    <span className="routey-stats__model">{model.modelId}</span>
                  </th>
                  <td>{model.turns}</td>
                  <td title={`${model.input.toLocaleString()} input tokens`}>
                    {tokens(model.input)}
                  </td>
                  <td title={`${model.output.toLocaleString()} output tokens`}>
                    {tokens(model.output)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td>{stats.turns}</td>
                <td>{tokens(totals.input)}</td>
                <td>{tokens(totals.output)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="routey-panel__muted">
            Tokens are counted from turns routed since Routey last started, including tool calls
            within each turn. Cached input is not included in In.
          </p>
        </>
      )}
    </div>
  );
}
