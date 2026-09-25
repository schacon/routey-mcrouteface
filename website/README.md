# Routey McRouteface website

A standalone marketing page based on [the Routey plan](../docs/routey-plan.md).
Plain HTML, CSS, and a small illustrative routing demo; no dependencies or build step.
The demo uses fixed examples and does not call a model or send requests to a backend.
Product copy describes the first milestone and labels later phases as planned.

## Preview

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory website/public
```

Open <http://localhost:4173>.

## Deploy to Vercel

Import this repository into Vercel and set **Root Directory** to `website`.
The included `vercel.json` selects the Other framework preset, skips installation
and building, and serves only `public/`. No environment variables are required.
Keep “Include source files outside of the Root Directory in the Build Step” off;
this site does not need the desktop app or its workspace dependencies.

Alternatively, with the Vercel CLI installed:

```sh
cd website
vercel
```

See [Vercel's build configuration](https://vercel.com/docs/builds/configure-a-build).

## Edit and check

- `public/index.html`: page content, metadata, and default demo state.
- `public/styles.css`: layout, colors, typography, and responsive styles.
- `public/demo.js`: the hero routing animation and the four “tap a prompt” verdicts.
  Keep the first verdict in HTML in sync.
- `public/favicon.svg`: Routey's googly-eyed mascot, also used as the logo.

The layout follows the “Routey Landing” design in claude.ai/design. Fonts load from
Google Fonts (Bricolage Grotesque and JetBrains Mono).

From the repository root, with repository development dependencies installed:

```sh
pnpm exec prettier --check website --ignore-path website/.gitignore
node --check website/public/demo.js
pnpm exec tsc --allowJs --checkJs --noEmit --target ES2022 --lib DOM,DOM.Iterable,ES2022 --skipLibCheck website/public/demo.js
```

Preview at desktop and mobile sizes. Check that the hero animation cycles through all
five prompts, all four “tap a prompt” buttons, keyboard focus, and the section links.
With reduced motion, the hero skips typing and scanning. With JavaScript disabled, the
first verdict and all content remain visible.
