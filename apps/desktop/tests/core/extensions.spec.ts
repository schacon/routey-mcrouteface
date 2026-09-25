import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createSessionViaIpc,
  getDesktopState,
  launchDesktop,
  makeGitWorkspace,
  makeUserDataDir,
  makeWorkspace,
  writeProjectExtension,
} from "../helpers/electron-app";

const extensionSource = String.raw`
export default function demoExtension(pi) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setTitle("Extension Surface");
    ctx.ui.setStatus("demo-status", "Demo ready");
    ctx.ui.setWidget("demo-widget", ["Demo widget line"]);
    ctx.ui.setWidget("demo-widget-below", ["Below widget line"], { placement: "belowEditor" });
  });

  pi.registerCommand("settings", {
    description: "Runtime settings command",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Runtime settings command", "info");
    },
  });

  pi.registerCommand("prefill-demo", {
    description: "Prefill the composer",
    handler: async (_args, ctx) => {
      ctx.ui.setEditorText("Prefilled from extension");
      ctx.ui.notify("Composer prefilled", "info");
    },
  });
}
`;

const customFallbackExtensionSource = String.raw`
export default function customFallbackExtension(pi) {
  pi.registerCommand("read-mode-test", {
    description: "Terminal-only read mode",
    handler: async (_args, ctx) => {
      let result;
      try {
        result = await ctx.ui.custom((_tui, _theme, _kb, done) => ({
          render: () => ["read-mode"],
          handleInput: () => done({ text: "should-not-send" }),
        }));
      } catch {
        ctx.ui.notify("Read mode ignored", "info");
        return;
      }
      if (result?.text) {
        pi.sendUserMessage(result.text);
        return;
      }
      ctx.ui.notify("Read mode ignored", "info");
    },
  });
}
`;

const newSessionExtensionSource = String.raw`
export default function newSessionExtension(pi) {
  pi.registerCommand("spawn-child", {
    description: "Create a child session with a draft",
    handler: async (_args, ctx) => {
      const parentSession = ctx.sessionManager.getSessionFile();
      const result = await ctx.newSession({
        ...(parentSession ? { parentSession } : {}),
        withSession: async (nextCtx) => {
          nextCtx.ui.setEditorText("Child draft");
        },
      });
      if (result.cancelled) {
        ctx.ui.notify("Child session cancelled", "info");
        return;
      }
    },
  });
}
`;

const packageExtensionSource = String.raw`
export default function packageNamedExtension(pi) {
  pi.registerCommand("package-named-command", {
    description: "Command from a package-backed extension",
    handler: async (_args, ctx) => {
      ctx.ui.notify("package-backed extension", "info");
    },
  });
}
`;

