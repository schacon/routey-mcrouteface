import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createSessionViaIpc,
  launchDesktop,
  makeUserDataDir,
  waitForWorkspaceByPath,
  makeWorkspace,
} from "../helpers/electron-app";

const artifacts = process.env.ROUTEY_ROUTING_SCREENSHOTS;

test("the Routing panel pins a matrix cell, suggests models and shows specialties", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("routing-panel-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await window.getByTestId("topbar-settings").click();
    await window.getByRole("button", { name: "Router" }).click();

    const panel = window.getByTestId("routing-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".routing__cell")).toHaveCount(15);
    await expect(window.getByTestId("routing-classifier-active")).toContainText("Classifying with");

    // Pin coding/hard to a model other than the one roster order picks.
    const cell = window.getByTestId("routing-cell-coding:hard");
    const select = cell.getByRole("combobox");
    const options = await select
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
    const autoLabel = await select.locator("option").first().textContent();
    const target = options.find(
      (value) => value !== "auto" && !autoLabel?.endsWith(value.split("/").slice(1).join("/")),
    );
    expect(target, "the test runtime offers at least two models").toBeTruthy();
    await select.selectOption(target ?? "");
    await expect(cell).toHaveClass(/routing__cell--pinned/);
    await expect
      .poll(async () => {
        const saved = JSON.parse(await readFile(join(userDataDir, "router-config.json"), "utf8"));
        const pin = saved.routes?.["coding:hard"];
        return pin ? `${pin.provider}/${pin.modelId}` : undefined;
      })
      .toBe(target);

    // The cell's detail explains the pick and lists catalog suggestions.
    await cell.getByRole("button").click();
    const detail = window.getByTestId("routing-cell-detail");
    await expect(detail).toContainText("pinned");
    await expect(detail).toContainText("Claude Opus 5.5");

    // Back to Automatic clears the pin.
    await select.selectOption("auto");
    await expect(cell).not.toHaveClass(/routing__cell--pinned/);

    await expect(window.getByTestId("routing-openrouter")).toContainText("Sign in with OpenRouter");
    await expect(window.getByTestId("routing-specialty-speech")).toContainText(
      "Runs on macOS speech",
    );
    await expect(window.getByTestId("routing-specialty-image-generation")).toContainText(
      "Not set up",
    );
    if (artifacts)
      await window.screenshot({ path: join(artifacts, "routing-settings.png"), fullPage: true });

    // The same matrix is a side-panel tab next to the session.
    await window.getByRole("button", { name: "Back to app" }).click();
    await createSessionViaIpc(window, workspacePath, "Routing side panel");
    await window.getByTestId("workbench-tab-routing").click();
    const sidePanel = window.getByTestId("routing-panel");
    await expect(sidePanel).toHaveClass(/routing--panel/);
    await expect(sidePanel.locator(".routing__cell")).toHaveCount(15);
    if (artifacts) await window.screenshot({ path: join(artifacts, "routing-side-panel.png") });
  } finally {
    await harness.close();
  }
});
