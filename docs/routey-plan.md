# Routey McRouteface — Milestone 1: new shell + Laya router

## Context

Turn pi-gui into **Routey McRouteface**, a new app on the pi framework that makes agents simpler to use. You type a prompt, and a local decision model (**Laya**) decides how to run it: task kind, working directory, model tier, thinking level and mode. The user no longer picks those by hand.

This milestone covers:

- the new UI shell;
- a single-model router, with every decision logged and visible;
- a GitButler side panel.

Fan-out to several models, first-run onboarding, and editing settings through chat are later phases (sketched at the end).

Work happens in this repo on a dedicated GitButler branch, `routey-mcrouteface`, per the user's choice. Commits are small and focused, one per step below.

**What Laya is** (verified from github.com/FluidInference/FluidUse):

- A 322M mmBERT encoder with a decision head. It answers typed `choice`, `score` and `noul` (yes/no) questions about a text "state" with calibrated probabilities, in about 4 ms per question, without generating tokens.
- It is Swift-only: the `LayaManager` in the `FluidUse` Swift package (`from: "0.2.1"`), running Core ML on the Apple Neural Engine.
- Weights come from Hugging Face `FluidInference/laya-coreml` and are cached in `~/Library/Application Support/FluidUse/Models/`. Inputs fit 128- or 512-token buckets.
- It is a classifier, not an LLM, so it picks among options we supply. Concrete model IDs are chosen from our own config.

## Success criteria

1. There is no left sidebar. The top right shows, in order: **New session**, **Sessions**, **Settings**, and the side-panel toggle.
2. **Sessions** opens a searchable modal of past sessions grouped by recency, showing each session's project. Picking one switches to it.
3. **Settings** contains everything the sidebar used to hold: General, Appearance, Notifications, Shortcuts, Providers, Models, **Router**, **Scheduled tasks**, Skills and Extensions.
4. **New session** clears the current context and shows only a text box. There is no model, thinking, workspace or environment picker.
5. Every turn, including follow-ups, is classified by Laya. The router sets the model and thinking level (and cwd on the first turn), applies a mode, and then sends the prompt.
6. The side panel defaults to **Info**: working directory, models used, purpose of the session. It also has **Inspector** (the per-turn decision log), **GitButler** (`but status`), Files and Terminal. The git Review tab is gone.
7. The app is named Routey McRouteface and uses its own userData directory, not `Application Support/pi`. Its data never collides with the user's installed pi app.
8. If Laya is unavailable (not built, weights not downloaded, or not on macOS), a heuristic fallback runs and the Inspector says so. A prompt never blocks forever.

## Design decisions

- **Cwd is fixed per session.** pi sessions are bound to their cwd (`baseCreateOptions` in `packages/pi-sdk-driver/src/session-supervisor.ts:286`). The router therefore picks the cwd only on the first turn, when the session is created lazily.
  - On later turns, if Laya thinks the prompt targets a different project, the Inspector logs it and the transcript shows an inline suggestion to "continue in a new session in X".
  - Changing model and thinking level per turn is fully supported: `driver.setSessionModel` / `setSessionThinkingLevel` run before `sendUserMessage` (`session-supervisor.ts:1065-1110`).
- **Modes** (pi has none today). They are implemented as one hidden pi extension. It uses `before_agent_start` to adjust the active tools and system-prompt section, and a `tool_call` handler to block tools (pi docs: `extensions.md:101-142`).
  - `execute`: default, all tools.
  - `plan`: read-only tools. Edit, write and bash are blocked; the prompt adds "produce a plan, do not modify".
  - `answer`: no tools, for general questions.
- **The model roster lives in router config**, `<userData>/router-config.json`, versioned and strictly decoded like `ui-state.json`.
  - Tiers are `local`, `hosted` and `frontier`. Each tier has an ordered list of `{provider, modelId}` with capability tags (`coding`, `general`, `app`, `writing`, `vision`, `long-context`) and a free-text "good at" note.
  - Only models that are actually available and authenticated in the pi `ModelRuntime` are considered. When nothing is configured, it is seeded from the user's `~/.pi/agent/models.json` (Ollama models go to local; OAuth or API-key providers go to hosted or frontier by a small built-in table).
