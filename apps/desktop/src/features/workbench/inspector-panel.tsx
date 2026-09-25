import { useState } from "react";
import type { PiDesktopApi } from "../../../contracts/ipc";
import type { RouterDecisionRecord, RouterQuestionAnswer } from "../../../contracts/router";
import { formatRelativeTime } from "../../lib/string-utils";
import { useRouterSessionInfo } from "./use-router-session-info";

interface InspectorPanelProps {
  readonly api: PiDesktopApi;
  readonly target: { readonly workspaceId: string; readonly sessionId: string } | null;
}

function Probabilities({ answer }: { readonly answer: RouterQuestionAnswer }) {
  return (
    <div className="routey-inspector__question">
      <div className="routey-inspector__instructions">{answer.instructions}</div>
      <ul className="routey-inspector__bars">
        {answer.labels.map((label, index) => {
          const probability = answer.probabilities[index] ?? 0;
          return (
            <li key={label} className={label === answer.selected ? "is-selected" : undefined}>
              <span className="routey-inspector__label" title={label}>
                {label}
              </span>
              <span className="routey-inspector__bar">
                <span style={{ width: `${Math.round(probability * 100)}%` }} />
              </span>
              <span className="routey-inspector__value">{Math.round(probability * 100)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DecisionRow({
  record,
  expanded,
  onToggle,
}: {
  readonly record: RouterDecisionRecord;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const { decision, source } = record;
  return (
    <li className="routey-inspector__turn" data-testid="inspector-turn">
      <button
        aria-expanded={expanded}
        className="routey-inspector__summary"
        type="button"
        onClick={onToggle}
      >
        <span className="routey-inspector__prompt">{record.promptExcerpt || "(attachments)"}</span>
        <span className="routey-inspector__chips">
          <span className={`routey-tier routey-tier--${decision.tier}`}>{decision.tier}</span>
          <span>{decision.modelId}</span>
          <span>{decision.taskKind}</span>
          <span>{decision.mode}</span>
          <span>thinking {decision.thinkingLevel}</span>
        </span>
        <span className="routey-panel__muted">
          {source.kind === "laya" ? `Laya · ${Math.round(source.latencyMs)} ms` : "heuristics only"}{" "}
          · {formatRelativeTime(record.timestamp)}
          {record.firstTurn ? " · first turn" : ""}
        </span>
      </button>
      {expanded ? (
        <div className="routey-inspector__details">
          {source.kind === "heuristic" ? (
            <p className="routey-inspector__warning">Laya was not used: {source.reason}</p>
          ) : null}
          {record.suggestedProject ? (
            <p className="routey-inspector__warning">
              This turn names another project ({record.suggestedProject}). Sessions keep their
              folder; start a new session to work there.
            </p>
          ) : null}
          <h3 className="routey-panel__heading">Decision</h3>
          <ul className="routey-inspector__reasons">
            {decision.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            <li>
              works in <code>{decision.cwd}</code>
            </li>
          </ul>
          {record.cues.length > 0 ? (
            <>
              <h3 className="routey-panel__heading">Cues</h3>
              <ul className="routey-inspector__reasons">
                {record.cues.map((cue) => (
                  <li key={`${cue.signal}:${cue.reason}`}>
                    {cue.signal}: {cue.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {record.answers.length > 0 ? (
            <>
              <h3 className="routey-panel__heading">Laya answers</h3>
              {record.answers.map((answer) => (
                <Probabilities key={answer.key} answer={answer} />
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Every routing decision in this session, newest first, with the evidence behind it. */
export function InspectorPanel({ api, target }: InspectorPanelProps) {
  const state = useRouterSessionInfo(api, target);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (state.status === "loading") {
    return <div className="routey-panel routey-panel__muted">Loading decisions…</div>;
  }
  if (state.status === "error") {
    return <div className="routey-panel routey-panel__muted">{state.message}</div>;
  }
  const decisions = [...state.info.decisions].reverse();
  const newestId = decisions[0]?.id ?? null;
  const openId = expandedId ?? newestId;
  return (
    <div className="routey-panel" data-testid="inspector-panel">
      {decisions.length === 0 ? (
        <p className="routey-panel__muted">
          No routed turns yet. Each message you send is classified before it runs, and the decision
          shows up here.
        </p>
      ) : (
        <ol className="routey-inspector">
          {decisions.map((record) => (
            <DecisionRow
              key={record.id}
              record={record}
              expanded={record.id === openId}
              onToggle={() => setExpandedId(record.id === openId ? "" : record.id)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
