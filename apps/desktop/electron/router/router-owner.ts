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
  RouterConfig,
  RouterDecisionRecord,
  RouterOverview,
  RouterSessionInfo,
} from "../../contracts/router";
import { DecisionLogStore } from "./decision-log-store";
import type { LayaClassifier } from "./laya-client";
import {
  resolveRouteDecision,
  rosterModelUses,
  routeMatrix,
  type AvailableModel,
} from "./route-policy";
import { cellSuggestions } from "./cell-suggestions";
import type { RoutedTurn } from "./routey-mode-extension";
import { detectSpecialty } from "./specialty-cues";
import {
  activeEngine,
  findCommands,
  LOCAL_TOOL_COMMANDS,
  specialtyStatuses,
  type EngineEnvironment,
} from "./specialty-engines";
import {
  isRunnableSpecialty,
  type RunnableSpecialty,
  type SpecialtyEngineRef,
} from "../../contracts/specialties";
import { DEFAULT_SCRATCH_DIRECTORY, RouterConfigStore } from "./router-config-store";
import type { Classification } from "./router-classifier";
import { aggregateRouterStats } from "./router-stats";
import { CONTINUATION_CUE } from "./router-signals";
import { followUpAnchor, toolFloorKind } from "./session-routing";
import { totalmem } from "node:os";
import {
  LOCAL_MODEL_CATALOG,
  localModelProfile,
  type LocalModelPull,
  type LocalModelSetup,
} from "../../contracts/local-models";
import { buildLocalModelSetup } from "./local-model-setup";
import { listOllamaModels, ollamaBaseUrl, pullOllamaModel, warmOllamaModel } from "./ollama-client";
import {
  OLLAMA_CLASSIFIER_RANKING,
  classifierSystemPrompt,
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
  /** Makes Ollama models usable by pi; returns the provider id serving each model id. */
  registerOllamaModels(
    scratchDirectory: string,
    ollamaUrl: string,
    modelIds: readonly string[],
  ): Promise<Record<string, string>>;
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
const TOOLS_TTL_MS = 60 * 1000;

/**
 * Classifies every user turn and turns the result into a model, thinking level,
 * mode and (first turn only) working directory. Laya answers when it is loaded;
 * otherwise deterministic cues alone decide and the record says so.
 */
export class RouterOwner {
  private readonly configStore: RouterConfigStore;
  private readonly log: DecisionLogStore;
  private readonly turnsBySessionId = new Map<string, RoutedTurn>();
  private readonly pendingBySessionKey = new Map<string, PendingRoute>();
  private readonly turnCountBySessionKey = new Map<string, number>();
  private readonly routedSessionKeys = new Set<string>();
  private readonly pulls = new Map<string, LocalModelPull>();
  private readonly startedSessionKeys = new Set<string>();
  private ollamaUrlPromise: Promise<string> | undefined;
  private ollamaModelsCache:
    { readonly at: number; readonly models: readonly string[] | undefined } | undefined;
  private projectsCache:
    { readonly at: number; readonly projects: DiscoveredProject[] } | undefined;
  private toolsCache: { readonly at: number; readonly commands: Set<string> } | undefined;

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

  turnFor(sessionId: string): RoutedTurn | undefined {
    return this.turnsBySessionId.get(sessionId);
  }

  /** Whether OpenRouter is signed in and which local media tools are installed. */
  private async engineEnvironment(scratchDirectory: string): Promise<EngineEnvironment> {
    const cached = this.toolsCache;
    const commands =
      cached && Date.now() - cached.at < TOOLS_TTL_MS
        ? cached.commands
        : await findCommands(LOCAL_TOOL_COMMANDS);
    this.toolsCache = { at: Date.now(), commands };
    const routable = await this.host.routableModels(scratchDirectory);
    return {
      openRouterConnected: routable.models.some((model) => model.provider === "openrouter"),
      commands,
      platform: process.platform,
    };
  }

  /** The engine that runs a specialty tool now. */
  async engineFor(kind: RunnableSpecialty): Promise<SpecialtyEngineRef | undefined> {
    const config = await this.config();
    return activeEngine(kind, config, await this.engineEnvironment(config.scratchDirectory));
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
    // Rescan for newly installed tools each time the panel opens.
    this.toolsCache = undefined;
    const [projects, routable, environment] = await Promise.all([
      this.projects(),
      this.host.routableModels(config.scratchDirectory),
      this.engineEnvironment(config.scratchDirectory),
    ]);
    return {
      laya: this.laya.status(),
      config,
      classifier: await this.classifierState(config),
      classifierPrompt: classifierSystemPrompt(projects.map((project) => basename(project.path))),
      matrix: routeMatrix(config, routable.models),
      suggestions: cellSuggestions(config, routable.models),
      specialties: specialtyStatuses(config, environment),
      openRouterConnected: environment.openRouterConnected,
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

  /** Ollama's state and every catalog model's status, for the local-model guide. */
  async localSetup(): Promise<LocalModelSetup> {
    this.ollamaModelsCache = undefined;
    const [config, installed, ollamaUrl] = await Promise.all([
      this.config(),
      this.ollamaModels(),
      this.ollamaUrl(),
    ]);
    return buildLocalModelSetup({
      ollamaUrl,
      installed,
      roster: config.roster,
      memoryGb: Math.round(totalmem() / 1024 ** 3),
      pulls: this.pulls,
    });
  }

  /**
   * Pulls the chosen catalog models that are not installed, one at a time,
   * registers them with pi, and adds them to the roster's local tier with the
   * catalog's tags. Progress is published as it arrives.
   */
  async setUpLocalModels(tags: readonly string[]): Promise<LocalModelSetup> {
    const ollamaUrl = await this.ollamaUrl();
    if ((await listOllamaModels(ollamaUrl)) === undefined) {
      throw new Error("Ollama is not running. Install or start it, then try again.");
    }
    for (const tag of tags) this.pulls.set(tag, { state: "queued" });
    this.host.publish(null);
    void this.runSetup(ollamaUrl, tags).catch((error: unknown) => {
      console.error("[router] local model setup failed", error);
    });
    return this.localSetup();
  }

  private async runSetup(ollamaUrl: string, tags: readonly string[]): Promise<void> {
    const ready: string[] = [];
    for (const tag of tags) {
      const installed = (await listOllamaModels(ollamaUrl)) ?? [];
      const profile = LOCAL_MODEL_CATALOG.find((entry) => entry.tag === tag);
      const present = [tag, ...(profile?.aliases ?? [])].find((name) => installed.includes(name));
      if (present) {
        ready.push(present);
        this.pulls.set(tag, { state: "done" });
        continue;
      }
      let lastPublish = 0;
      try {
        await pullOllamaModel(ollamaUrl, tag, (progress) => {
          this.pulls.set(tag, {
            state: "pulling",
            status: progress.status,
            ...(progress.completed !== undefined ? { completed: progress.completed } : {}),
            ...(progress.total !== undefined ? { total: progress.total } : {}),
          });
          if (Date.now() - lastPublish > 500) {
            lastPublish = Date.now();
            this.host.publish(null);
          }
        });
        ready.push(tag);
        this.pulls.set(tag, { state: "done" });
      } catch (error) {
        this.pulls.set(tag, {
          state: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      this.host.publish(null);
    }
    if (ready.length > 0) await this.addLocalModelsToRoster(ollamaUrl, ready);
    this.ollamaModelsCache = undefined;
    this.host.publish(null);
    await this.warmClassifier();
  }

  private async addLocalModelsToRoster(ollamaUrl: string, modelIds: readonly string[]) {
    const config = await this.config();
    const providers = await this.host.registerOllamaModels(
      config.scratchDirectory,
      ollamaUrl,
      modelIds,
    );
    const additions = modelIds.flatMap((modelId) => {
      const profile = localModelProfile(modelId);
      const provider = providers[modelId];
      if (!profile || !provider) return [];
      if (config.roster.some((model) => model.provider === provider && model.modelId === modelId)) {
        return [];
      }
      return [
        {
          provider,
          modelId,
          tier: "local" as const,
          capabilities: [...profile.capabilities],
          goodAt: profile.summary,
        },
      ];
    });
    if (additions.length > 0) {
      // Local models go first so their tier's picks follow the catalog order.
      await this.configStore.write({ ...config, roster: [...additions, ...config.roster] });
    }
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
    const classification = await this.withSpecialty(
      await this.classify(prompt, true),
      prompt,
      hasImages,
      config,
    );
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
    this.turnsBySessionId.set(sessionRef.sessionId, routedTurn(pending.record.decision));
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
      const { decisions } = await this.log.read(sessionRef);
      const previous = decisions.at(-1);
      const anchor = followUpAnchor(decisions);
      const continuation = anchor && CONTINUATION_CUE.exec(prompt);
      if (anchor && continuation) {
        record = {
          promptExcerpt: prompt.slice(0, 200),
          firstTurn: false,
          source: {
            kind: "heuristic",
            reason: `"${continuation[0].trim()}" continues the previous request`,
          },
          signals: anchor.signals,
          answers: [],
          cues: [
            {
              signal: "continuation",
              reason: `"${continuation[0].trim()}" keeps the routing of the turn it continues`,
            },
          ],
          decision: {
            ...anchor.decision,
            cwd: sessionCwd,
            reasons: [
              anchor === previous
                ? "continues the previous request, so it keeps that turn's routing"
                : "continues the session's last turn with tools, so it keeps that routing",
              ...anchor.decision.reasons,
            ],
          },
        };
      } else {
        const config = await this.config();
        let classification = await this.withSpecialty(
          await this.classify(prompt, false, previous, anchor),
          prompt,
          hasImages,
          config,
        );
        let decision = await this.resolve(prompt, classification, config, hasImages, sessionCwd);
        const floorKind = toolFloorKind(anchor, decision.mode);
        if (floorKind) {
          classification = {
            ...classification,
            taskKind: floorKind,
            cues: [
              ...classification.cues,
              {
                signal: "session",
                reason: `this session uses tools, so the follow-up stays a ${floorKind} turn with them`,
              },
            ],
          };
          decision = await this.resolve(prompt, classification, config, hasImages, sessionCwd);
        }
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
    this.turnsBySessionId.set(sessionRef.sessionId, routedTurn(record.decision));
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
    anchor?: RouterDecisionRecord,
  ): Promise<Classification> {
    const [projects, classifier] = await Promise.all([
      this.projects(),
      this.config().then((config) => this.activeClassifier(config)),
    ]);
    return classifier.classify(prompt, {
      projects: projects.map((project) => project.path),
      firstTurn,
      ...(previous
        ? {
            previousPrompt: previous.promptExcerpt,
            previousKind: (anchor ?? previous).decision.taskKind,
          }
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
      ...(classification.specialty ? { specialty: classification.specialty } : {}),
    });
  }

  /** Adds a media specialty the prompt asks for, when an engine can run it. */
  private async withSpecialty(
    classification: Classification,
    prompt: string,
    hasImages: boolean,
    config: RouterConfig,
  ): Promise<Classification> {
    const cue = detectSpecialty(prompt, hasImages);
    if (!cue) return classification;
    const engine = activeEngine(
      cue.kind,
      config,
      await this.engineEnvironment(config.scratchDirectory),
    );
    return {
      ...classification,
      ...(engine ? { specialty: cue.kind } : {}),
      cues: [
        ...classification.cues,
        {
          signal: "specialty",
          reason: engine
            ? `${cue.reason}: ${cue.kind} tool`
            : `${cue.reason}, but no ${cue.kind} engine is set up in Settings → Routing`,
        },
      ],
    };
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

function routedTurn(decision: RouteDecision): RoutedTurn {
  const specialty = decision.specialty;
  return {
    mode: decision.mode,
    ...(specialty && isRunnableSpecialty(specialty) ? { specialty } : {}),
  };
}

function keyOf(sessionRef: SessionRef): string {
  return `${sessionRef.workspaceId}:${sessionRef.sessionId}`;
}