- **Laya picks categories and the config picks concrete models.** Laya answers task kind, tier, thinking level, mode, needs-project and project choice. A deterministic `resolveRouteDecision()` then maps those answers plus the roster to a concrete model, following tier fallback order.
- **Project candidates for cwd:**
  - Discovered from transcripts:
    - `~/.claude/projects/*/*.jsonl` (the `cwd` field);
    - `~/.codex/sessions/**/*.jsonl` (the first-line `session_meta` `cwd`);
    - `~/.pi/agent/sessions/*/*.jsonl` (the header `cwd`);
    - Cursor `workspaceStorage/*/workspace.json` (`folder` URI).
  - Only the first few lines of each file are read, and only the cwd is kept, never content.
  - The list is filtered to existing directories, with temp dirs (`/tmp`, `/private/tmp`, `/private/var`) excluded, and ranked by most recent use.
  - Laya gets at most about 8 candidates (name-matched against the prompt first, then by recency), plus `~/routey-mcrouteface`, which is created on demand as the default for general or non-project prompts.
- **GitButler replaces Review.** The Review tab and its renderer code are removed. The `TurnCheckpointStore` and the turn-changes card stay for this milestone (they feed the timeline); pruning them is a follow-up.

## Implementation steps

### 1. Rename and isolate the app

- `apps/desktop/electron/main.ts:809`: `app.setName("Routey McRouteface")`. The userData dir derives from the name; confirm what `configuredUserDataDir` at :812 does.
- `apps/desktop/electron-builder.yml`: `appId: com.routey-mcrouteface.desktop`, `productName: Routey McRouteface`.
- Update the window title and product strings in the renderer, and the root and desktop `package.json` names/descriptions.
- Keep `@pi-gui/*` workspace package names for now; a mechanical rename can come later.

### 2. Shell: remove the sidebar, add top-right controls

- `apps/desktop/src/app/App.tsx`:
  - Remove the `<Sidebar>` mount (≈939-966) and `SidebarToggleButton`.
  - Simplify the view switch (1032-1283) to three cases: a new-session composer, the selected session, and settings.
- `apps/desktop/src/app/topbar.tsx`:
  - Add the New session, Sessions and Settings buttons in `.topbar__actions` (71-93) before the panel toggle.
  - Show the session title and project name on the left.
- `apps/desktop/contracts/desktop-state.ts:23`: narrow `AppView` to `"threads" | "new-thread" | "settings"` and bump the ui-state version.
  - Migrate persisted `scheduled` / `skills` / `extensions` to `settings`, with the matching section, in `apps/desktop/electron/persistence/app-store-persistence.ts` (decode 80-128, strict keys 188-220).
- Delete `src/features/threads/sidebar.tsx`, `sidebar-toggle-button.tsx` and sidebar-only CSS. Remove the `sidebarCollapsed` state and commands in `src/app/use-desktop-commands.ts`, `app-shell-utils.ts:28` and the desktop commands contract.
- Rename "thread" to "session" in user-visible strings only. Internal identifiers stay (e.g. `thread-title-constants.ts` gets "New session").

### 3. Sessions modal

- New `src/features/sessions/sessions-modal.tsx`, built on the existing `CommandPalette` shell (`src/features/command-palette/command-palette.tsx:52`) and its `fuzzy-match.ts` / `buildListSection` (`palette-sections.ts:132`).
- Data comes from `buildThreadSidebarModel(snapshot).recencySections` (`src/features/threads/thread-groups.ts:64`). Rows show title, project name and relative time; pinned sessions sort first.
- Selecting a row calls the existing `handleSelectSession` (`App.tsx:778-788`).
- Archive and unarchive become row actions in the modal.
- Shortcut: ⌘K / ⌘P opens it. The Ctrl-Tab `ThreadSwitcher` stays as is.

### 4. Settings absorbs Scheduled, Skills and Extensions

- `src/features/settings/settings-sections.tsx:25-92`: add `scheduled` (renders the existing `ScheduledTasksView` + `ScheduledTaskEditor`), a `router` section (step 6), and make Skills and Extensions first-class sections instead of the separate `CustomizePage` route.
- `src/app/secondary-surfaces.tsx` and `settings-view.tsx:137-190`: route those sections.

### 5. New-session composer: a text box only

- `src/features/threads/new-thread-view.tsx`: remove the workspace select (162-174), the environment toggle (283-298) and `ModelSelector` (300-313). Keep attachments.
- `src/features/conversation/composer-panel.tsx:198`: remove `ModelSelector` from the in-session composer too. Model and thinking become read-only chips that open the Inspector entry for the last turn.
- `hooks/use-new-thread-controller.tsx:266-315`: submit calls a new IPC `startRoutedSession({prompt, attachments})` instead of `startThread`.

### 6. Router core (main process)

New owner folder `apps/desktop/electron/router/`, constructed through `DesktopAppStore` capability factories like the other owners (see `docs/architecture.md`; keep `pnpm check:architecture` green):

- **`laya-client.ts`** manages the long-lived helper process. It speaks JSON lines over stdio: request `{id, state, questions:[{kind, text, options|levels}]}`, response `{id, answers:[{label, probabilities, yes?}], ms}`. It covers:
  - lazy start;
  - a load/download state that the UI can show;
  - a per-request timeout (~2 s), then fallback;
  - restart on crash.
