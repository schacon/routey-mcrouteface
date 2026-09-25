import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename } from "node:path";
import type { SessionRef } from "@pi-gui/session-driver";
import type {
  DiscoveredProject,
  RouteDecision,
  RouteMode,
  RouterConfig,
  RouterCue,
  RouterDecisionRecord,
  RouterOverview,
  RouterQuestionAnswer,
  RouterSessionInfo,
  RouterSignals,
  RouterSource,
} from "../../contracts/router";
import { DecisionLogStore } from "./decision-log-store";
import type { LayaClassifier, LayaWireAnswer } from "./laya-client";
import { resolveRouteDecision, type AvailableModel } from "./route-policy";
import { DEFAULT_SCRATCH_DIRECTORY, RouterConfigStore } from "./router-config-store";
import {
  NONE_OF_THESE_PROJECTS,
  ROUTER_QUESTIONS,
  combineSignals,
  layaState,
  pickTaskKind,
  projectQuestion,
  toQuestionAnswers,
} from "./router-signals";
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
  /** The session's routing info changed; renderers refresh their panels. */
  publish(sessionRef: SessionRef): void;
}

/** A first-turn decision made before its session exists. */
export interface PendingRoute {
  readonly record: Omit<RouterDecisionRecord, "id" | "timestamp">;
}

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const PROJECT_CANDIDATE_LIMIT = 8;
const PURPOSE_REFRESH_EVERY = 5;

interface Classification {
  readonly source: RouterSource;
  readonly signals: RouterSignals;
  readonly cues: readonly RouterCue[];
  readonly answers: readonly RouterQuestionAnswer[];
  readonly chosenProject?: string;
}

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

  /** Decide a new session's first turn, including where it runs. */
  async decideFirstTurn(prompt: string, hasImages: boolean): Promise<PendingRoute> {
    const config = await this.config();
    const classification = await this.classify(prompt, config, true);
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
      },
    };
  }

  /** The new session exists: its first send uses the decision made for it. */
  adoptFirstTurn(sessionRef: SessionRef, pending: PendingRoute): void {
    this.pendingBySessionKey.set(keyOf(sessionRef), pending);
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
      const config = await this.config();
      const classification = await this.classify(prompt, config, false);
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
        ...(mentioned && mentioned !== sessionCwd ? { suggestedProject: mentioned } : {}),
      };
    }
    this.modesBySessionId.set(sessionRef.sessionId, record.decision.mode);
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
    config: RouterConfig,
    firstTurn: boolean,
  ): Promise<Classification> {
    const projects = await this.projects();
    const knownProjects = projects.map((project) => project.path);
    let answers: readonly LayaWireAnswer[] = [];
    let source: RouterSource;
    let questions = [...ROUTER_QUESTIONS];
    try {
      const result = await this.laya.answer(layaState(prompt), ROUTER_QUESTIONS);
      answers = result.answers;
      source = { kind: "laya", latencyMs: result.latencyMs };
    } catch (error) {
      source = {
        kind: "heuristic",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    const { signals, cues } = combineSignals({ prompt, answers, knownProjects });
    const questionAnswers = [...toQuestionAnswers(questions, answers)];

    // Only a new session picks a directory, and only asks Laya when the prompt
    // seems to need a project it does not name.
    let chosenProject: string | undefined;
    const kind = pickTaskKind(signals, cues);
    if (
      firstTurn &&
      source.kind === "laya" &&
      !signals.mentionedProject &&
      kind === "coding" &&
      signals.needsProject >= 0.6
    ) {
      const candidates = projects
        .filter((project) => !config.excludedProjects.includes(project.path))
        .slice(0, PROJECT_CANDIDATE_LIMIT)
        .map((project) => project.path);
      if (candidates.length > 0) {
        const question = projectQuestion(candidates);
        questions = [...questions, question];
        try {
          const result = await this.laya.answer(layaState(prompt), [question]);
          const answer = result.answers[0];
          if (answer) {
            questionAnswers.push(...toQuestionAnswers([question], [answer]));
            const index = answer.labels.indexOf(answer.selected);
            if (answer.selected !== NONE_OF_THESE_PROJECTS && index >= 0) {
              chosenProject = candidates[index];
            }
          }
        } catch {
          // The kind answers already landed; keep going without a project pick.
        }
      }
    }
    return {
      source,
      signals,
      cues,
      answers: questionAnswers,
      ...(chosenProject ? { chosenProject } : {}),
    };
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
      taskKind: pickTaskKind(classification.signals, classification.cues),
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
