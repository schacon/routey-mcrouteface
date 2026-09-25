import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { PiSdkDriver } from "@pi-gui/pi-sdk-driver";
import {
  createNamedThread,
  fireDueScheduledTasks,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  seedAgentDir,
} from "../helpers/electron-app";

test("firing a due existing-thread task labels the user bubble and shows a chip", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("scheduled-fire");
  const agentDir = join(userDataDir, "agent");
  await seedAgentDir(agentDir, { withOpenAiAuth: false, withDefaultModel: false });
  const harness = await launchDesktop(userDataDir, {
    agentDir,
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });
  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Fire target");
    const composerDraft = "keep this unsent draft";
    await window.getByTestId("composer").fill(composerDraft);
    await expect
      .poll(async () => (await getDesktopState(window)).composerDraft)
      .toBe(composerDraft);
    const before = await getDesktopState(window);
    const workspaceId = before.selectedWorkspaceId;
    const sessionId = before.selectedSessionId;
    expect(workspaceId).toBeTruthy();
    expect(sessionId).toBeTruthy();
    await window.evaluate(
      async ({ targetWorkspaceId, targetSessionId }) => {
        const app = globalThis.window.piApp;
        if (!app) {
          throw new Error("piApp IPC bridge is unavailable");
        }
        await app.createScheduledTask({
          title: "Due ping",
          instruction: "Say ping from scheduled task",
          schedule: { kind: "interval", everyMs: 60_000 },
          target: {
            kind: "existing-thread",
            workspaceId: targetWorkspaceId,
            sessionId: targetSessionId,
          },
        });
      },
      { targetWorkspaceId: workspaceId, targetSessionId: sessionId },
    );
    await expect.poll(async () => (await getDesktopState(window)).scheduledTasks).toHaveLength(1);
    await fireDueScheduledTasks(harness, new Date(Date.now() + 10 * 60_000).toISOString());
    await expect(window.getByTestId("sent-by-scheduled-task")).toBeVisible({ timeout: 15_000 });
    await expect(window.getByTestId("transcript")).toContainText("Say ping from scheduled task");
    await expect(window.getByTestId("composer")).toHaveValue(composerDraft);
    await expect(window.getByTestId("scheduled-task-chip")).toBeVisible();
    const after = await getDesktopState(window);
    expect(after.selectedSessionId).toBe(sessionId);
    expect(after.composerDraft).toBe(composerDraft);
    expect(after.scheduledTasks[0]?.runs[0]?.sessionId).toBe(sessionId);
  } finally {
    await harness.close();
  }
});

test("a scheduled run can use the scheduled-task tools while it is still running", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("scheduled-fire-tools");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });
  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Fire target");
    const state = await getDesktopState(window);
    await window.evaluate(
      async (target) => {
        const app = globalThis.window.piApp;
        if (!app) {
          throw new Error("piApp IPC bridge is unavailable");
        }
        await app.createScheduledTask({
          title: "Self-checking task",
          instruction: "List your scheduled tasks",
          schedule: { kind: "interval", everyMs: 60_000 },
          target: { kind: "existing-thread", ...target },
        });
      },
      { workspaceId: state.selectedWorkspaceId, sessionId: state.selectedSessionId },
    );
    // The fired run calls list_scheduled_tasks before it finishes, as an agent would.
    const listedDuringRun = await harness.electronApp.evaluate(
      async (_, input) => {
        type ToolHook = (input: {
          toolName: string;
          sessionRef: { workspaceId: string; sessionId: string };
          params: Record<string, unknown>;
        }) => Promise<{ content: readonly { text?: string }[] }>;
        const hooks = (
          globalThis as {
            __PI_APP_TEST_HOOKS?: {
              runScheduledTaskRuntimeTool?: ToolHook;
              fireDueScheduledTasks?: (nowIso?: string) => Promise<unknown>;
            };
          }
        ).__PI_APP_TEST_HOOKS;
        const runTool = hooks?.runScheduledTaskRuntimeTool;
        const fire = hooks?.fireDueScheduledTasks;
        if (!runTool || !fire) {
          throw new Error("Scheduled-task test hooks are unavailable");
        }
        const { createRequire } = process.getBuiltinModule("module");
        const { PiSdkDriver: Driver } = createRequire(input.entry)("@pi-gui/pi-sdk-driver") as {
          PiSdkDriver: typeof PiSdkDriver;
        };
        let listed = "";
        Driver.prototype.sendUserMessage = async function (ref) {
          const result = await runTool({
            toolName: "list_scheduled_tasks",
            sessionRef: ref,
            params: {},
          });
          listed = result.content[0]?.text ?? "";
        };
        await Promise.race([
          fire(input.nowIso),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Scheduled run blocked on its own tools")), 10_000),
          ),
        ]);
        return listed;
      },
      {
        entry: resolve("apps/desktop/out/main/main.js"),
        nowIso: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
    );
    expect(listedDuringRun).toContain("Self-checking task");
    const after = await getDesktopState(window);
    expect(after.scheduledTasks[0]?.runs.map((run) => run.outcome)).toEqual(["started"]);
  } finally {
    await harness.close();
  }
});

test("a second active bind to the same thread is rejected", async () => {
  test.setTimeout(45_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("scheduled-bind");
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });
  try {
    const window = await harness.firstWindow();
    await createNamedThread(window, "Bind target");
    const state = await getDesktopState(window);
    const payload = {
      title: "First bind",
      instruction: "First",
      schedule: { kind: "interval" as const, everyMs: 60_000 },
      target: {
        kind: "existing-thread" as const,
        workspaceId: state.selectedWorkspaceId,
        sessionId: state.selectedSessionId,
      },
    };
    await window.evaluate(async (input) => {
      const app = globalThis.window.piApp;
      if (!app) {
        throw new Error("piApp IPC bridge is unavailable");
      }
      await app.createScheduledTask(input);
    }, payload);
    const second = await window.evaluate(async (input) => {
      const app = globalThis.window.piApp;
      if (!app) {
        throw new Error("piApp IPC bridge is unavailable");
      }
      return app.createScheduledTask({ ...input, title: "Second bind", instruction: "Second" });
    }, payload);
    expect(second.lastError).toMatch(/already has a scheduled task/i);
    expect(second.scheduledTasks).toHaveLength(1);
  } finally {
    await harness.close();
  }
});
