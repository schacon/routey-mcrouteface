# Routey McRouteface

A desktop app for working with AI agents without picking a model, a folder, or an effort
level first. You type what you want; a small on-device decision model reads the prompt and
routes every turn: which project to work in, which model to use (local, hosted or frontier),
how hard to think, and whether the agent may change files.

Routey is built on the [pi](https://github.com/earendil-works/pi) agent runtime and started as
a fork of [pi-gui](https://github.com/minghinmatthewlam/pi-gui).

> **Status:** early. Milestone 1 (the new shell and single-model routing) works on macOS in
> development builds. There are no packaged releases yet. See [the plan](docs/routey-plan.md)
> and [TODO.md](TODO.md).

## How it works

1. **You type.** A new session is only a text box: no model picker, no workspace picker.
2. **A small local model classifies it.** By default the best installed of a ranked list of
   Ollama models (gemma4:e4b-it-qat first, about 350 ms) reads the prompt, with the previous
   request as context on follow-ups, and answers as JSON: is this coding, a general question,
   a request about the app itself, writing or research? How hard is it? Does it need a
   project? Should it only read? Keyword cues (a named project, "don't change anything", a
   write verb) still apply, and replies like "do it" or "try again" keep the previous turn's
   routing. Without a local model, [Laya](https://github.com/FluidInference/FluidUse), a
   322M-parameter decision model on the Apple Neural Engine (~30 ms), and then keyword cues
   stand in. The classifier is selectable in Settings.
3. **The router picks.**
   - **Project:** on a session's first turn, a project the prompt names or the classifier's pick
     from folders you have used with Claude Code, Codex, pi or Cursor. Only each transcript's
     working directory is read. Anything else runs in `~/routey-mcrouteface`.
   - **Model:** easy work goes to a local model tagged for it (a coder for SQL and one-liners,
     a chat model for quick facts); moderate work to hosted, hard work to frontier; falling
     back across tiers when one has nothing suitable.
   - **Thinking level** and **mode**: execute (edit and run), plan (read-only) or answer (no
     tools).
4. **Every turn is routed again.** A follow-up that needs more reasoning can move to a stronger
   model mid-session; a quick question can drop back to a local one.
5. **Every decision is visible.** The side panel's **Inspector** shows each turn's model, mode,
   the reasons, the cues and the classifier's answers; **Stats** counts turns and tokens per
   model.

## The app

- **New session, Sessions, Settings** sit at the top right. Sessions opens a searchable list of
  earlier sessions, grouped by recency, with archived ones a tab away.
- **Info** (the default side panel) shows what the session is for, where it works and which
  models it has used. A local model writes the purpose summary.
- **Inspector** explains every routing decision.
- **Stats** shows how many turns went to each model and their tokens in and out, for the
  session or all sessions.
- **GitButler** shows `but status` for the session's checkout: stacks, branches, commits and
  uncommitted changes.
- **Files** and **Terminal** work as in pi-gui.
- **Settings → Router** sets up local models (installing Ollama, then pulling recommended
  models with progress), picks the classifier, edits the model roster (tier, order, what each
  model is good for), and excludes projects. Scheduled tasks, skills and extensions live in
  Settings too. [docs/local-model-matrix.md](docs/local-model-matrix.md) explains which small
  models suit which work.

Sessions, credentials, skills and extensions are pi's own, so they are shared with the pi CLI.

## Requirements

- [Ollama](https://ollama.com) with at least one small model for local work and
  classification; Routey's setup guide installs and pulls them. Hosted or frontier providers
  are connected in pi via OAuth or API key.
- Optional: macOS on Apple silicon and Laya's Core ML weights in
  `~/Library/Application Support/FluidUse/Models/laya-coreml` for the fast fallback
  classifier. Without either, routing falls back to keyword cues and the Inspector says so.
- The [GitButler CLI](https://gitbutler.com) (`but`) for the GitButler panel.

## Development

Requires Node 22.19 or newer (below 26), [pnpm](https://pnpm.io) through `corepack`, and Xcode
command-line tools with Swift 6 to build the Laya helper.

```bash
corepack enable
pnpm install
pnpm --filter @pi-gui/desktop run build   # also builds build/native/routey-laya-helper
pnpm dev                                  # run the desktop app with hot reload
```

Other commands, from the repo root:

```bash
pnpm check           # format, lint, architecture guards, types, guard and driver tests
pnpm test:desktop-unit
pnpm --filter @pi-gui/desktop run test:e2e:core   # drives the real Electron app
```

A live end-to-end proof of routing runs against a local Ollama:

```bash
ROUTEY_LIVE_OLLAMA=1 \
ROUTEY_LAYA_HELPER=apps/desktop/build/native/routey-laya-helper \
pnpm exec playwright test -c apps/desktop/playwright.config.ts \
  apps/desktop/tests/live/routey-routing.spec.ts
```

Routing quality is scored against 50 labeled prompts. Heuristics-only runs in the unit lane
with a floor; add the Laya helper to score Laya too:

```bash
ROUTEY_LAYA_HELPER=apps/desktop/build/native/routey-laya-helper pnpm eval:router
```

Desktop changes should be verified on the real Electron app, not only by unit tests.

## Architecture

Routey keeps pi-gui's Electron structure: a React renderer, a narrow preload bridge, and a main
process that owns sessions, persistence and platform access, over a thin adapter
(`packages/pi-sdk-driver`) around `@earendil-works/pi-coding-agent`. Routing adds:

- `apps/desktop/native/laya-helper`: a SwiftPM executable over FluidUse's `LayaManager`,
  spoken to over JSON lines.
- `apps/desktop/electron/router`: the Laya client, the questions and cues, the routing policy,
  project discovery, the model roster (`router-config.json`), the per-session decision log
  (`router-decisions/`) and the pi extension that enforces plan and answer modes.
- `apps/desktop/src/features/workbench`: the Info, Inspector and GitButler panels.

See [docs/architecture.md](docs/architecture.md) for ownership and boundaries.

## Roadmap

- **Fan-out:** split a prompt across several models and combine their answers.
- **First run:** set up Ollama, download local models suited to what you do, connect hosted and
  frontier providers, and fill the roster.
- **Settings by chat:** change the roster, projects and schedules by asking, instead of through
  the Settings page.
- A native Swift app, and removal of the git code that GitButler replaced.

## Acknowledgements

Routey is a fork of [pi-gui](https://github.com/minghinmatthewlam/pi-gui) by Matthew Lam, built
on [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)
and the [pi](https://github.com/earendil-works/pi) runtime. Routing uses Laya through
[FluidUse](https://github.com/FluidInference/FluidUse).

## License

[MIT](./LICENSE). Original pi-gui code © Matthew Lam.
