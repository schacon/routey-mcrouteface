import { expect, test } from "@playwright/test";
import { classifyButError, normalizeButStatus } from "../../electron/platform/gitbutler/but-status";

test("normalizes but status JSON into stacks, branches, commits and changes", () => {
  const status = normalizeButStatus({
    uncommittedChanges: [{ cliId: "vqp", filePath: "src/a.ts", changeType: "modified" }],
    stacks: [
      {
        cliId: "r0",
        assignedChanges: [{ cliId: "abc", filePath: "src/b.ts", changeType: "added" }],
        branches: [
          {
            cliId: "ro",
            name: "routey",
            branchStatus: "completelyUnpushed",
            commits: [
              {
                cliId: "mwx",
                commitId: "13c6c54228fe7d803a66e0000dc2642636ddc214",
                message: "Route every turn\n\nLong body",
                authorName: "Scott",
                createdAt: "2026-09-25T09:30:15+00:00",
                conflicted: false,
                futureField: 1,
              },
            ],
            upstreamCommits: [{}, {}],
          },
        ],
      },
    ],
    mergeBase: { commitId: "86416dff", message: "Base commit\nbody" },
    upstreamState: { behind: 3 },
  });
  expect(status).toEqual({
    unassignedChanges: [{ id: "vqp", path: "src/a.ts", changeType: "modified" }],
    stacks: [
      {
        id: "r0",
        assignedChanges: [{ id: "abc", path: "src/b.ts", changeType: "added" }],
        branches: [
          {
            id: "ro",
            name: "routey",
            status: "completelyUnpushed",
            commits: [
              {
                id: "mwx",
                sha: "13c6c54228fe7d803a66e0000dc2642636ddc214",
                title: "Route every turn",
                authorName: "Scott",
                createdAt: "2026-09-25T09:30:15+00:00",
                conflicted: false,
              },
            ],
            upstreamOnlyCommits: 2,
          },
        ],
      },
    ],
    base: { sha: "86416dff", title: "Base commit" },
    behind: 3,
  });
  expect(normalizeButStatus(null)).toEqual({ unassignedChanges: [], stacks: [], behind: 0 });
});

test("classifies the ways but status cannot run", () => {
  expect(classifyButError("spawn but ENOENT", "ENOENT").reason).toBe("not-installed");
  expect(
    classifyButError(
      "Error: No git repository found at .\nPlease run 'but setup' to initialize the project.",
      1,
    ),
  ).toEqual({
    state: "unavailable",
    reason: "not-a-repository",
    message: "No git repository found at .\nPlease run 'but setup' to initialize the project.",
  });
  expect(
    classifyButError(
      "Error: No target branch is configured and none could be inferred. Run `but config target <remote>/<branch>` to configure one.",
      1,
    ).reason,
  ).toBe("not-set-up");
  expect(classifyButError("Error: something else broke", 1)).toMatchObject({
    reason: "error",
    message: "something else broke",
  });
});
