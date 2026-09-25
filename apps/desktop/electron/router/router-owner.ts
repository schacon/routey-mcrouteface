import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename } from "node:path";
import type { SessionRef } from "@pi-gui/session-driver";
import type {
  ClassifierOption,
  ClassifierState,
  DiscoveredProject,
  ModelTokenUsage,
  RouterStats,
  RouteDecision,
  RouteMode,
  RouterConfig,
  RouterDecisionRecord,
  RouterOverview,
  RouterSessionInfo,
} from "../../contracts/router";
import { DecisionLogStore } from "./decision-log-store";
import type { LayaClassifier } from "./laya-client";
import { resolveRouteDecision, rosterModelUses, type AvailableModel } from "./route-policy";
import { DEFAULT_SCRATCH_DIRECTORY, RouterConfigStore } from "./router-config-store";
import type { Classification } from "./router-classifier";
import { aggregateRouterStats } from "./router-stats";
import { CONTINUATION_CUE } from "./router-signals";
import { listOllamaModels, ollamaBaseUrl, warmOllamaModel } from "./ollama-client";
import {
  OLLAMA_CLASSIFIER_RANKING,
  keywordClassifier,
  layaTaskClassifier,
  ollamaTaskClassifier,
  type TaskClassifier,
} from "./task-classifiers";
import { discoverProjects, type DiscoveryRoots } from "./workspace-discovery";

export interface RoutableModels {
  readonly models: readonly (AvailableModel & { readonly label: string })[];
  readonly fallback?: { readonly provider: string; readonly modelId: string };
}

/** What the router needs from the rest of the app; nothing else of the store leaks in. */
export interface RouterHost {
  /** Models the runtime can use; the scratch directory hosts a runtime when none is loaded. */
  routableModels(scratchDirectory: string): Promise<RoutableModels>;
  /** Workspaces Routey already knows, as extra project sightings. */
  knownWorkspaces(): readonly { readonly path: string; readonly usedAt: string }[];
  /** User messages of a session so far, oldest first, for the purpose summary. */
  userMessages(sessionRef: SessionRef): readonly string[];
  generatePurpose(
    cwd: string,
    userMessages: readonly string[],
    model: { readonly provider: string; readonly modelId: string } | undefined,
  ): Promise<string | null>;
  /** A session's routing info changed, or (null) the router's own config or status did. */
  publish(sessionRef: SessionRef | null): void;
}

/** A first-turn decision made before its session exists. */
export interface PendingRoute {
  readonly record: Omit<RouterDecisionRecord, "id" | "timestamp">;
}

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const OLLAMA_MODELS_TTL_MS = 60 * 1000;
const PURPOSE_REFRESH_EVERY = 5;

/**
 * Classifies every user turn and turns the result into a model, thinking level,
 * mode and (first turn only) working directory. Laya answers when it is loaded;
 * otherwise deterministic cues alone decide and the record says so.
 */
export class RouterOwner {
  private readonly configStore: RouterConfigStore;
  private readonly log: DecisionLogStore;
  private readonly modesBySessionId = new Map<string, RouteMode>();
  private readonly pendingBySessionKey = new Map<string, PendingRoute>();
  private readonly turnCountBySessionKey = new Map<string, number>();
  private readonly routedSessionKeys = new Set<string>();
  private readonly startedSessionKeys = new Set<string>();
  private ollamaUrlPromise: Promise<string> | undefined;
  private ollamaModelsCache:
    { readonly at: number; readonly models: readonly string[] | undefined } | undefined;
  private projectsCache:
    { readonly at: number; readonly projects: DiscoveredProject[] } | undefined;

  constructor(
    userDataDir: string,
    private readonly laya: LayaClassifier,
    private readonly discoveryRoots: DiscoveryRoots,
    private readonly host: RouterHost,
  ) {
    this.configStore = new RouterConfigStore(userDataDir);
    this.log = new DecisionLogStore(userDataDir);
  }

  /** Start loading Laya early so the first prompt does not wait on it. */
  warm(): void {
    this.laya.warm();
    void this.projects().catch((error: unknown) => {
      console.error("[router] project discovery failed", error);
    });
    this.warmClassifier().catch(() => undefined); // warmClassifier logs its own failures
  }

