import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  commitAllInGitRepo,
  initGitRepo,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
  seedNamedTextSessionFixture,
  selectSession,
  waitForTimelineLayout,
} from "../helpers/electron-app";

const TASK_A = "Workbench task A";
const TASK_B = "Workbench task B";
type ToolName = "Files" | "Review" | "Terminal";

// Real Pi history is fixture setup. All workspace, task, tab, and draft changes
// below use the visible app, with no provider requests or injected runtime events.
async function prepareWorkspace() {
  const userDataDir = await makeUserDataDir();
  const agentDir = join(userDataDir, "agent");
  const workspacePath = await makeWorkspace("workbench-tabs");
  await writeFile(join(workspacePath, "alpha.txt"), "Alpha document\nAlpha target line\n");
  await writeFile(join(workspacePath, "beta.txt"), "Beta document\nBeta target line\n");
  await initGitRepo(workspacePath);
  await commitAllInGitRepo(workspacePath, "Workbench fixture");
  await writeFile(
    join(workspacePath, "alpha.txt"),
    "Alpha document\nAlpha target line\nUncommitted workspace edit\n",
  );
  await seedAgentDir(agentDir, { withOpenAiAuth: false });
  for (const [title, file] of [
    [TASK_A, "alpha.txt"],
    [TASK_B, "beta.txt"],
  ] as const) {
    await seedNamedTextSessionFixture(agentDir, workspacePath, {
      title,
      userText: `Inspect ${file}`,
      assistantText: `Open ${file}:2 for the result.`,
    });
  }
  return { userDataDir, agentDir, workspacePath };
}

async function expectActiveTool(window: Page, name: ToolName): Promise<void> {
  await expect(window.getByTestId("workbench")).toBeVisible();
  await expect(
    window.getByRole("tablist", { name: "Workspace tools" }).getByRole("tab", {
      name,
      exact: true,
    }),
  ).toHaveAttribute("aria-selected", "true");
}

test("assistant file links keep the opened document with their originating task", async () => {
  const fixture = await prepareWorkspace();
  const harness = await launchDesktop(fixture.userDataDir, {
    agentDir: fixture.agentDir,
    initialWorkspaces: [fixture.workspacePath],
    testMode: "background",
  });
  try {
    const window = await harness.firstWindow();
    await selectSession(window, TASK_A);
    await window.getByTestId("toggle-side-panel").click();
    await waitForTimelineLayout(window);
    await window.getByTestId("workspace-file-link").filter({ hasText: "alpha.txt:2" }).click();
    await expectActiveTool(window, "Files");
    await expect(window.getByTestId("file-line-mark")).toContainText("Alpha target line");
    await selectSession(window, TASK_B);
    await waitForTimelineLayout(window);
    await window.getByTestId("workspace-file-link").filter({ hasText: "beta.txt:2" }).click();
    await expectActiveTool(window, "Files");
    await expect(window.getByTestId("file-line-mark")).toContainText("Beta target line");
    await expect(window.getByTestId("file-workbench-tab")).toHaveCount(1);
    await expect(window.getByTestId("file-workbench-tab")).toContainText("beta.txt");
    await selectSession(window, TASK_A);
    await expectActiveTool(window, "Files");
    await expect(window.getByTestId("file-workbench-tab")).toHaveCount(1);
    await expect(window.getByTestId("file-workbench-tab")).toContainText("alpha.txt");
    await expect(window.getByTestId("file-line-mark")).toContainText("Alpha target line");
  } finally {
    await harness.close();
  }
});
