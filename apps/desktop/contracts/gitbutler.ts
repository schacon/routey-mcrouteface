/** `but status --json`, reduced to what the GitButler side panel renders. */

export interface GitButlerChange {
  /** GitButler's short CLI id for this change. */
  readonly id: string;
  readonly path: string;
  /** added, modified, deleted, renamed, … as GitButler reports it. */
  readonly changeType: string;
}

export interface GitButlerCommit {
  readonly id: string;
  readonly sha: string;
  /** First line of the commit message. */
  readonly title: string;
  readonly authorName: string;
  readonly createdAt: string;
  readonly conflicted: boolean;
}

export interface GitButlerBranch {
  readonly id: string;
  readonly name: string;
  /** e.g. completelyUnpushed, nothingToPush, unpushedCommits. */
  readonly status: string;
  readonly commits: readonly GitButlerCommit[];
  readonly upstreamOnlyCommits: number;
}

export interface GitButlerStack {
  readonly id: string;
  readonly assignedChanges: readonly GitButlerChange[];
  /** Top of the stack first, as `but status` lists it. */
  readonly branches: readonly GitButlerBranch[];
}

export interface GitButlerStatus {
  readonly unassignedChanges: readonly GitButlerChange[];
  readonly stacks: readonly GitButlerStack[];
  readonly base?: { readonly sha: string; readonly title: string };
  /** Commits on the target branch that this workspace has not pulled. */
  readonly behind: number;
}

export type GitButlerStatusResult =
  | { readonly state: "ready"; readonly status: GitButlerStatus; readonly checkedAt: string }
  | {
      readonly state: "unavailable";
      readonly reason: "not-installed" | "not-a-repository" | "not-set-up" | "error";
      readonly message: string;
    };