  /** Loads a local classifier model into memory so the first prompt does not wait on it. */
  private async warmClassifier(): Promise<void> {
    try {
      const classifier = await this.activeClassifier(await this.config());
      if (classifier.choice.kind === "ollama") {
        await warmOllamaModel(await this.ollamaUrl(), classifier.choice.model);
      }
    } catch (error) {
      console.error("[router] warming the classifier failed", error);
    }
  }

  private ollamaUrl(): Promise<string> {
    this.ollamaUrlPromise ??= ollamaBaseUrl();
    return this.ollamaUrlPromise;
  }

  /** Installed Ollama models, cached briefly; undefined when Ollama is not running. */
  private async ollamaModels(): Promise<readonly string[] | undefined> {
    const cached = this.ollamaModelsCache;
    if (cached && Date.now() - cached.at < OLLAMA_MODELS_TTL_MS) return cached.models;
    const models = await listOllamaModels(await this.ollamaUrl());
    this.ollamaModelsCache = { at: Date.now(), models };
    return models;
  }

  async classifierState(config: RouterConfig): Promise<ClassifierState> {
    const selected = config.classifier ?? { kind: "auto" };
    const installed = (await this.ollamaModels()) ?? [];
    const layaUsable = this.laya.status().state !== "unavailable";
    const active = (await this.activeClassifier(config)).choice;
    const ranked = OLLAMA_CLASSIFIER_RANKING.filter((model) => installed.includes(model));
    const selectedModel = selected.kind === "ollama" ? selected.model : undefined;
    const modelOptions: ClassifierOption[] = [
      ...ranked,
      ...(selectedModel && !ranked.some((model) => model === selectedModel) ? [selectedModel] : []),
    ].map((model) => ({
      choice: { kind: "ollama", model },
      label: model,
      description: "Local model via Ollama, a few hundred ms per prompt.",
      available: installed.includes(model),
    }));
    return {
      selected,
      active,
      options: [
        {
          choice: { kind: "auto" },
          label: "Automatic",
          description: "The best installed local model, then Laya, then keyword cues.",
          available: true,
        },
        ...modelOptions,
        {
          choice: { kind: "laya" },
          label: "Laya + keyword cues",
          description: "On-device decision model, about 30 ms, less accurate.",
          available: layaUsable,
        },
        {
          choice: { kind: "keywords" },
          label: "Keyword cues only",
          description: "Instant, but only understands phrasings it has rules for.",
          available: true,
        },
      ],
    };
  }

  /** The classifier to run: the selection when usable, else the best usable one. */
  private async activeClassifier(config: RouterConfig): Promise<TaskClassifier> {
    const selected = config.classifier ?? { kind: "auto" };
    const layaUsable = this.laya.status().state !== "unavailable";
    const fallback = layaUsable ? layaTaskClassifier(this.laya) : keywordClassifier();
    if (selected.kind === "keywords") return keywordClassifier();
    if (selected.kind === "laya") return fallback;
    const installed = await this.ollamaModels();
    const model =
      selected.kind === "ollama"
        ? installed?.includes(selected.model)
          ? selected.model
          : undefined
        : OLLAMA_CLASSIFIER_RANKING.find((candidate) => installed?.includes(candidate));
    return model ? ollamaTaskClassifier(await this.ollamaUrl(), model, fallback) : fallback;
  }

  modeFor(sessionId: string): RouteMode | undefined {
    return this.modesBySessionId.get(sessionId);
  }

  async config(): Promise<RouterConfig> {
    return this.configStore.readOrSeed(await this.availableInSeedOrder());
  }

  async setConfig(config: RouterConfig): Promise<RouterOverview> {
    await this.configStore.write(config);
    this.projectsCache = undefined;
    this.host.publish(null);
    this.warmClassifier().catch(() => undefined); // warmClassifier logs its own failures
    return this.overview();
  }

  async overview(): Promise<RouterOverview> {
    const config = await this.config();
    const [projects, routable] = await Promise.all([
      this.projects(),
      this.host.routableModels(config.scratchDirectory),
    ]);
    return {
      laya: this.laya.status(),
      config,
      classifier: await this.classifierState(config),
      modelUses: rosterModelUses(config, routable.models),
      projects,
      availableModels: routable.models.map((model) => ({
        provider: model.provider,
        modelId: model.modelId,
        label: model.label,
        supportsImages: model.supportsImages,
      })),
    };
  }

