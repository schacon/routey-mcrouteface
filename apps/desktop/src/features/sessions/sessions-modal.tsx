import { useState } from "react";
import { sessionLastInteractedAt } from "../../../contracts/thread-recency";
import { formatRelativeTime } from "../../lib/string-utils";
import { ChatIcon } from "../../ui/icons";
import {
  CommandPalette,
  type PaletteFilter,
  type PaletteSection,
} from "../command-palette/command-palette";
import { buildListSection, type PaletteCandidate } from "../command-palette/palette-sections";
import type { ThreadListEntry, ThreadSidebarModel } from "../threads/thread-groups";

type SessionsFilter = "recent" | "archived";

const SESSIONS_FILTERS: readonly PaletteFilter<SessionsFilter>[] = [
  { id: "recent", label: "Recent" },
  { id: "archived", label: "Archived" },
];

interface SessionTarget {
  readonly workspaceId: string;
  readonly sessionId: string;
}

interface SessionsModalProps {
  readonly model: ThreadSidebarModel;
  readonly currentSession: SessionTarget | undefined;
  readonly onOpenSession: (target: SessionTarget) => void;
  readonly onRestoreSession: (target: SessionTarget) => void;
  readonly onClose: () => void;
}

/** Switch back to an earlier session: pinned first, then recency buckets, searchable. */
export function SessionsModal({
  model,
  currentSession,
  onOpenSession,
  onRestoreSession,
  onClose,
}: SessionsModalProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SessionsFilter>("recent");

  const toCandidate = (entry: ThreadListEntry, archived: boolean): PaletteCandidate => {
    const target = { workspaceId: entry.workspaceId, sessionId: entry.session.id };
    const isCurrent =
      currentSession?.workspaceId === target.workspaceId &&
      currentSession.sessionId === target.sessionId;
    return {
      id: `session:${target.workspaceId}:${target.sessionId}`,
      title: entry.session.title,
      detail: [entry.contextLabel, formatRelativeTime(sessionLastInteractedAt(entry.session))]
        .filter(Boolean)
        .join(" · "),
      icon: <ChatIcon />,
      hint: archived
        ? "Restore"
        : isCurrent
          ? "Current"
          : entry.session.status === "running"
            ? "Running"
            : undefined,
      run: () => {
        onClose();
        if (archived) onRestoreSession(target);
        else onOpenSession(target);
      },
    };
  };

  let sections: readonly PaletteSection[];
  if (filter === "archived") {
    sections = buildListSection({
      id: "archived",
      label: "Archived",
      query,
      candidates: model.archivedThreads.map((entry) => toCandidate(entry, true)),
    });
  } else if (query.trim() !== "") {
    sections = buildListSection({
      id: "sessions",
      label: "Sessions",
      query,
      candidates: model.recencyOrder.map((entry) => toCandidate(entry, false)),
    });
  } else {
    sections = [
      {
        id: "pinned",
        label: "Pinned",
        items: model.pinnedThreads.map((entry) => toCandidate(entry, false)),
      },
      ...model.recencySections.map((section) => ({
        id: section.bucket,
        label: section.label,
        items: section.threads.map((entry) => toCandidate(entry, false)),
      })),
    ];
  }

  return (
    <CommandPalette
      label="Sessions"
      placeholder="Search sessions"
      query={query}
      onQueryChange={setQuery}
      sections={sections}
      emptyText={filter === "archived" ? "No archived sessions" : "No sessions yet"}
      filters={SESSIONS_FILTERS}
      activeFilter={filter}
      onFilterChange={setFilter}
      onClose={onClose}
    />
  );
}
