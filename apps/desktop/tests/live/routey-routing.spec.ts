import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { launchDesktop } from "../helpers/electron-app";

/**
 * Routey end to end against a local Ollama: the new shell, a routed first turn,
 * the Info/Inspector/GitButler panels, the Sessions modal and Settings.
 *
 * Opt in with ROUTEY_LIVE_OLLAMA=1. It uses two small local models and no
 * provider credentials. Laya runs when ROUTEY_LAYA_HELPER points at a built
 * helper (build/native/routey-laya-helper); otherwise heuristics route.
 */
const OLLAMA_MODELS = ["qwen3.5:4b-cap8k", "qwen2.5:7b-cap8k"];

test("routes a new session, explains the decision, and shows GitButler status", async ({}, testInfo) => {
  test.setTimeout(300_000);
  test.skip(
    process.env.ROUTEY_LIVE_OLLAMA !== "1",
    "Set ROUTEY_LIVE_OLLAMA=1 with Ollama running.",
  );

  const root = await mkdtemp(join(tmpdir(), "routey-live-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir, { recursive: true });
  await writeFile(join(agentDir, "auth.json"), "{}\n");
  await writeFile(
    join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        ollama: {
          baseUrl: "http://127.0.0.1:11434/v1",
          api: "openai-completions",
          apiKey: "ollama",
          models: OLLAMA_MODELS.map((id) => ({ id })),
        },
      },
    }),
  );
  await writeFile(
    join(agentDir, "settings.json"),
    JSON.stringify({
      defaultProvider: "ollama",
      defaultModel: OLLAMA_MODELS[0],
      packages: [],
      cacheWarming: "off",
      compaction: { enabled: false },
    }),
  );
  const helper = process.env.ROUTEY_LAYA_HELPER?.trim();
  const harness = await launchDesktop(join(root, "profile"), {
    agentDir,
    scrubProviderEnv: true,
    // This proof uses the real transcript folders so pi-gui is a known project.
    envOverrides: {
      ROUTEY_HOME: homedir(),
      ROUTEY_SCRATCH_DIRECTORY: undefined,
      ROUTEY_OLLAMA_URL: undefined,
      ...(helper ? { ROUTEY_LAYA_HELPER: resolve(helper) } : {}),
    },
  });
  const shot = (name: string) =>
    window.screenshot({ path: testInfo.outputPath(`${name}.png`) }).then(() => undefined);
  const window = await harness.firstWindow();
  try {
    // The shell: no sidebar, top-right controls, and a bare text box.
    await expect(window.locator(".sidebar")).toHaveCount(0);
    for (const id of ["topbar-new-session", "topbar-sessions", "topbar-settings"]) {
      await expect(window.getByTestId(id)).toBeVisible();
    }
    const composer = window.getByTestId("new-thread-composer");
    await expect(composer).toBeVisible();
    await expect(window.locator(".model-selector")).toHaveCount(0);
    await shot("01-new-session");

    // A trivial general question: routed locally, answered without tools, in the scratch dir.
    await composer.fill("What is the capital of Peru? Answer with one word.");
    await composer.press("Enter");
    const info = window.getByTestId("info-panel");
    await expect(info).toBeVisible({ timeout: 60_000 });
    await expect(window.getByTestId("info-models")).toContainText("qwen", { timeout: 60_000 });
    await expect(window.getByTestId("info-cwd")).toContainText("routey-mcrouteface");
    await expect(window.locator(".timeline-item--assistant").last()).toContainText(/lima/i, {
      timeout: 180_000,
    });
    await shot("02-routed-answer-info");

    await window.getByTestId("workbench-tab-inspector").click();
    const turn = window.getByTestId("inspector-turn").first();
    await expect(turn).toContainText("general");
    await expect(turn).toContainText("answer");
    await shot("03-inspector");

    // A second session that names this repo runs there, read-only.
    await window.getByTestId("topbar-new-session").click();
    await composer.fill(
      "In pi-gui, explain how the workbench panel remembers its tabs. Don't change anything.",
    );
    await composer.press("Enter");
    await expect(window.getByTestId("info-cwd")).toContainText("pi-gui", { timeout: 60_000 });
    await window.getByTestId("workbench-tab-inspector").click();
    await expect(window.getByTestId("inspector-turn").first()).toContainText("plan");
    const stop = window.getByRole("button", { name: "Stop run" });
    if (await stop.isVisible()) await stop.click();
    await shot("04-project-session");

    // GitButler status for that checkout.
    await window.getByTestId("workbench-add-tab").click();
    await window
      .getByTestId("workbench-chooser")
      .getByRole("button", { name: "GitButler" })
      .click();
    const gitbutler = window.getByTestId("gitbutler-panel");
    await expect(gitbutler).toBeVisible();
    await expect(
      gitbutler
        .getByTestId("gitbutler-stack")
        .or(gitbutler.getByTestId("gitbutler-unavailable"))
        .first(),
    ).toBeVisible({
      timeout: 30_000,
    });
    await shot("05-gitbutler");

    // Sessions modal switches back to the first session.
    await window.getByTestId("topbar-sessions").click();
    await window.getByTestId("command-palette-input").fill("Peru");
    await window.getByRole("option").first().click();
    // Each session remembers its side-panel tab; this one was left on the Inspector.
    await window.getByTestId("workbench-tab-info").click();
    await expect(window.getByTestId("info-cwd")).toContainText("routey-mcrouteface");
    await shot("06-sessions-switch");

    // Settings holds Scheduled tasks now.
    await window.getByTestId("topbar-settings").click();
    await window.getByRole("button", { name: "Scheduled tasks" }).click();
    await expect(window.getByTestId("scheduled-surface")).toBeVisible();
    await shot("07-settings-scheduled");

    // The Router page lists the seeded roster and Laya's state.
    await window.getByRole("button", { name: "Router" }).click();
    await expect(window.getByTestId("router-model").first()).toContainText("qwen");
    if (helper) await expect(window.getByTestId("router-laya-status")).toContainText("Ready");
    await shot("08-settings-router");
  } finally {
    await harness.close();
  }
});
