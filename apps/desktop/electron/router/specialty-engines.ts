import { access, constants } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import type { RouterConfig } from "../../contracts/router";
import {
  SPECIALTY_CATALOG,
  sameEngine,
  type SpecialtyEngineRef,
  type SpecialtyKind,
  type SpecialtyStatus,
} from "../../contracts/specialties";

/** What decides whether an engine can run on this machine right now. */
export interface EngineEnvironment {
  readonly openRouterConnected: boolean;
  /** Command-line tools found on PATH or in the usual install folders. */
  readonly commands: ReadonlySet<string>;
  readonly platform: NodeJS.Platform;
}

/** The mflux command for each local image model id in the catalog. */
export const MFLUX_COMMANDS: Readonly<Record<string, string>> = {
  "z-image-turbo": "mflux-generate-z-image-turbo",
};

export const MLX_AUDIO_COMMANDS = {
  transcription: "mlx_audio.stt.generate",
  speech: "mlx_audio.tts.generate",
} as const;

export const LOCAL_TOOL_COMMANDS: readonly string[] = [
  ...Object.values(MFLUX_COMMANDS),
  ...Object.values(MLX_AUDIO_COMMANDS),
  "say",
  "afconvert",
];

/**
 * Folders a GUI-launched app may not have on PATH but where uv, pipx and
 * Homebrew install tools.
 */
export function toolSearchPath(): string[] {
  const home = homedir();
  return [
    ...(process.env.PATH ?? "").split(delimiter),
    join(home, ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ].filter((dir, index, all) => dir && all.indexOf(dir) === index);
}

export async function findCommand(name: string): Promise<string | undefined> {
  for (const dir of toolSearchPath()) {
    const candidate = join(dir, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not in this folder.
    }
  }
  return undefined;
}

export async function findCommands(names: readonly string[]): Promise<Set<string>> {
  const found = await Promise.all(names.map(async (name) => [name, await findCommand(name)]));
  return new Set(found.filter(([, path]) => path).map(([name]) => name as string));
}

export function engineUsability(
  kind: SpecialtyKind,
  engine: SpecialtyEngineRef,
  env: EngineEnvironment,
): { readonly usable: boolean; readonly reason?: string } {
  switch (engine.runtime) {
    case "openrouter":
      return env.openRouterConnected
        ? { usable: true }
        : { usable: false, reason: "Sign in to OpenRouter" };
    case "mflux": {
      const command = MFLUX_COMMANDS[engine.modelId];
      return command && env.commands.has(command)
        ? { usable: true }
        : { usable: false, reason: "Install mflux" };
    }
    case "mlx-audio": {
      const command =
        kind === "transcription"
          ? MLX_AUDIO_COMMANDS.transcription
          : kind === "speech"
            ? MLX_AUDIO_COMMANDS.speech
            : undefined;
      return command && env.commands.has(command)
        ? { usable: true }
        : { usable: false, reason: "Install mlx-audio" };
    }
    case "macos-say":
      return env.platform === "darwin" && env.commands.has("say")
        ? { usable: true }
        : { usable: false, reason: "Needs macOS" };
    case "roster":
      return { usable: true, reason: "Handled by the routing matrix" };
    case "info":
      return { usable: false, reason: "Recommendation only" };
  }
}

/** Each specialty's engines, which can run, and the one that would run now. */
export function specialtyStatuses(config: RouterConfig, env: EngineEnvironment): SpecialtyStatus[] {
  return SPECIALTY_CATALOG.map((profile) => {
    const engines = profile.engines.map((engine) => ({
      engine: { runtime: engine.runtime, modelId: engine.modelId },
      ...engineUsability(profile.kind, engine, env),
    }));
    const selected = config.specialties?.[profile.kind];
    const selectedUsable =
      selected && engineUsability(profile.kind, selected, env).usable ? selected : undefined;
    const active =
      selectedUsable ??
      engines.find((entry) => entry.usable && entry.engine.runtime !== "roster")?.engine;
    return {
      kind: profile.kind,
      ...(selected ? { selected } : {}),
      ...(active ? { active } : {}),
      engines,
    };
  });
}

/** The engine that runs a specialty now, or undefined when none is set up. */
export function activeEngine(
  kind: SpecialtyKind,
  config: RouterConfig,
  env: EngineEnvironment,
): SpecialtyEngineRef | undefined {
  return specialtyStatuses(config, env).find((status) => status.kind === kind)?.active;
}

export function describeEngine(kind: SpecialtyKind, engine: SpecialtyEngineRef): string {
  const profile = SPECIALTY_CATALOG.find((entry) => entry.kind === kind);
  return (
    profile?.engines.find((candidate) => sameEngine(candidate, engine))?.name ?? engine.modelId
  );
}
