import { readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { RouteMode } from "../../contracts/router";
import type { RunnableSpecialty, SpecialtyEngineRef } from "../../contracts/specialties";
import { describeEngine } from "./specialty-engines";
import { generateImages, speakText, transcribeAudio, type ImageData } from "./specialty-runner";

/** Tools that change files or run arbitrary commands; plan mode blocks them. */
const MUTATING_TOOLS = new Set(["edit", "write", "bash", "powershell"]);

const PLAN_GUIDELINE =
  "Routey routed this turn in plan mode: investigate with read-only tools, then explain or propose a plan. Do not modify files or run commands.";
const ANSWER_GUIDELINE =
  "Routey routed this turn in answer mode: reply directly from your own knowledge without using tools.";

/** The routed state of a session's current turn. */
export interface RoutedTurn {
  readonly mode: RouteMode;
  readonly specialty?: RunnableSpecialty;
}

export interface RouteyExtensionHost {
  turnFor(sessionId: string): RoutedTurn | undefined;
  /** The engine that runs a specialty now, or undefined when none is set up. */
  engineFor(kind: RunnableSpecialty): Promise<SpecialtyEngineRef | undefined>;
}

const SPECIALTY_TOOLS: Readonly<Record<RunnableSpecialty, string>> = {
  "image-generation": "generate_image",
  "image-editing": "generate_image",
  transcription: "transcribe_audio",
  speech: "speak_text",
};
const SPECIALTY_TOOL_NAMES = new Set(Object.values(SPECIALTY_TOOLS));

const SPECIALTY_GUIDELINES: Readonly<Record<RunnableSpecialty, string>> = {
  "image-generation":
    "Routey routed this turn to image generation: call generate_image once with a detailed visual prompt, then tell the user where the image was saved.",
  "image-editing":
    "Routey routed this turn to image editing: call generate_image with use_attached_images set to true and a prompt describing the edit, then tell the user where the result was saved.",
  transcription:
    "Routey routed this turn to speech-to-text: call transcribe_audio with the recording's path, then answer from the transcript.",
  speech:
    "Routey routed this turn to text-to-speech: call speak_text with the exact text to read, then tell the user where the audio was saved.",
};

function resolvePath(cwd: string, path: string): string {
  const expanded = path.startsWith("~/") ? join(process.env.HOME ?? "", path.slice(2)) : path;
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Images the user attached to their latest message. */
function attachedImages(ctx: ExtensionContext): ImageData[] {
  const branch = ctx.sessionManager.getBranch();
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type !== "message" || entry.message.role !== "user") continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) =>
      part.type === "image" ? [{ data: part.data, mimeType: part.mimeType }] : [],
    );
  }
  return [];
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: undefined };
}

/**
 * Applies the router's per-turn mode, and runs its specialty tools (images,
 * speech-to-text, text-to-speech) on the engines chosen in the Routing panel.
 * The turn is read at the start of every run and before every tool call,
 * keyed by pi's session id, so a follow-up the router moves to another mode
 * takes effect immediately. Specialty tools are only offered on turns routed
 * to their specialty.
 */
