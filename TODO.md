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

- `src/ui/diff-inline.tsx` and `styles/review.css`, if nothing else uses them. (The Review panel itself, `DiffPanel`, is already gone.)
- The review IPC and owner: `electron/ipc/review-requests.ts`, `electron/workbench/review-owner.ts`, `electron/workbench/reviewed-store.ts` (`reviewed-files.json`), and the review channels in `contracts/ipc.ts` / `contracts/review.ts`.
- The git review helpers: `electron/platform/files/git-review.ts` and `electron/platform/files/app-store-diff.ts` (changed files, file diff, stage file).
- Turn checkpoints (`electron/workbench/checkpoint-store.ts`, `turn-checkpoints/`) and the turn-changes card, unless they are rebuilt on GitButler.
- Git worktree support (`electron/platform/worktrees/`, the Local/Worktree environment toggle, and fork-into-worktree), unless GitButler takes it over.
- Their unit, core and live specs.

## Routey milestone 1 follow-ups

- Port the `verify-pi-gui` conversation and maintenance proofs (`.agents/skills/verify-pi-gui/scripts/conversation.spec.ts`, `maintenance.spec.ts`) off sidebar rows. Running status can come from the session header or the Sessions modal's "Running" hint. The settings smoke (`proof.spec.ts`) is already ported.
- Package the Laya helper: add `build/native/routey-laya-helper` to electron-builder `extraFiles` next to the notification helper (`main.ts` already looks for it in `Contents/MacOS`).
- Rename packaging (`appId`, `productName`, artifact names, and the release and Homebrew scripts that assume `pi-gui-*`) and point update checks at Routey's releases instead of pi-gui's.
- Tune the router questions. Laya's single five-way "task kind" choice scored about 5 in 9 on a probe set, and per-kind yes/no plus keyword cues does better but still misses. Keep a labeled prompt set and track accuracy as wording changes.
- Remove the inert `sidebarCollapsed` state and `setSidebarCollapsed` IPC. Cmd+B now opens Sessions.
- Phase 2: fan out to several models when the router says so, then combine the answers (see `docs/routey-plan.md`).
- Phase 3: first-run onboarding (Ollama setup, model downloads, provider logins, roster seeding, Laya download).
- Phase 4: change settings through chat with hidden `routey_*` tools.