- **Native helper** `apps/desktop/native/laya-helper/`: a SwiftPM package depending on `FluidUse` (`LayaManager.load()`, `laya.answer(state:questions:)`).
  - Built by extending `apps/desktop/scripts/build-notification-status-helper.mjs` (rename it to `build-native-helpers.mjs`) with `swift build -c release`. It is skipped off macOS.
  - Check the exact probability fields in `FluidUse`'s answer type when implementing.
- **`router-questions.ts`** builds a compact state for the 512-token bucket: the prompt (truncated), plus for follow-ups the session's cwd, last task kind and title. It asks:
  - `choice` task kind: coding / general question / about this app / writing / research;
  - `noul` needs a project directory;
  - `choice` project among the candidates;
  - `choice` tier: local / hosted / frontier (only tiers that have available models);
  - `score` thinking level: off / low / medium / high;
  - `choice` mode: execute / plan / answer;
  - `noul` would benefit from multiple models (logged only in M1).
- **`route-policy.ts`**: a pure `resolveRouteDecision(answers, roster, availability, candidates)` that returns `{cwd, provider, modelId, thinkingLevel, mode, reasons[]}`.
  - It applies the rules: tier fallback, "app" questions go to the local general model, and a vision tag is required when images are attached.
  - A `heuristicAnswers()` fallback covers the case where Laya is missing.
- **`workspace-discovery.ts`**: the transcript scan described above. It runs off the main thread (async fs, bounded file reads), is cached in memory, and refreshes on focus at most once every 10 minutes.
- **`router-config-store.ts`**: `router-config.json` with a strict decoder and a seed from `models.json`.
- **`decision-log-store.ts`**: `<userData>/router-decisions/<sessionId>.jsonl`, one record per turn. Each record holds:
  - the state text sent to Laya;
  - questions, labels and probabilities;
  - the resolved decision and reasons;
  - the source (`laya` or `heuristic`, with the fallback cause);
  - latency.
- **`routey-mode-extension.ts`**: the hidden pi extension factory for execute, plan and answer. It is registered with the desktop `extensionFactories` in `main.ts:897-914`. The current mode is read per session from the router owner.

**Flow, first turn:** `startRoutedSession`:

1. discover candidates;
2. run Laya;
3. resolve the decision;
4. ensure the cwd exists (`mkdir -p ~/routey-mcrouteface` when chosen) and is registered as a workspace (reusing the existing workspace registration path in `app-store-workspace.ts`);
5. `driver.createSession(workspace, {initialModel, initialThinkingLevel})`;
6. set the mode;
7. send the prompt;
8. append the decision.

It reuses the existing auto-title path (`app-store-worktree.ts:155-190`).

**Flow, follow-ups:** hook `sendMessageToSession` (`apps/desktop/electron/conversation/app-store-composer.ts:713-759`). Before the send it:

1. classifies the prompt;
2. calls `setSessionModel` / `setSessionThinkingLevel` / sets the mode only when they change;
3. then sends.

Queued steer and follow-up messages sent while a run is streaming skip routing; they inherit the settings of the running turn. Scheduled tasks and orchestration child sessions keep today's defaults for M1.

### 7. Side panel: Info, Inspector, GitButler

- `apps/desktop/contracts/workbench.ts:8`: `BUILTIN_TOOL_KINDS` becomes `info | inspector | gitbutler | files | terminal`, and `changes` is removed. `initialWorkbenchView()` (`src/features/workbench/workbench-state.ts:27-35`) defaults to `[info]`, selected. Persisted templates containing `changes` are migrated to `gitbutler`.
- **Info panel** (`src/features/workbench/info-panel.tsx`) shows:
  - the cwd, with an open-in-Finder action;
  - the distinct models used, with turn counts from the decision log;
  - current mode and thinking level;
  - "Purpose": a one-to-two-sentence summary generated after the first turn (and refreshed every 5 turns) by a side session modelled on `generateThreadTitle` (`packages/pi-sdk-driver/src/thread-title-generator.ts:35`), using the local general model. It is stored in the decision-log directory as `<sessionId>.meta.json`.
