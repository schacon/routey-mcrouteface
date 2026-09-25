import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";

/**
 * The Ollama endpoint: the base URL of pi's `ollama` provider (or any provider
 * on port 11434) in models.json, without its OpenAI-compatible `/v1` suffix.
 */
export async function ollamaBaseUrl(): Promise<string> {
  const override = process.env.ROUTEY_OLLAMA_URL?.trim();
  if (override) return override.replace(/\/$/, "");
  const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
  try {
    const parsed = JSON.parse(await readFile(join(agentDir, "models.json"), "utf8")) as {
      providers?: Record<string, { baseUrl?: unknown }>;
    };
    const providers = Object.entries(parsed.providers ?? {});
    const match =
      providers.find(([id]) => id === "ollama") ??
      providers.find(([, provider]) => String(provider.baseUrl ?? "").includes(":11434"));
    const baseUrl = match?.[1].baseUrl;
    if (typeof baseUrl === "string" && baseUrl.trim()) {
      return baseUrl
        .trim()
        .replace(/\/v1\/?$/, "")
        .replace(/\/$/, "");
    }
  } catch {
    // No models.json or no Ollama provider: use the default endpoint.
  }
  return DEFAULT_OLLAMA_URL;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Ollama did not answer within ${timeoutMs} ms.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Installed model tags, or undefined when Ollama is not reachable. */
export async function listOllamaModels(baseUrl: string): Promise<readonly string[] | undefined> {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/tags`, {}, 1_500);
    if (!response.ok) return undefined;
    const body = (await response.json()) as { models?: { name?: unknown }[] };
    return (body.models ?? []).flatMap((model) =>
      typeof model.name === "string" ? [model.name] : [],
    );
  } catch {
    return undefined;
  }
}

/** One non-streaming chat turn constrained to a JSON schema, with thinking off. */
export async function ollamaChatJson(
  baseUrl: string,
  model: string,
  system: string,
  prompt: string,
  schema: object,
  timeoutMs: number,
): Promise<unknown> {
  const response = await fetchWithTimeout(
    `${baseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: schema,
        keep_alive: "30m",
        options: { temperature: 0, num_predict: 96 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    },
    timeoutMs,
  );
  if (!response.ok) {
    throw new Error(`Ollama ${model} failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { message?: { content?: unknown } };
  if (typeof body.message?.content !== "string")
    throw new Error(`Ollama ${model} returned no text.`);
  return JSON.parse(body.message.content) as unknown;
}

/** Loads a model into memory so the first routed prompt does not pay for it. */
export async function warmOllamaModel(baseUrl: string, model: string): Promise<void> {
  await fetchWithTimeout(
    `${baseUrl}/api/generate`,
    { method: "POST", body: JSON.stringify({ model, prompt: "", keep_alive: "30m" }) },
    60_000,
  );
}

export interface OllamaPullProgress {
  readonly status: string;
  readonly completed?: number;
  readonly total?: number;
}

/** Downloads a model, reporting Ollama's streamed progress lines. */
export async function pullOllamaModel(
  baseUrl: string,
  model: string,
  onProgress: (progress: OllamaPullProgress) => void,
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/pull`, {
    method: "POST",
    body: JSON.stringify({ model, stream: true }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Pulling ${model} failed: ${response.status}`);
  }
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffered += decoder.decode(chunk, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const progress = JSON.parse(line) as OllamaPullProgress & { error?: string };
      if (progress.error) throw new Error(progress.error);
      onProgress(progress);
    }
  }
}
