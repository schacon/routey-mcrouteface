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
2. **Laya decides.** [Laya](https://github.com/FluidInference/FluidUse), a 322M-parameter
   decision model running on the Apple Neural Engine, answers a set of typed questions about
   the prompt in about 20 ms: is this coding, a general question, a request about the app
   itself, writing or research? How hard is it? Does it need a project? Should it only read?
   Keyword cues (a named project, code vocabulary, "from now on…") can raise those answers.
3. **The router picks.**
   - **Project:** on a session's first turn, a project the prompt names or Laya's best match
     from folders you have used with Claude Code, Codex, pi or Cursor. Only each transcript's
     working directory is read. Anything else runs in `~/routey-mcrouteface`.
   - **Model:** a tier from the task and its difficulty, then the first model in your roster
     tagged for that kind of task, falling back across tiers when one is empty.
   - **Thinking level** and **mode**: execute (edit and run), plan (read-only) or answer (no
     tools).
4. **Every turn is routed again.** A follow-up that needs more reasoning can move to a stronger
   model mid-session; a quick question can drop back to a local one.
5. **Every decision is visible.** The side panel's **Inspector** shows each turn's model, mode,
   the reasons, the cues and Laya's probabilities.

## The app

- **New session, Sessions, Settings** sit at the top right. Sessions opens a searchable list of
  earlier sessions, grouped by recency, with archived ones a tab away.
- **Info** (the default side panel) shows what the session is for, where it works and which
  models it has used. A local model writes the purpose summary.
- **Inspector** explains every routing decision.
- **GitButler** shows `but status` for the session's checkout: stacks, branches, commits and
  uncommitted changes.
- **Files** and **Terminal** work as in pi-gui.
- **Settings → Router** edits the model roster (tier, order, what each model is good for),
  excludes projects, and shows whether Laya is loaded. Scheduled tasks, skills and extensions
  live in Settings too.

Sessions, credentials, skills and extensions are pi's own, so they are shared with the pi CLI.

## Requirements

- macOS on Apple silicon for Laya. Elsewhere, and whenever Laya is unavailable, routing falls
  back to keyword cues and the Inspector says so.
- Laya's Core ML weights in `~/Library/Application Support/FluidUse/Models/laya-coreml`
  (the 128- and 512-token buckets and `tokenizer.json`). Routey never downloads them on its
  own yet.
- At least one model provider configured in pi: an [Ollama](https://ollama.com) endpoint for
  local models, and hosted or frontier providers via OAuth or API key.
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