async function writePackageBackedExtension(
  packagePath: string,
  options: {
    readonly name?: string;
    readonly version?: string;
    readonly displayName?: string;
    readonly description?: string;
  } = {},
) {
  const extensionDir = join(packagePath, "extension");
  await mkdir(extensionDir, { recursive: true });
  await writeFile(
    join(packagePath, "package.json"),
    `${JSON.stringify(
      {
        name: options.name ?? "unrelated-package-name",
        ...(options.version ? { version: options.version } : {}),
        ...(options.displayName ? { displayName: options.displayName } : {}),
        ...(options.description ? { description: options.description } : {}),
        type: "module",
        pi: {
          extensions: ["./extension/index.ts"],
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(extensionDir, "index.ts"), `${packageExtensionSource}\n`);
}

async function installProjectNpmBackedExtension(
  workspacePath: string,
  packageName: string,
  version: string,
) {
  const packagePath = join(workspacePath, ".pi", "npm", "node_modules", packageName);
  await writePackageBackedExtension(packagePath, {
    name: packageName,
    version,
    description: "Project npm package extension",
  });
  const settingsPath = join(workspacePath, ".pi", "settings.json");
  await writeFile(
    settingsPath,
    `${JSON.stringify(
      {
        packages: [`npm:${packageName}@${version}`],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return packagePath;
}

async function installProjectGitBackedExtension(
  workspacePath: string,
  source: string,
  host: string,
  owner: string,
  repo: string,
) {
  const packagePath = join(workspacePath, ".pi", "git", host, owner, repo);
  await writePackageBackedExtension(packagePath, {
    name: repo,
    description: "Project git package extension",
  });
  const settingsPath = join(workspacePath, ".pi", "settings.json");
  await writeFile(
    settingsPath,
    `${JSON.stringify(
      {
        packages: [source],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

test("shows extensions above files in @ mentions and enables disabled extensions from the composer", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeGitWorkspace("extension-mention-workspace");
  const extensionPath = await writeProjectExtension(
    workspacePath,
    "demo-extension.ts",
    extensionSource,
  );

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createSessionViaIpc(window, workspacePath, "Mention extension surface");
    const composer = window.getByTestId("composer");
    await expect(composer).toBeVisible();

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const workspace = state.workspaces.find((entry) => entry.path === workspacePath);
        return Boolean(
          workspace &&
          state.runtimeByWorkspace[workspace.id]?.extensions.some(
            (entry) => entry.path === extensionPath,
          ),
        );
      })
      .toBe(true);

    await window.evaluate(
      async ({ targetWorkspacePath, targetExtensionPath }) => {
        const app = globalThis.window.piApp;
        if (!app) {
          throw new Error("piApp IPC bridge is unavailable");
        }
        const state = await app.getState();
        const workspace = state.workspaces.find((entry) => entry.path === targetWorkspacePath);
        if (!workspace) {
          throw new Error(`Workspace not found: ${targetWorkspacePath}`);
        }
        await app.setExtensionEnabled(workspace.id, targetExtensionPath, false);
      },
      { targetWorkspacePath: workspacePath, targetExtensionPath: extensionPath },
    );

    await composer.fill("@");
    const mentionMenu = window.getByTestId("mention-menu");
    await expect(mentionMenu).toBeVisible();
    await expect(mentionMenu.locator(".mention-menu__section-title")).toHaveText([
      "Extensions",
      "Files",
    ]);
    await expect(mentionMenu.locator(".mention-menu__section").first()).toContainText(
      "demo-extension",
    );
    await expect(mentionMenu.locator(".mention-menu__section").first()).toContainText("Disabled");
    await expect(
      mentionMenu
        .locator(".mention-menu__section")
        .first()
        .getByRole("button", { name: /Enable demo-extension/ }),
    ).toBeVisible();

    await composer.fill("@demo");
    await expect(mentionMenu.locator(".mention-menu__section-title").first()).toHaveText(
      "Extensions",
    );
    await expect(mentionMenu.locator(".mention-menu__section").first()).toContainText(
      "demo-extension",
    );
    await mentionMenu
      .locator(".mention-menu__section")
      .first()
      .getByRole("button", { name: /Enable demo-extension/ })
      .click();
    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const workspace = state.workspaces.find((entry) => entry.path === workspacePath);
        const extension = workspace
          ? state.runtimeByWorkspace[workspace.id]?.extensions.find(
              (entry) => entry.path === extensionPath,
            )
          : undefined;
        return extension?.enabled ?? false;
      })
      .toBe(true);
    await expect(composer).toHaveValue("@demo-extension ");

    // "READ" also matches the built-in Thread orchestration extension.
    await composer.fill("@README");
    await expect(mentionMenu).toBeVisible();
    await expect(mentionMenu.locator(".mention-menu__section-title")).toHaveText(["Files"]);
    await expect(mentionMenu.locator(".mention-menu__filename")).toContainText("README.md");
    await composer.press("Tab");
    await expect(composer).toHaveValue("@README.md ");
  } finally {
    await harness.close();
  }
});

test("inserts npm package extension mentions without source prefixes or pinned versions", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeGitWorkspace("extension-npm-mention-workspace");
  const packageName = "pi-read-mode";
  const packageVersion = "1.2.3";
  await installProjectNpmBackedExtension(workspacePath, packageName, packageVersion);

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createSessionViaIpc(window, workspacePath, "Npm extension mention surface");
    const composer = window.getByTestId("composer");
    await expect(composer).toBeVisible();

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const workspace = state.workspaces.find((entry) => entry.path === workspacePath);
        return workspace
          ? state.runtimeByWorkspace[workspace.id]?.extensions.some(
              (entry) => entry.sourceInfo.source === `npm:${packageName}@${packageVersion}`,
            )
          : false;
      })
      .toBe(true);

    await composer.fill("@read");
    const mentionMenu = window.getByTestId("mention-menu");
    await expect(mentionMenu).toBeVisible();
    await expect(mentionMenu.locator(".mention-menu__section-title").first()).toHaveText(
      "Extensions",
    );
    await expect(mentionMenu.locator(".mention-menu__section").first()).toContainText(packageName);

    await composer.press("Tab");
    await expect(composer).toHaveValue(`@${packageName} `);
  } finally {
    await harness.close();
  }
});

test("preserves scoped npm package names in extension mentions", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeGitWorkspace("extension-scoped-npm-mention-workspace");
  const packageName = "@acme/pi-read-mode";
  const packageVersion = "1.2.3";
  await installProjectNpmBackedExtension(workspacePath, packageName, packageVersion);

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createSessionViaIpc(window, workspacePath, "Scoped npm extension mention surface");
    const composer = window.getByTestId("composer");
    await expect(composer).toBeVisible();

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const workspace = state.workspaces.find((entry) => entry.path === workspacePath);
        return workspace
          ? state.runtimeByWorkspace[workspace.id]?.extensions.some(
              (entry) => entry.sourceInfo.source === `npm:${packageName}@${packageVersion}`,
            )
          : false;
      })
      .toBe(true);

    await composer.fill("@acme");
    const mentionMenu = window.getByTestId("mention-menu");
    await expect(mentionMenu).toBeVisible();
    await expect(mentionMenu.locator(".mention-menu__section-title").first()).toHaveText(
      "Extensions",
    );

    await composer.press("Tab");
    await expect(composer).toHaveValue("@acme-pi-read-mode ");
  } finally {
    await harness.close();
  }
});

test("inserts git package extension mentions from the resolved package root", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeGitWorkspace("extension-git-mention-workspace");
  const source = "ssh://git@github.com/acme/repo.git@main";
  const repo = "repo";
  await installProjectGitBackedExtension(workspacePath, source, "github.com", "acme", repo);

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createSessionViaIpc(window, workspacePath, "Git extension mention surface");
    const composer = window.getByTestId("composer");
    await expect(composer).toBeVisible();

    await expect
      .poll(async () => {
        const state = await getDesktopState(window);
        const workspace = state.workspaces.find((entry) => entry.path === workspacePath);
        return workspace
          ? state.runtimeByWorkspace[workspace.id]?.extensions.some(
              (entry) => entry.sourceInfo.source === source,
            )
          : false;
      })
      .toBe(true);

    await composer.fill("@repo");
    const mentionMenu = window.getByTestId("mention-menu");
    await expect(mentionMenu).toBeVisible();
    await expect(mentionMenu.locator(".mention-menu__section-title").first()).toHaveText(
      "Extensions",
    );
    await expect(mentionMenu.locator(".mention-menu__section").first()).toContainText(repo);

    await composer.press("Tab");
    await expect(composer).toHaveValue(`@${repo} `);
  } finally {
    await harness.close();
  }
});

test("degrades terminal-only custom extension ui without sending stray messages", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("extensions-custom-fallback-workspace");
  await writeProjectExtension(
    workspacePath,
    "custom-fallback-extension.ts",
    customFallbackExtensionSource,
  );

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createSessionViaIpc(window, workspacePath, "Custom fallback session");

    const composer = window.getByTestId("composer");
    await composer.fill("/read-mode-test ");
    await composer.press("Enter");

    await expect(window.getByTestId("extension-dialog")).toHaveCount(0);
    await expect(window.locator(".timeline")).toContainText("Read mode ignored");
    await expect(window.locator(".timeline")).not.toContainText("should-not-send");
    await expect(composer).toHaveValue("");
  } finally {
    await harness.close();
  }
});

test("keeps a single subscription path when an extension creates a child session and prefills the draft", async () => {
  test.setTimeout(60_000);
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("extensions-new-session-workspace");
  await writeProjectExtension(workspacePath, "new-session-extension.ts", newSessionExtensionSource);

  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });

  try {
    const window = await harness.firstWindow();
    await createSessionViaIpc(window, workspacePath, "Parent session");

    const beforeState = await getDesktopState(window);
    const beforeSelectedSessionId = beforeState.selectedSessionId;
    const resumedCountBefore = await window.getByText("Resumed session", { exact: true }).count();

    const composer = window.getByTestId("composer");
    await composer.fill("/spawn-child ");
    await composer.press("Enter");

    await expect
      .poll(async () => {
        const nextState = await getDesktopState(window);
        return nextState.selectedSessionId;
      })
      .not.toBe(beforeSelectedSessionId);
    await expect(composer).toHaveValue("Child draft");
    await expect(window.getByText("Resumed session", { exact: true })).toHaveCount(
      resumedCountBefore,
    );
  } finally {
    await harness.close();
  }
});