  sessionInfo(sessionRef: SessionRef): Promise<RouterSessionInfo> {
    return this.log.read(sessionRef);
  }

  /** Routed turns and tokens per model, for one session or every session. */
  async stats(sessionRef: SessionRef | undefined): Promise<RouterStats> {
    if (sessionRef) {
      const [info, usage] = await Promise.all([
        this.log.read(sessionRef),
        this.log.readUsage(sessionRef),
      ]);
      return aggregateRouterStats("session", [{ decisions: info.decisions, usage }]);
    }
    return aggregateRouterStats("all", await this.log.readAllSessions());
  }

  /**
   * Tokens a session used since its last usage report, attributed to the model
   * that ran it. Only sessions with a routed turn in this run are counted, so a
   * session's history loaded at startup is not mistaken for new usage.
   */
  recordUsage(sessionRef: SessionRef, fromZero: boolean, usage: ModelTokenUsage): void {
    const key = keyOf(sessionRef);
    if (!this.routedSessionKeys.has(key)) return;
    // Without a baseline the totals include history, unless this run started the session.
    if (fromZero && !this.startedSessionKeys.has(key)) return;
    if (usage.input <= 0 && usage.output <= 0 && usage.cacheRead <= 0) return;
    this.log
      .appendUsage(sessionRef, usage)
      .then(() => this.host.publish(sessionRef))
      .catch((error: unknown) => {
        console.error("[router] recording token usage failed", error);
      });
  }

  /** Decide a new session's first turn, including where it runs. */
  async decideFirstTurn(prompt: string, hasImages: boolean): Promise<PendingRoute> {
    const config = await this.config();
    const classification = await this.classify(prompt, true);
    const decision = await this.resolve(prompt, classification, config, hasImages, undefined);
    if (decision.cwd === config.scratchDirectory) {
      await mkdir(config.scratchDirectory, { recursive: true });
    }
    return {
      record: {
        promptExcerpt: prompt.slice(0, 200),
        firstTurn: true,
        source: classification.source,
        signals: classification.signals,
        answers: classification.answers,
        cues: classification.cues,
        decision,
        ...(classification.note ? { classifierNote: classification.note } : {}),
      },
    };
  }

  /** The new session exists: its first send uses the decision made for it. */
  adoptFirstTurn(sessionRef: SessionRef, pending: PendingRoute): void {
    this.pendingBySessionKey.set(keyOf(sessionRef), pending);
    this.startedSessionKeys.add(keyOf(sessionRef));
    this.modesBySessionId.set(sessionRef.sessionId, pending.record.decision.mode);
  }

  /**
   * Called right before a user message is sent. Returns the model and thinking
   * level to switch to; the mode is applied through the mode extension.
   */
  async routeUserTurn(
    sessionRef: SessionRef,
    sessionCwd: string,
    prompt: string,
    hasImages: boolean,
  ): Promise<RouteDecision> {
    const key = keyOf(sessionRef);
    const pending = this.pendingBySessionKey.get(key);
    this.pendingBySessionKey.delete(key);
    let record: Omit<RouterDecisionRecord, "id" | "timestamp">;
    if (pending) {
      record = pending.record;
    } else {
      const previous = (await this.log.read(sessionRef)).decisions.at(-1);
      const continuation = previous && CONTINUATION_CUE.exec(prompt);
      if (previous && continuation) {
        record = {
          promptExcerpt: prompt.slice(0, 200),
          firstTurn: false,
          source: {
            kind: "heuristic",
            reason: `"${continuation[0].trim()}" continues the previous request`,
          },
          signals: previous.signals,
          answers: [],
          cues: [
            {
              signal: "continuation",
              reason: `"${continuation[0].trim()}" keeps the previous routing`,
            },
          ],
          decision: {
            ...previous.decision,
            cwd: sessionCwd,
            reasons: [
              "continues the previous request, so it keeps that turn's routing",
              ...previous.decision.reasons,
            ],
          },
        };
      } else {
        const config = await this.config();
        const classification = await this.classify(prompt, false, previous);
        const decision = await this.resolve(prompt, classification, config, hasImages, sessionCwd);
        const mentioned = classification.signals.mentionedProject;
        record = {
          promptExcerpt: prompt.slice(0, 200),
          firstTurn: false,
          source: classification.source,
          signals: classification.signals,
          answers: classification.answers,
          cues: classification.cues,
          decision,
          ...(classification.note ? { classifierNote: classification.note } : {}),
          ...(mentioned && mentioned !== sessionCwd ? { suggestedProject: mentioned } : {}),
        };
      }
    }
    this.modesBySessionId.set(sessionRef.sessionId, record.decision.mode);
    this.routedSessionKeys.add(key);
    await this.log.append(sessionRef, {
      ...record,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    });
    this.host.publish(sessionRef);
    this.maybeRefreshPurpose(sessionRef, sessionCwd, record.decision);
    return record.decision;
  }

