import { expect, test } from "@playwright/test";
import { localModelProfile } from "../../contracts/local-models";
import { buildLocalModelSetup } from "../../electron/router/local-model-setup";

test("reports Ollama missing and asks for setup when no local model is routed", () => {
  const setup = buildLocalModelSetup({
    ollamaUrl: "http://127.0.0.1:11434",
    installed: undefined,
    roster: [],
    memoryGb: 16,
    pulls: new Map(),
  });
  expect(setup.ollama).toBe("unreachable");
  expect(setup.needsSetup).toBe(true);
  const coder = setup.models.find((model) => model.profile.tag === "qwen3-coder:30b");
  expect(coder?.fits).toBe(false); // needs 32 GB
});

test("matches installed variants and routed models to catalog entries", () => {
  const setup = buildLocalModelSetup({
    ollamaUrl: "http://127.0.0.1:11434",
    installed: ["gemma4:e4b-it-qat", "qwen3.5:9b-cap8k", "qwen3.8:27b-max"],
    roster: [
      {
        provider: "ollama",
        modelId: "gemma4:e4b-it-qat",
        tier: "local",
        capabilities: ["general"],
        goodAt: "",
      },
    ],
    memoryGb: 128,
    pulls: new Map([
      ["qwen3-coder:30b", { state: "pulling", status: "pulling", completed: 5, total: 10 }],
    ]),
  });
  const byTag = new Map(setup.models.map((model) => [model.profile.tag, model]));
  expect(setup.needsSetup).toBe(false);
  expect(byTag.get("gemma4:e4b-it-qat")).toMatchObject({
    installedTag: "gemma4:e4b-it-qat",
    routed: true,
  });
  expect(byTag.get("qwen3.5:9b")).toMatchObject({
    installedTag: "qwen3.5:9b-cap8k",
    routed: false,
  });
  expect(byTag.get("qwen3.8:27b")?.installedTag).toBe("qwen3.8:27b-max");
  expect(byTag.get("qwen3-coder:30b")?.pull).toMatchObject({ state: "pulling", completed: 5 });
  expect(localModelProfile("qwen3.5:4b-cap8k")?.tag).toBe("qwen3.5:4b");
});
