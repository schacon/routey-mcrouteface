import { join } from "node:path";
import {
  SessionManager,
  SettingsManager,
  createExtensionRuntime,
  createAgentSession,
  ModelRuntime,
  type CreateAgentSessionOptions,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import type { SessionModelSelection, WorkspaceRef } from "@pi-gui/session-driver";
import { messageText as sessionMessageText } from "./session-supervisor-utils.js";

export interface GenerateThreadTitleOptions {
  readonly prompt: string;
  readonly model?: SessionModelSelection;
  readonly thinkingLevel?: string;
  readonly signal?: AbortSignal;
}

interface ThreadTitleGeneratorDeps {
  readonly agentDir: string;
}

const MAX_THREAD_TITLE_LENGTH = 36;
const THREAD_TITLE_SYSTEM_PROMPT = [
  "You generate concise UI thread titles for a coding assistant.",
  "Return only the title text.",
  "Keep it short, usually 2 to 5 words.",
  "Use the same language as the source message.",
  "Preserve ticket IDs exactly.",
  "No markdown, quotes, labels, or trailing punctuation.",
].join("\n");

const SESSION_PURPOSE_SYSTEM_PROMPT = [
  "You summarize what a user is trying to accomplish in a session with an AI assistant.",
  "Return one or two plain sentences describing the goal, not the conversation.",
  "Use the same language as the source messages.",
  "No markdown, quotes, or labels.",
].join("\n");

const MAX_SESSION_PURPOSE_LENGTH = 280;

export async function generateThreadTitle(
  workspace: WorkspaceRef,
  options: GenerateThreadTitleOptions,
  deps: ThreadTitleGeneratorDeps,
): Promise<string | null> {
  const prompt = options.prompt.trim();
  if (!prompt) {
    return null;
  }
  const text = await generateOneShotText(
    workspace,
    { ...options, prompt: buildTitlePrompt(prompt) },
    THREAD_TITLE_SYSTEM_PROMPT,
    deps,
  );
  return text === null ? null : normalizeThreadTitle(text);
}

export interface GenerateSessionPurposeOptions {
  /** The session's user messages so far, oldest first. */
  readonly userMessages: readonly string[];
  readonly model?: SessionModelSelection;
  readonly signal?: AbortSignal;
}

/** One or two sentences on what a session is for, for Routey's Info panel. */
export async function generateSessionPurpose(
  workspace: WorkspaceRef,
  options: GenerateSessionPurposeOptions,
  deps: ThreadTitleGeneratorDeps,
): Promise<string | null> {
  const messages = options.userMessages.map((message) => message.trim()).filter(Boolean);
  if (messages.length === 0) {
    return null;
  }
  const prompt = [
    "Summarize the goal of this session from the user's messages.",
    "",
    ...messages.map((message) => `<user_message>\n${message.slice(0, 2000)}\n</user_message>`),
  ].join("\n");
  const text = await generateOneShotText(
    workspace,
    {
      prompt,
      ...(options.model ? { model: options.model } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    },
    SESSION_PURPOSE_SYSTEM_PROMPT,
    deps,
  );
  const normalized = text?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > MAX_SESSION_PURPOSE_LENGTH
    ? `${normalized.slice(0, MAX_SESSION_PURPOSE_LENGTH - 3).trimEnd()}...`
    : normalized;
}

/** Runs one tool-less, in-memory prompt and returns the assistant's text. */
async function generateOneShotText(
  workspace: WorkspaceRef,
  options: GenerateThreadTitleOptions,
  systemPrompt: string,
  deps: ThreadTitleGeneratorDeps,
): Promise<string | null> {
  const prompt = options.prompt;
  if (options.signal?.aborted) {
    return null;
  }

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const resourceLoader = createOneShotResourceLoader(systemPrompt);
  const modelRuntime = await ModelRuntime.create({
    authPath: join(deps.agentDir, "auth.json"),
    modelsPath: join(deps.agentDir, "models.json"),
    refreshOnCreate: false,
  });
  await modelRuntime.refresh({ allowNetwork: false });

  const createOptions: CreateAgentSessionOptions = {
    cwd: workspace.path,
    agentDir: deps.agentDir,
    modelRuntime,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(),
    tools: [],
  };
  if (options.model) {
    const selectedModel = modelRuntime.getModel(options.model.provider, options.model.modelId);
    if (!selectedModel) {
      return null;
    }
    createOptions.model = selectedModel;
  }
  if (options.thinkingLevel) {
    createOptions.thinkingLevel = options.thinkingLevel as NonNullable<
      CreateAgentSessionOptions["thinkingLevel"]
    >;
  }

  const { session } = await createAgentSession(createOptions);
  const handleAbort = () => {
    void session.abort().catch(() => undefined);
  };
  options.signal?.addEventListener("abort", handleAbort, { once: true });
  try {
    if (options.signal?.aborted) {
      return null;
    }
    if (!session.model) {
      return null;
    }
    const auth = await session.modelRuntime.getAuth(session.model.provider);
    if (!auth?.auth.apiKey) {
      return null;
    }

    await session.prompt(prompt, { source: "interactive" });
    return extractLastAssistantText(session);
  } finally {
    options.signal?.removeEventListener("abort", handleAbort);
    session.dispose();
  }
}

function createOneShotResourceLoader(systemPrompt: string): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

function buildTitlePrompt(prompt: string): string {
  return [
    "Generate a short UI thread title for the user's first message.",
    "Return only the title.",
    "",
    "<user_message>",
    prompt,
    "</user_message>",
  ].join("\n");
}

function extractLastAssistantText(session: { messages: readonly unknown[] }): string {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index];
    if (!isRecord(message) || message.role !== "assistant") {
      continue;
    }
    return sessionMessageText(message);
  }
  return "";
}

function normalizeThreadTitle(title: string): string | null {
  let normalized = title.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  normalized = normalized.replace(/^title\s*:\s*/i, "").trim();
  normalized = stripWrappingQuotes(normalized);
  normalized = normalized.replace(/[.?!,:;]+$/g, "").trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > MAX_THREAD_TITLE_LENGTH) {
    normalized = `${normalized.slice(0, MAX_THREAD_TITLE_LENGTH - 3).trimEnd()}...`;
  }

  return normalized || null;
}

function stripWrappingQuotes(value: string): string {
  let current = value.trim();
  while (current.length >= 2) {
    const first = current[0];
    const last = current[current.length - 1];
    if (
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === "`" && last === "`")
    ) {
      current = current.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