- **Inspector panel** (`inspector-panel.tsx`) lists turns newest first. Each row shows prompt excerpt → chosen model / tier / thinking / mode / cwd, with source and latency. Expanding a row shows each Laya question with its probability bars, the reasons, and the fallback cause. It updates live through a new `routerDecision` event on the existing state-push channel.
- **GitButler panel** (`gitbutler-panel.tsx`) shows the output of `but status --json`, run in the session cwd. Main side: new `apps/desktop/electron/platform/gitbutler/but-status.ts`, modelled on the `execFile` wrapper at `git-review.ts:107-130` (timeout, maxBuffer, `isolatedGitEnvironment()` from `git-environment.ts:6`).
  - It renders unassigned changes, then stacks → branches (with branch status) → commits, plus assigned changes.
  - It refreshes when the panel opens, at turn end, and when the window regains focus.
  - Empty states: `but` not installed, not a git repo, or not set up for GitButler (shows the error text; M1 has no automatic `but setup`).
- Remove `DiffPanel` and the `changes` built-in (`builtin-tools.tsx`, `diff-panel*.tsx`), the `toggleReview` command and the review IPC (`electron/ipc/review-requests.ts`, `contracts/ipc.ts:179-186`), plus the related unit and core specs.

### 8. Settings → Router section

- Edit the roster per tier (add or remove available models, capability tags, "good at" note).
- Show the list of discovered projects, with pinned or excluded projects.
- Show Laya status (built / downloading / ready / unavailable), with a "Download Laya model" action.
- Show the default scratch directory.

## Tests (update with each step)

- **New unit specs** (`apps/desktop/tests/unit`):
  - `route-policy` (tier fallback, availability, vision, app routing);
  - `workspace-discovery` (fixture transcripts for all four tools, including malformed, temp-dir and missing-dir cases);
  - `router-config-store` / `decision-log-store` decoders;
  - ui-state and workbench-template migrations;
  - `but-status` parsing.
- **Core e2e** (`tests/core`, fake auth):
  - A test-only stub Laya client, enabled under `PI_APP_TEST_MODE` like the existing test hooks, returns scripted answers.
  - New specs:
    - `shell-topbar`: no sidebar, three buttons plus the toggle;
    - `sessions-modal`: search and switch;
    - `settings-sections`: Scheduled, Skills and Extensions are present;
    - `routed-new-session`: text box only; submit creates a session in the stubbed cwd with the stubbed model; the Inspector shows the decision; the Info panel shows cwd and model;
    - `routed-follow-up-model-switch`;
    - `gitbutler-panel` (fixture repo with `but` missing or present).
- **Break and fix:** sidebar-driven helpers in `tests/helpers/` (select a session through the Sessions modal instead). Delete specs for removed features: `sidebar-*`, `workspace-menu`, the review specs, and `model-scope-toggle` / composer-picker specs. Fix the other specs that use sidebar selectors (list from exploration: smoke, persistence, navigation, archive, …).

## Verification

1. `pnpm check` (format, lint, architecture guards, typecheck, baseline tests) and `pnpm e2e`.
2. `pnpm --filter @pi-gui/desktop run build`; confirm the native build produces the Laya helper, and that it answers a sample request run by hand on stdin.
3. Real Electron (required by AGENTS.md): `pnpm dev` with Ollama running (the user already has `qwen3.5`, `qwen3-coder:30b`, `gpt-oss:120b` and others configured in `~/.pi/agent/models.json`).
   - "what's the capital of Peru" → answer mode, local tier, `~/routey-mcrouteface`.
   - "in pi-gui, explain how the workbench panel persists state" → coding, cwd `…/projects/pi-gui`, plan or execute.
   - A follow-up that needs deeper reasoning → the model or thinking level changes, visible in the Inspector.
   - Open Sessions and switch back; the Info panel shows purpose and models.
   - GitButler tab shows `but status` for pi-gui.
   - Screenshot each step.
   - Run `.agents/skills/verify-pi-gui/scripts/prove.sh --smoke` after updating its sidebar selectors.
4. Confirm `~/Library/Application Support/pi` is untouched and that Routey uses its own directory.

## Later phases (not in M1)

- **Phase 2, fan-out:** when "multiple models" is yes, run N child sessions in parallel with different roster models. This extends the orchestration owner (`app-store-orchestration.ts:228` already calls `createSession`; add `initialModel`). Collect with `driver.getTranscript`, synthesize with a frontier or hosted model, and show a tree in the Inspector.
- **Phase 3, onboarding:** a first-run chat-style flow that:
  - detects or installs Ollama and registers it as a custom endpoint (the existing `custom-provider-store.ts` plus the probe at `main.ts:1479-1520`);
  - asks what the user does;
  - suggests and pulls a range of local models (with confirmation);
  - connects hosted and frontier providers;
  - seeds the roster;
  - downloads Laya.
- **Phase 4, settings through chat:** the "about this app" task kind routes to a session with hidden `routey_*` tools (get/set roster, preferences, scheduled tasks, projects), following the scheduled-task tool bridge pattern (`scheduled-task-runtime.ts`, bridged in `main.ts:126-141`).
