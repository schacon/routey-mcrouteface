import { useCallback, useEffect, useRef, useState } from "react";
import type { GitButlerChange, GitButlerStatusResult } from "../../../contracts/gitbutler";
import type { PiDesktopApi } from "../../../contracts/ipc";
import { formatRelativeTime } from "../../lib/string-utils";
import { RefreshIcon } from "../../ui/icons";

interface GitButlerPanelProps {
  readonly api: PiDesktopApi;
  readonly workspaceId: string;
  readonly sessionStatus: string;
}

const CHANGE_MARKS: Record<string, string> = {
  added: "A",
  modified: "M",
  removed: "D",
  deleted: "D",
  renamed: "R",
};

function ChangeList({ changes }: { readonly changes: readonly GitButlerChange[] }) {
  return (
    <ul className="routey-gitbutler__changes">
      {changes.map((change) => (
        <li key={`${change.id}:${change.path}`}>
          <span
            className={`routey-gitbutler__change routey-gitbutler__change--${change.changeType}`}
          >
            {CHANGE_MARKS[change.changeType] ?? "?"}
          </span>
          <span className="routey-gitbutler__path" title={change.path}>
            {change.path}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** `but status` for the session's checkout; refreshes on open, after a run, and on focus. */
export function GitButlerPanel({ api, workspaceId, sessionStatus }: GitButlerPanelProps) {
  const [result, setResult] = useState<GitButlerStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const refresh = useCallback(() => {
    const request = ++requestRef.current;
    setLoading(true);
    void api
      .getButStatus(workspaceId)
      .then((next) => {
        if (request === requestRef.current) setResult(next);
      })
      .catch((error: unknown) => {
        if (request === requestRef.current) {
          setResult({
            state: "unavailable",
            reason: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false);
      });
  }, [api, workspaceId]);

  // Mount, and each time a run finishes (the agent may have changed files).
  useEffect(() => {
    if (sessionStatus !== "running") refresh();
  }, [refresh, sessionStatus]);

  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return (
    <div className="routey-panel" data-testid="gitbutler-panel">
      <div className="routey-panel__row">
        <h2 className="routey-panel__heading">but status</h2>
        <button
          aria-label="Refresh GitButler status"
          className="icon-button"
          disabled={loading}
          type="button"
          onClick={refresh}
        >
          <RefreshIcon />
        </button>
      </div>
      {!result ? (
        <p className="routey-panel__muted">Reading GitButler status…</p>
      ) : result.state === "unavailable" ? (
        <div className="routey-gitbutler__unavailable" data-testid="gitbutler-unavailable">
          <p>{result.message}</p>
          {result.reason === "not-set-up" ? (
            <p className="routey-panel__muted">
              Run <code>but setup</code> in this folder to manage it with GitButler.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {result.status.behind > 0 ? (
            <p className="routey-inspector__warning">
              {result.status.behind} upstream {result.status.behind === 1 ? "commit" : "commits"} to
              pull.
            </p>
          ) : null}
          <section className="routey-panel__section">
            <h3 className="routey-panel__heading">Unassigned changes</h3>
            {result.status.unassignedChanges.length > 0 ? (
              <ChangeList changes={result.status.unassignedChanges} />
            ) : (
              <p className="routey-panel__muted">No unassigned changes.</p>
            )}
          </section>
          {result.status.stacks.map((stack) => (
            <section
              key={stack.id}
              className="routey-gitbutler__stack"
              data-testid="gitbutler-stack"
            >
              {stack.branches.map((branch) => (
                <div key={branch.id} className="routey-gitbutler__branch">
                  <div className="routey-panel__row">
                    <span className="routey-gitbutler__branch-name">{branch.name}</span>
                    <span className="routey-panel__muted">{branch.status}</span>
                  </div>
                  {branch.commits.length > 0 ? (
                    <ul className="routey-gitbutler__commits">
                      {branch.commits.map((commit) => (
                        <li key={commit.sha} title={`${commit.sha}\n${commit.authorName}`}>
                          <code>{commit.sha.slice(0, 7)}</code>
                          <span className="routey-gitbutler__commit-title">
                            {commit.conflicted ? "⚠ " : ""}
                            {commit.title}
                          </span>
                          <span className="routey-panel__muted">
                            {formatRelativeTime(commit.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="routey-panel__muted">No commits yet.</p>
                  )}
                  {branch.upstreamOnlyCommits > 0 ? (
                    <p className="routey-panel__muted">
                      {branch.upstreamOnlyCommits} commits only on the remote.
                    </p>
                  ) : null}
                </div>
              ))}
              {stack.assignedChanges.length > 0 ? (
                <ChangeList changes={stack.assignedChanges} />
              ) : null}
            </section>
          ))}
          {result.status.base ? (
            <p className="routey-panel__muted">
              Base <code>{result.status.base.sha.slice(0, 7)}</code> {result.status.base.title}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
