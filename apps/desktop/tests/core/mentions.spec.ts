import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  commitAllInGitRepo,
  createNamedThread,
  desktopShortcut,
  initGitRepo,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
} from "../helpers/electron-app";

test("shows workspace file mentions from the composer and inserts the selected file", async () => {
  test.setTimeout(30_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("mention-workspace");
  await initGitRepo(workspacePath);
  await commitAllInGitRepo(workspacePath, "init");
  await mkdir(join(workspacePath, "src"), { recursive: true });
  await writeFile(join(workspacePath, "src", "App.tsx"), "export default App;\n", "utf8");
  await commitAllInGitRepo(workspacePath, "add src");

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Mention test");

    const composer = window.getByTestId("composer");
    await composer.click();
    await composer.pressSequentially("@");

    const mentionMenu = window.getByTestId("mention-menu");
    await expect(mentionMenu).toBeVisible();
    await expect(mentionMenu.locator(".mention-menu__section-title")).toHaveText([
      "Extensions",
      "Files",
    ]);
    await expect(mentionMenu.locator(".mention-menu__item")).toHaveCount(4);
    await expect(mentionMenu).toContainText("Thread orchestration");
    await expect(mentionMenu).toContainText("Scheduled tasks");

    await composer.pressSequentially("README");
    await expect(mentionMenu.locator(".mention-menu__item")).toHaveCount(1);
    await expect(mentionMenu.locator(".mention-menu__filename")).toContainText("README.md");

    await composer.press("Tab");
    await expect(mentionMenu).toHaveCount(0);
    await expect(composer).toHaveValue("@README.md ");

    await composer.click();
    await composer.press(desktopShortcut("A"));
    await composer.press("Backspace");
    await expect(composer).toHaveValue("");
    await composer.pressSequentially("@src");
    await expect(mentionMenu).toBeVisible();
    await composer.press("Escape");
    await expect(mentionMenu).toHaveCount(0);
    await expect(composer).toHaveValue("@src");
  } finally {
    await harness.close();
  }
});
