import { expect, test } from "@playwright/test";
import {
  createSessionViaIpc,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  selectSession,
  waitForSessionByTitle,
  waitForWorkspaceByPath,
  writeProjectExtension,
} from "../helpers/electron-app";

const compatibilityExtensionSource = String.raw`
export default function compatibilityExtension(pi) {
  pi.registerCommand("handoff-gui-test", {
    description: "Transfer context to a new focused session",
    handler: async (args, ctx) => {
      const goal = args.trim() || "Untitled goal";
      const generatedPrompt = await ctx.ui.custom((_tui, _theme, _kb, _done) => ({
        render: () => ["Generating handoff for " + goal],
      }));
      const editedPrompt = await ctx.ui.editor("Edit handoff prompt", generatedPrompt);
      if (editedPrompt === undefined) {
        return;
      }
      const nextSession = await ctx.newSession();
      if (nextSession.cancelled) {
        return;
      }
      ctx.ui.setEditorText(editedPrompt);
      ctx.ui.notify("Handoff ready. Submit when ready.", "info");
    },
  });

  pi.registerCommand("prefill-safe", {
    description: "Prefill the editor with a safe draft",
    handler: async (_args, ctx) => {
      ctx.ui.setEditorText("Safe draft");
      ctx.ui.notify("Safe command ran", "info");
    },
  });
}
`;

test("persists learned terminal-only command compatibility across relaunch", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("extension-command-compatibility-relaunch-workspace");
  await writeProjectExtension(
    workspacePath,
    "compatibility-extension.ts",
    compatibilityExtensionSource,
  );

  const firstHarness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const firstWindow = await firstHarness.firstWindow();
    const workspace = await waitForWorkspaceByPath(firstWindow, workspacePath);
    await createSessionViaIpc(firstWindow, workspacePath, "Relaunch compatibility session");
    await selectSession(firstWindow, "Relaunch compatibility session");
    const session = await waitForSessionByTitle(
      firstWindow,
      workspace.id,
      "Relaunch compatibility session",
    );
    const sessionKey = `${workspace.id}:${session.id}`;
    await expect
      .poll(
        async () =>
          (await getDesktopState(firstWindow)).sessionCommandsBySession[sessionKey]?.some(
            (command) => command.name === "handoff-gui-test",
          ) ?? false,
        { timeout: 15_000 },
      )
      .toBe(true);
    const composer = firstWindow.getByTestId("composer");
    await composer.fill("/handoff-gui-test persist this");
    await composer.press("Enter");
    await expect(firstWindow.getByTestId("composer-error-banner")).toContainText(
      "/handoff-gui-test requires terminal-only custom UI and is not supported in pi-gui yet.",
    );
  } finally {
    await firstHarness.close();
  }

  const secondHarness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const secondWindow = await secondHarness.firstWindow();
    const workspace = await waitForWorkspaceByPath(secondWindow, workspacePath);
    const session = await waitForSessionByTitle(
      secondWindow,
      workspace.id,
      "Relaunch compatibility session",
    );
    await selectSession(secondWindow, "Relaunch compatibility session");
    const sessionKey = `${workspace.id}:${session.id}`;
    await expect
      .poll(
        async () =>
          (await getDesktopState(secondWindow)).sessionCommandsBySession[sessionKey]?.some(
            (command) => command.name === "handoff-gui-test",
          ) ?? false,
        { timeout: 15_000 },
      )
      .toBe(true);
    const composer = secondWindow.getByTestId("composer");
    await composer.fill("/handoff-g");
    await expect(secondWindow.getByTestId("slash-menu")).toContainText("Terminal-only");
  } finally {
    await secondHarness.close();
  }
});
