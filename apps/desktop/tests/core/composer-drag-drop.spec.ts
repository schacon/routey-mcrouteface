import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  dragFilesOverComposer,
  dropFilesOnComposer,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  openNewThread,
  stubNextOpenDialog,
  writeTextFile,
  writeTinyPng,
} from "../helpers/electron-app";

test("existing thread highlights and accepts dropped images and files", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("composer-drop-existing-thread");
  const imagePath = join(workspacePath, "drop-image.png");
  const filePath = join(workspacePath, "notes.txt");
  await writeTinyPng(imagePath);
  await writeTextFile(filePath, "drag-and-drop file sentinel");

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Drop attachments");

    await dragFilesOverComposer(window, [imagePath, filePath], "composer-surface");
    await expect(window.getByTestId("composer-drop-indicator")).toBeVisible();

    await dropFilesOnComposer(window, [imagePath, filePath], "composer-surface");

    await expect(window.getByTestId("composer-drop-indicator")).toHaveCount(0);
    await expect(window.locator(".composer-attachment--image")).toHaveCount(1);
    await expect(window.locator(".composer-attachment--file")).toHaveCount(1);
    await expect(window.locator(".composer-attachment__preview")).toHaveAttribute(
      "title",
      "drop-image.png",
    );
    await expect(window.locator(".composer-attachment__name")).toHaveText("notes.txt");
  } finally {
    await harness.close();
  }
});

test("attach controls add mixed attachments in both composer flows", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("composer-picker-attachments");
  const imagePath = join(workspacePath, "picker-image.png");
  const filePath = join(workspacePath, "picker-notes.txt");
  await writeTinyPng(imagePath);
  await writeTextFile(filePath, "picker file sentinel");

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Picker attachments");

    await stubNextOpenDialog(harness, [imagePath, filePath]);
    await window.getByRole("button", { name: "Attach files" }).click();
    await expect(window.locator(".composer-attachment--image")).toHaveCount(1);
    await expect(window.locator(".composer-attachment--file")).toHaveCount(1);

    await openNewThread(window);
    await window.locator('.new-thread input[type="file"]').setInputFiles([imagePath, filePath]);
    await expect(window.locator(".new-thread .composer-attachment--image")).toHaveCount(1);
    await expect(window.locator(".new-thread .composer-attachment--file")).toHaveCount(1);
  } finally {
    await harness.close();
  }
});
