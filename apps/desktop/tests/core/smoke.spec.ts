import { expect, test } from "@playwright/test";
import {
  addWorkspaceViaIpc,
  createSessionViaIpc,
  getDesktopState,
  getSelectedTranscript,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("an empty app shows only the New session box and the top-right controls", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("launch-diagnostic-workspace");
  const harness = await launchDesktop(userDataDir, { testMode: "background" });

  try {
    const window = await harness.firstWindow();
    await expect.poll(async () => (await getDesktopState(window)).workspaces).toEqual([]);
    await expect(window.locator(".sidebar")).toHaveCount(0);
    for (const id of ["topbar-new-session", "topbar-sessions", "topbar-settings"]) {
      await expect(window.getByTestId(id)).toBeVisible();
    }
    await expect(window.getByLabel("New session prompt")).toBeVisible();
    await expect(window.locator(".model-selector")).toHaveCount(0);

    await addWorkspaceViaIpc(window, workspacePath);
    await waitForWorkspaceByPath(window, workspacePath);
    await expect(window.getByLabel("New session prompt")).toBeVisible();
  } finally {
    await harness.close();
  }
});

test("starts a routed session from the text box and explains the decision", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("core-smoke-workspace");
  const promptText = "Smoke test session";
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);

    const prompt = window.getByLabel("New session prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toBeFocused();
    await expect(window.getByRole("heading", { name: "What are we doing?" })).toBeVisible();
    await prompt.fill(promptText);
    await window.getByRole("button", { name: "Start session" }).click();

    await expect(window.locator(".chat-header__title")).toHaveText(/\S+/);
    await expect(window.getByTestId("composer")).toBeFocused();
    await expect
      .poll(
        async () => {
          const transcript = await getSelectedTranscript(window);
          const userMessage = transcript?.transcript.find(
            (entry): entry is Extract<typeof entry, { kind: "message" }> =>
              entry.kind === "message" && entry.role === "user",
          );
          return userMessage?.text ?? "";
        },
        { timeout: 15_000 },
      )
      .toContain(promptText);

    // Tests route without Laya or Ollama: the Info panel opens by default and
    // the Inspector says keyword cues decided.
    await expect(window.getByTestId("info-cwd")).toHaveText(workspacePath, { timeout: 15_000 });
    await window.getByTestId("workbench-tab-inspector").click();
    const turn = window.getByTestId("inspector-turn").first();
    await expect(turn).toContainText("keyword cues only");
    await expect(turn).toContainText("first turn");
  } finally {
    await harness.close();
  }
});

test("the Sessions modal searches, switches and restores archived sessions", async () => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("sessions-modal-workspace");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await createSessionViaIpc(window, workspacePath, "Alpha session");
    await createSessionViaIpc(window, workspacePath, "Bravo session");

    await window.getByTestId("topbar-sessions").click();
    const palette = window.getByTestId("command-palette");
    await expect(palette.getByRole("option")).toHaveCount(2);
    await window.getByTestId("command-palette-input").fill("alpha");
    await expect(palette.getByRole("option")).toHaveCount(1);
    await palette.getByRole("option").first().click();
    await expect(window.locator(".chat-header__title")).toHaveText("Alpha session");

    await window.getByTestId("thread-header-menu").click();
    await window.getByRole("button", { name: /Archive session/ }).click();
    await expect
      .poll(async () =>
        (await getDesktopState(window)).workspaces
          .flatMap((workspace) => workspace.sessions)
          .some((session) => session.title === "Alpha session" && session.archivedAt),
      )
      .toBe(true);

    await window.getByTestId("topbar-sessions").click();
    await palette.getByRole("tab", { name: "Archived" }).click();
    await palette.getByRole("option", { name: /Alpha session/ }).click();
    await expect
      .poll(async () =>
        (await getDesktopState(window)).workspaces
          .flatMap((workspace) => workspace.sessions)
          .some((session) => session.title === "Alpha session" && !session.archivedAt),
      )
      .toBe(true);
  } finally {
    await harness.close();
  }
});

test("Settings holds Scheduled tasks and the Router", async () => {
  const userDataDir = await makeUserDataDir();
  const harness = await launchDesktop(userDataDir, { testMode: "background" });

  try {
    const window = await harness.firstWindow();
    await window.getByTestId("topbar-settings").click();
    await expect(window.getByTestId("settings-surface")).toBeVisible();

    await window.getByRole("button", { name: "Scheduled tasks" }).click();
    await expect(window.getByTestId("scheduled-surface")).toBeVisible();

    await window.getByRole("button", { name: "Router" }).click();
    await expect(window.getByTestId("settings-surface")).toBeVisible();
    // Tests run without the Laya helper, so routing uses heuristics.
    await expect(window.getByTestId("router-laya-status")).toContainText("Unavailable");

    await window.getByRole("button", { name: "Back to app" }).click();
    await expect(window.getByLabel("New session prompt")).toBeVisible();
  } finally {
    await harness.close();
  }
});

test("offers local model setup and an Ollama install guide when Ollama is missing", async () => {
  const userDataDir = await makeUserDataDir();
  const harness = await launchDesktop(userDataDir, { testMode: "background" });

  try {
    const window = await harness.firstWindow();
    // Tests point Routey at a closed Ollama port, so no local model is set up.
    const notice = window.getByTestId("local-setup-notice");
    await expect(notice).toBeVisible({ timeout: 15_000 });
    await notice.getByRole("button", { name: "Set up" }).click();
    const guide = window.getByTestId("local-setup-install");
    await expect(guide).toBeVisible();
    await expect(guide.getByRole("button", { name: "Download Ollama" })).toBeVisible();
    await expect(guide).toContainText("brew install ollama");

    await window.getByRole("button", { name: "Back to app" }).click();
    await window.getByTestId("local-setup-notice").getByRole("button", { name: "Not now" }).click();
    await expect(window.getByTestId("local-setup-notice")).toHaveCount(0);
  } finally {
    await harness.close();
  }
});