  dispose(): void {
    this.laya.dispose();
  }

  private async classify(
    prompt: string,
    firstTurn: boolean,
    previous?: RouterDecisionRecord,
  ): Promise<Classification> {
    const [projects, classifier] = await Promise.all([
      this.projects(),
      this.config().then((config) => this.activeClassifier(config)),
    ]);
    return classifier.classify(prompt, {
      projects: projects.map((project) => project.path),
      firstTurn,
      ...(previous
        ? { previousPrompt: previous.promptExcerpt, previousKind: previous.decision.taskKind }
        : {}),
    });
  }

  private async resolve(
    prompt: string,
    classification: Classification,
    config: RouterConfig,
    hasImages: boolean,
    sessionCwd: string | undefined,
  ): Promise<RouteDecision> {
    const routable = await this.host.routableModels(config.scratchDirectory);
    return resolveRouteDecision({
      taskKind: classification.taskKind,
      signals: classification.signals,
      config,
      availableModels: routable.models,
      ...(routable.fallback ? { fallbackModel: routable.fallback } : {}),
      hasImages,
      ...(sessionCwd ? { sessionCwd } : {}),
      ...(classification.chosenProject ? { chosenProject: classification.chosenProject } : {}),
    });
  }

  private async projects(): Promise<DiscoveredProject[]> {
    const cached = this.projectsCache;
    if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.projects;
    const config = await this.configStore.read();
    const discovered = await discoverProjects(this.discoveryRoots, [
      ...this.host.knownWorkspaces(),
      ...(config?.pinnedProjects ?? []).map((path) => ({
        path,
        usedAt: new Date().toISOString(),
      })),
    ]);
    const projects = discovered.filter(
      (project) =>
        !config?.excludedProjects.includes(project.path) &&
        project.path !== config?.scratchDirectory,
    );
    this.projectsCache = { at: Date.now(), projects };
    return projects;
  }

  /** Default model first, so a fresh roster prefers what the user already chose. */
  private async availableInSeedOrder(): Promise<readonly AvailableModel[]> {
    // Runs before any config exists, so it cannot ask config() for the scratch directory.
    const { models, fallback } = await this.host.routableModels(DEFAULT_SCRATCH_DIRECTORY);
    return [...models].sort((left, right) => {
      const leftDefault =
        left.provider === fallback?.provider && left.modelId === fallback.modelId ? 0 : 1;
      const rightDefault =
        right.provider === fallback?.provider && right.modelId === fallback.modelId ? 0 : 1;
      return leftDefault - rightDefault;
    });
  }

  private maybeRefreshPurpose(sessionRef: SessionRef, cwd: string, decision: RouteDecision): void {
    const key = keyOf(sessionRef);
    const turns = (this.turnCountBySessionKey.get(key) ?? 0) + 1;
    this.turnCountBySessionKey.set(key, turns);
    if (turns !== 1 && turns % PURPOSE_REFRESH_EVERY !== 0) return;
    void (async () => {
      const config = await this.config();
      const local = config.roster.find((model) => model.tier === "local");
      const model = local
        ? { provider: local.provider, modelId: local.modelId }
        : { provider: decision.provider, modelId: decision.modelId };
      const text = await this.host.generatePurpose(cwd, this.host.userMessages(sessionRef), model);
      if (!text) return;
      await this.log.writePurpose(sessionRef, { text, generatedAt: new Date().toISOString() });
      this.host.publish(sessionRef);
    })().catch((error: unknown) => {
      console.error(`[router] purpose for ${basename(cwd)} failed`, error);
    });
  }
}

function keyOf(sessionRef: SessionRef): string {
  return `${sessionRef.workspaceId}:${sessionRef.sessionId}`;
}
