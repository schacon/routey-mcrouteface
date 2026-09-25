# TODO

## Port Routey McRouteface to Swift

Rewrite the app as a native Swift/SwiftUI macOS app instead of Electron + React.

- Laya already runs through Swift (`FluidUse` / `LayaManager`). A native app can call it in-process and drop the JSON-lines helper process.
- Decide how to host the pi agent runtime, which is TypeScript (`@earendil-works/pi-coding-agent`). Options: keep a bundled Node sidecar that speaks pi's RPC mode, or reimplement the pieces we need in Swift.
- Port the shell: the top-right New session / Sessions / Settings controls, the Sessions modal, the Settings sections (including Router and Scheduled tasks), and the side panel (Info, Inspector, GitButler, Files, Terminal).
- Port the router: transcript-based project discovery, the router config and model roster, the decision log, and modes.
- Carry over the storage formats (`router-config.json`, `router-decisions/`, catalogs, ui-state) or write a one-time migration.

## Remove the unused Git parts

GitButler (`but`) replaces the git Review panel, so remove the git-only code paths nothing uses any more:

- The Review side panel: `DiffPanel`, `diff-panel*.tsx` and `src/ui/diff-inline.tsx`, if nothing else uses it.
- The review IPC and owner: `electron/ipc/review-requests.ts`, `electron/workbench/review-owner.ts`, `electron/workbench/reviewed-store.ts` (`reviewed-files.json`), and the review channels in `contracts/ipc.ts` / `contracts/review.ts`.
- The git review helpers: `electron/platform/files/git-review.ts` and `electron/platform/files/app-store-diff.ts` (changed files, file diff, stage file).
- Turn checkpoints (`electron/workbench/checkpoint-store.ts`, `turn-checkpoints/`) and the turn-changes card, unless they are rebuilt on GitButler.
- Git worktree support (`electron/platform/worktrees/`, the Local/Worktree environment toggle, and fork-into-worktree), unless GitButler takes it over.
- Their unit, core and live specs.
