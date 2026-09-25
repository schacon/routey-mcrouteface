import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type { AppView, WorkspaceRecord, WorktreeRecord } from "../../contracts/desktop-state";
import { getSidePanelToggleShortcutLabel, type PiDesktopApi } from "../../contracts/ipc";
import { ClockIcon, PlusIcon, SettingsIcon, SidePanelIcon } from "../ui/icons";

interface TopbarProps {
  readonly activeView: AppView;
  readonly sessionTitle?: string;
  readonly children?: ReactNode;
  readonly rootWorkspace: WorkspaceRecord | undefined;
  readonly selectedWorkspace: WorkspaceRecord | undefined;
  readonly selectedWorktree: WorktreeRecord | undefined;
  readonly api: PiDesktopApi;
  readonly panelAvailable: boolean;
  readonly panelVisible: boolean;
  readonly onTogglePanel: () => void;
  readonly onNewSession: () => void;
  readonly onOpenSessions: () => void;
  readonly onOpenSettings: () => void;
}

export function Topbar({
  activeView,
  sessionTitle,
  children,
  rootWorkspace,
  selectedWorkspace,
  selectedWorktree,
  api,
  panelAvailable,
  panelVisible,
  onTogglePanel,
  onNewSession,
  onOpenSessions,
  onOpenSettings,
}: TopbarProps) {
  const handleDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest(".topbar__actions")) return;
    void api.toggleWindowMaximize().catch((error: unknown) => {
      console.error("[renderer] toggleWindowMaximize failed", error);
    });
  };
  const checkoutLabel =
    selectedWorkspace?.kind === "worktree"
      ? (selectedWorktree?.name ?? selectedWorkspace.branchName ?? selectedWorkspace.name)
      : selectedWorkspace?.branchName;

  return (
    <header className="topbar" data-testid="topbar" onDoubleClick={handleDoubleClick}>
      <div className="topbar__title">
        <span
          className="topbar__workspace"
          title={checkoutLabel ? `${rootWorkspace?.name ?? ""} · ${checkoutLabel}` : undefined}
        >
          {activeView === "new-thread" || !rootWorkspace
            ? "Routey McRouteface"
            : rootWorkspace.name}
        </span>
        {sessionTitle ? (
          <>
            <span className="topbar__separator">/</span>
            <h1 className="chat-header__title" title={sessionTitle}>
              {sessionTitle}
            </h1>
          </>
        ) : activeView === "threads" && checkoutLabel ? (
          <>
            <span className="topbar__separator">/</span>
            <span className="topbar__session">{checkoutLabel}</span>
          </>
        ) : activeView === "new-thread" ? (
          <>
            <span className="topbar__separator">/</span>
            <span className="topbar__session">New session</span>
          </>
        ) : null}
      </div>
      <div className="topbar__actions">
        {children}
        <button
          type="button"
          aria-label="New session"
          title="New session"
          data-testid="topbar-new-session"
          className="icon-button topbar__icon"
          onClick={onNewSession}
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          aria-label="Sessions"
          title="Sessions"
          data-testid="topbar-sessions"
          className="icon-button topbar__icon"
          onClick={onOpenSessions}
        >
          <ClockIcon />
        </button>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          data-testid="topbar-settings"
          className="icon-button topbar__icon"
          onClick={onOpenSettings}
        >
          <SettingsIcon />
        </button>
        {!panelVisible ? (
          <div className="shortcut-tooltip-wrap topbar__tooltip-wrap">
            <button
              type="button"
              aria-label="Toggle side panel"
              aria-pressed={panelVisible}
              aria-controls="task-workbench"
              data-testid="toggle-side-panel"
              className={`icon-button topbar__icon${panelVisible ? " icon-button--active" : ""}`}
              disabled={!panelAvailable}
              onClick={onTogglePanel}
            >
              <SidePanelIcon />
            </button>
            <span className="shortcut-tooltip topbar__tooltip" role="tooltip">
              <span>{panelVisible ? "Hide side panel" : "Show side panel"}</span>
              <kbd>{getSidePanelToggleShortcutLabel(api.platform)}</kbd>
            </span>
          </div>
        ) : null}
      </div>
    </header>
  );
}