export function createRouteyModeExtension(host: RouteyExtensionHost): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    const requireEngine = async (kind: RunnableSpecialty) => {
      const engine = await host.engineFor(kind);
      if (!engine) {
        throw new Error(
          `No ${kind.replace("-", " ")} engine is set up. Choose one in Settings → Routing.`,
        );
      }
      return engine;
    };

    pi.registerTool({
      name: "generate_image",
      label: "Generate image",
      description:
        "Create a new image from a text description, or edit the images the user attached (set use_attached_images). Saves the result into the working directory and returns it.",
      parameters: Type.Object({
        prompt: Type.String({ description: "What the image should show, in detail." }),
        use_attached_images: Type.Optional(
          Type.Boolean({ description: "Edit or use as reference the images the user attached." }),
        ),
        image_paths: Type.Optional(
          Type.Array(Type.String(), { description: "Image files to edit or use as reference." }),
        ),
      }),
      async execute(_id, params, signal, _onUpdate, ctx) {
        const references: ImageData[] = params.use_attached_images ? attachedImages(ctx) : [];
        for (const path of params.image_paths ?? []) {
          const file = resolvePath(ctx.cwd, path);
          const mimeType = IMAGE_TYPES[extname(file).toLowerCase()];
          if (!mimeType) throw new Error(`${basename(file)} is not a PNG, JPEG, WebP or GIF.`);
          references.push({ data: (await readFile(file)).toString("base64"), mimeType });
        }
        const kind = references.length > 0 ? "image-editing" : "image-generation";
        const engine = await requireEngine(kind);
        const result = await generateImages({
          engine,
          prompt: params.prompt,
          referenceImages: references,
          outputDir: ctx.cwd,
          ...(engine.runtime === "openrouter"
            ? { openRouterKey: await ctx.modelRegistry.getApiKeyForProvider("openrouter") }
            : {}),
          ...(signal ? { signal } : {}),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `${describeEngine(kind, engine)} saved ${result.files.join(", ")}.${result.text ? `\n${result.text}` : ""}`,
            },
            ...result.images.map((image) => ({ type: "image" as const, ...image })),
          ],
          details: undefined,
        };
      },
    });

    pi.registerTool({
      name: "transcribe_audio",
      label: "Transcribe audio",
      description: "Transcribe a recording (wav, mp3, m4a, aiff, flac, ogg) to text.",
      parameters: Type.Object({
        path: Type.String({ description: "The audio file, absolute or relative to the cwd." }),
      }),
      async execute(_id, params, signal, _onUpdate, ctx) {
        const engine = await requireEngine("transcription");
        const transcript = await transcribeAudio({
          engine,
          file: resolvePath(ctx.cwd, params.path),
          scratchDir: join(ctx.cwd, ".routey"),
          ...(engine.runtime === "openrouter"
            ? { openRouterKey: await ctx.modelRegistry.getApiKeyForProvider("openrouter") }
            : {}),
          ...(signal ? { signal } : {}),
        });
        return text(`Transcript (${describeEngine("transcription", engine)}):\n\n${transcript}`);
      },
    });

    pi.registerTool({
      name: "speak_text",
      label: "Speak text",
      description: "Read text aloud into an audio file saved in the working directory.",
      parameters: Type.Object({
        text: Type.String({ description: "Exactly what to say." }),
        voice: Type.Optional(
          Type.String({ description: "A voice name, if the user asked for one." }),
        ),
      }),
      async execute(_id, params, signal, _onUpdate, ctx) {
        const engine = await requireEngine("speech");
        const file = await speakText({
          engine,
          text: params.text,
          outputDir: ctx.cwd,
          ...(params.voice ? { voice: params.voice } : {}),
          ...(signal ? { signal } : {}),
        });
        return text(`${describeEngine("speech", engine)} saved ${file}.`);
      },
    });

    pi.on("before_agent_start", (event, ctx) => {
      const turn = host.turnFor(ctx.sessionManager.getSessionId());
      const options = event.systemPromptOptions;
      const specialtyTool = turn?.specialty ? SPECIALTY_TOOLS[turn.specialty] : undefined;
      let tools = options.selectedTools.filter((tool) => !SPECIALTY_TOOL_NAMES.has(tool));
      if (turn?.mode === "plan") {
        tools = tools.filter((tool) => !MUTATING_TOOLS.has(tool));
        if (!specialtyTool) options.promptGuidelines.push(PLAN_GUIDELINE);
      } else if (turn?.mode === "answer") {
        tools = [];
        if (!specialtyTool) options.promptGuidelines.push(ANSWER_GUIDELINE);
      }
      if (turn?.specialty && specialtyTool) {
        tools.push(specialtyTool);
        options.promptGuidelines.push(SPECIALTY_GUIDELINES[turn.specialty]);
      }
      options.selectedTools = tools;
      return undefined;
    });

    pi.on("tool_call", (event, ctx) => {
      const turn = host.turnFor(ctx.sessionManager.getSessionId());
      if (SPECIALTY_TOOL_NAMES.has(event.toolName)) {
        return turn?.specialty && SPECIALTY_TOOLS[turn.specialty] === event.toolName
          ? undefined
          : { block: true, reason: "Routey did not route this turn to that tool." };
      }
      if (turn?.mode === "answer") {
        return { block: true, reason: "Routey routed this turn to answer without tools." };
      }
      if (turn?.mode === "plan" && MUTATING_TOOLS.has(event.toolName)) {
        return {
          block: true,
          reason: `Routey routed this turn in plan mode, which does not allow ${event.toolName}.`,
        };
      }
      return undefined;
    });
  };
}
