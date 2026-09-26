import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import type { SpecialtyEngineRef } from "../../contracts/specialties";
import { findCommand, MFLUX_COMMANDS, MLX_AUDIO_COMMANDS } from "./specialty-engines";

const run = promisify(execFile);

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

function openRouterHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://github.com/schacon/routey-mcrouteface",
    "X-OpenRouter-Title": "Routey McRouteface",
  };
}
/** Local generation can take minutes on the first run while weights download. */
const LOCAL_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_BUFFER = 16 * 1024 * 1024;

export interface ImageData {
  readonly data: string;
  readonly mimeType: string;
}

export interface GeneratedImages {
  readonly files: readonly string[];
  readonly images: readonly ImageData[];
  readonly text?: string;
}

/** A file name no earlier output uses, like `routey-image-2026-09-26-1.png`. */
function outputName(prefix: string, extension: string, index = 0): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${stamp}${index > 0 ? `-${index}` : ""}.${extension}`;
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

async function requireCommand(name: string, install: string): Promise<string> {
  const path = await findCommand(name);
  if (!path) throw new Error(`${name} is not installed. Install it with: ${install}`);
  return path;
}

export async function generateImages(input: {
  readonly engine: SpecialtyEngineRef;
  readonly prompt: string;
  readonly referenceImages: readonly ImageData[];
  readonly outputDir: string;
  readonly openRouterKey?: string;
  readonly signal?: AbortSignal;
}): Promise<GeneratedImages> {
  await mkdir(input.outputDir, { recursive: true });
  if (input.engine.runtime === "openrouter") {
    if (!input.openRouterKey) throw new Error("Sign in to OpenRouter to generate images.");
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: openRouterHeaders(input.openRouterKey),
      body: JSON.stringify({
        model: input.engine.modelId,
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: input.prompt },
              ...input.referenceImages.map((image) => ({
                type: "image_url",
                image_url: { url: `data:${image.mimeType};base64,${image.data}` },
              })),
            ],
          },
        ],
      }),
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const body = (await response.json()) as {
      choices?: {
        message?: {
          content?: unknown;
          images?: { image_url?: string | { url?: string } }[];
        };
      }[];
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(body.error?.message ?? `OpenRouter returned ${response.status}.`);
    }
    const message = body.choices?.[0]?.message;
    const images = (message?.images ?? []).flatMap((image) => {
      const url = typeof image.image_url === "string" ? image.image_url : image.image_url?.url;
      const match = url?.match(/^data:([^;]+);base64,(.+)$/);
      return match?.[1] && match[2] ? [{ mimeType: match[1], data: match[2] }] : [];
    });
    if (images.length === 0) throw new Error(`${input.engine.modelId} returned no image.`);
    const files: string[] = [];
    for (const [index, image] of images.entries()) {
      const file = join(
        input.outputDir,
        outputName("routey-image", extensionFor(image.mimeType), index),
      );
      await writeFile(file, Buffer.from(image.data, "base64"));
      files.push(file);
    }
    const text = typeof message?.content === "string" ? message.content.trim() : "";
    return {
      files,
      images,
      ...(text ? { text } : {}),
    };
  }
  if (input.engine.runtime === "mflux") {
    const commandName = MFLUX_COMMANDS[input.engine.modelId];
    if (!commandName) throw new Error(`mflux cannot run ${input.engine.modelId}.`);
    if (input.referenceImages.length > 0) {
      throw new Error("The local image model only generates new images; pick a hosted editor.");
    }
    const command = await requireCommand(commandName, "uv tool install --upgrade mflux");
    const file = join(input.outputDir, outputName("routey-image", "png"));
    await run(
      command,
      [
        "--prompt",
        input.prompt,
        "--width",
        "1024",
        "--height",
        "1024",
        "--steps",
        "9",
        "-q",
        "8",
        "--output",
        file,
      ],
      {
        timeout: LOCAL_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        ...(input.signal ? { signal: input.signal } : {}),
      },
    );
    const data = (await readFile(file)).toString("base64");
    return { files: [file], images: [{ data, mimeType: "image/png" }] };
  }
  throw new Error(`${input.engine.runtime} cannot generate images.`);
}

const AUDIO_FORMATS: Readonly<Record<string, string>> = {
  ".wav": "wav",
  ".mp3": "mp3",
  ".aiff": "aiff",
  ".aif": "aiff",
  ".aac": "aac",
  ".ogg": "ogg",
  ".flac": "flac",
  ".m4a": "m4a",
};

export async function transcribeAudio(input: {
  readonly engine: SpecialtyEngineRef;
  readonly file: string;
  readonly scratchDir: string;
  readonly openRouterKey?: string;
  readonly signal?: AbortSignal;
}): Promise<string> {
  if (input.engine.runtime === "mlx-audio") {
    const command = await requireCommand(
      MLX_AUDIO_COMMANDS.transcription,
      "uv tool install --upgrade mlx-audio",
    );
    await mkdir(input.scratchDir, { recursive: true });
    const outputBase = join(input.scratchDir, `transcript-${Date.now()}`);
    await run(
      command,
      [
        "--model",
        input.engine.modelId,
        "--audio",
        input.file,
        "--output-path",
        outputBase,
        "--format",
        "txt",
      ],
      {
        timeout: LOCAL_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        ...(input.signal ? { signal: input.signal } : {}),
      },
    );
    const text = await readFile(`${outputBase}.txt`, "utf8");
    await rm(`${outputBase}.txt`, { force: true });
    return text.trim();
  }
  if (input.engine.runtime === "openrouter") {
    if (!input.openRouterKey) throw new Error("Sign in to OpenRouter to transcribe audio.");
    const format = AUDIO_FORMATS[extname(input.file).toLowerCase()];
    if (!format) {
      throw new Error(
        `OpenRouter accepts ${Object.keys(AUDIO_FORMATS).join(", ")} audio; convert ${basename(input.file)} first.`,
      );
    }
    const data = (await readFile(input.file)).toString("base64");
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: openRouterHeaders(input.openRouterKey),
      body: JSON.stringify({
        model: input.engine.modelId,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcribe this recording verbatim. When more than one person speaks, prefix each turn with a speaker label (Speaker 1:, Speaker 2:). Output only the transcript.",
              },
              { type: "input_audio", input_audio: { data, format } },
            ],
          },
        ],
      }),
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(body.error?.message ?? `OpenRouter returned ${response.status}.`);
    }
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("OpenRouter returned no transcript.");
    }
    return content.trim();
  }
  throw new Error(`${input.engine.runtime} cannot transcribe audio.`);
}

export async function speakText(input: {
  readonly engine: SpecialtyEngineRef;
  readonly text: string;
  readonly outputDir: string;
  readonly voice?: string;
  readonly signal?: AbortSignal;
}): Promise<string> {
  await mkdir(input.outputDir, { recursive: true });
  const options = {
    timeout: LOCAL_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    ...(input.signal ? { signal: input.signal } : {}),
  };
  if (input.engine.runtime === "macos-say") {
    const textFile = join(input.outputDir, `.routey-speech-${Date.now()}.txt`);
    const aiff = join(input.outputDir, outputName("routey-speech", "aiff"));
    await writeFile(textFile, input.text);
    try {
      await run(
        "/usr/bin/say",
        [...(input.voice ? ["-v", input.voice] : []), "-o", aiff, "-f", textFile],
        options,
      );
    } finally {
      await rm(textFile, { force: true });
    }
    // AAC is a tenth of the size and plays everywhere.
    const m4a = aiff.replace(/\.aiff$/, ".m4a");
    try {
      await run("/usr/bin/afconvert", ["-f", "m4af", "-d", "aac", aiff, m4a], options);
      await rm(aiff, { force: true });
      return m4a;
    } catch {
      return aiff;
    }
  }
  if (input.engine.runtime === "mlx-audio") {
    const command = await requireCommand(
      MLX_AUDIO_COMMANDS.speech,
      "uv tool install --upgrade mlx-audio",
    );
    const prefix = outputName("routey-speech", "wav").replace(/\.wav$/, "");
    await run(
      command,
      [
        "--model",
        input.engine.modelId,
        "--text",
        input.text,
        "--voice",
        input.voice ?? "af_heart",
        "--output_path",
        input.outputDir,
        "--file_prefix",
        prefix,
        "--audio_format",
        "wav",
        "--join_audio",
      ],
      options,
    );
    const written = (await readdir(input.outputDir)).find(
      (name) => name.startsWith(prefix) && name.endsWith(".wav"),
    );
    if (!written) throw new Error("mlx-audio wrote no audio file.");
    return join(input.outputDir, written);
  }
  throw new Error(`${input.engine.runtime} cannot speak text.`);
}
