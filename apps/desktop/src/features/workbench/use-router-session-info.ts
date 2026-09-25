import { useEffect, useState } from "react";
import type { PiDesktopApi } from "../../../contracts/ipc";
import type { RouterSessionInfo } from "../../../contracts/router";

interface SessionTarget {
  readonly workspaceId: string;
  readonly sessionId: string;
}

export type RouterSessionInfoState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly info: RouterSessionInfo }
  | { readonly status: "error"; readonly message: string };

/** A session's routing decisions and purpose, refreshed whenever the router records a turn. */
export function useRouterSessionInfo(
  api: PiDesktopApi,
  target: SessionTarget | null,
): RouterSessionInfoState {
  const [state, setState] = useState<RouterSessionInfoState>({ status: "loading" });
  const workspaceId = target?.workspaceId;
  const sessionId = target?.sessionId;

  useEffect(() => {
    if (!workspaceId || !sessionId) return;
    let current = true;
    const load = () => {
      api.getRouterSessionInfo({ workspaceId, sessionId }).then(
        (info) => {
          if (current) setState({ status: "ready", info });
        },
        (error: unknown) => {
          if (current) {
            setState({
              status: "error",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        },
      );
    };
    load();
    const unsubscribe = api.onRouterChanged((changed) => {
      if (!changed || (changed.workspaceId === workspaceId && changed.sessionId === sessionId)) {
        load();
      }
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [api, workspaceId, sessionId]);

  return state;
}
