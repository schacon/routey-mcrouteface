import { useCallback, useEffect, useMemo, useState } from "react";
import type { PiDesktopApi } from "../../../contracts/ipc";
import {
  DIFFICULTY_BANDS,
  MODEL_TIERS,
  TASK_KINDS,
  routeCellKey,
  type CellSuggestion,
  type ClassifierChoice,
  type ModelRef,
  type ModelTier,
  type RouteCellKey,
  type RouteMatrixCell,
  type RouterConfig,
  type RouterOverview,
  type TaskKind,
} from "../../../contracts/router";
import {
  SPECIALTY_CATALOG,
  isRunnableEngine,
  isRunnableSpecialty,
  sameEngine,
  type SpecialtyEngineRef,
  type SpecialtyStatus,
} from "../../../contracts/specialties";

const KIND_LABELS: Readonly<Record<TaskKind, string>> = {
  coding: "Coding",
  general: "Questions",
  app: "About Routey",
  writing: "Writing",
  research: "Research",
};

const TIER_LABELS: Readonly<Record<ModelTier, string>> = {
  local: "Local",
  hosted: "Hosted",
  frontier: "Frontier",
};

const SIGN_IN_POLL_MS = 3_000;
const SIGN_IN_WAIT_MS = 2 * 60 * 1000;
const BROWSE_LIMIT = 40;

function refKey(ref: ModelRef): string {
  return `${ref.provider}/${ref.modelId}`;
}

function sameRef(left: ModelRef, right: ModelRef): boolean {
  return left.provider === right.provider && left.modelId === right.modelId;
}

function engineKey(engine: SpecialtyEngineRef): string {
  return `${engine.runtime}:${engine.modelId}`;
}

function classifierKey(choice: ClassifierChoice): string {
  return choice.kind === "ollama" ? `ollama:${choice.model}` : choice.kind;
}

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** The router overview, reloaded whenever the router reports a config or status change. */
export function useRouterOverview(api: PiDesktopApi) {
  const [overview, setOverview] = useState<RouterOverview | null>(null);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(() => {
    api.getRouterOverview().then(setOverview, (reason: unknown) => setError(errorText(reason)));
  }, [api]);

  useEffect(() => {
    load();
    return api.onRouterChanged((target) => {
      if (!target) load();
    });
  }, [api, load]);

  const save = useCallback(
    (config: RouterConfig) => {
      setError(undefined);
      api.setRouterConfig(config).then(setOverview, (reason: unknown) => {
        setError(errorText(reason));
      });
    },
    [api],
  );

  return { overview, error, setError, save, reload: load };
}

interface RoutingPanelProps {
  readonly api: PiDesktopApi;
  /** Starts pi's OpenRouter sign-in; absent where no workspace can host it. */
  readonly onSignInOpenRouter?: () => void;
  /** "panel" is the narrow side-panel layout. */
  readonly variant: "settings" | "panel";
}

/**
 * The routing matrix: which model each task kind runs on at each difficulty,
 * with a dropdown per cell, the classifier model and prompt behind it,
 * suggested models to add, OpenRouter, and the engines for media specialties.
 */
export function RoutingPanel({ api, onSignInOpenRouter, variant }: RoutingPanelProps) {
  const { overview, error, setError, save, reload } = useRouterOverview(api);
  const [selectedCell, setSelectedCell] = useState<RouteCellKey | undefined>();
  const [waitingForSignIn, setWaitingForSignIn] = useState(false);

  // pi's sign-in finishes in the browser; poll until OpenRouter's models appear.
  useEffect(() => {
    if (!waitingForSignIn) return;
    if (overview?.openRouterConnected) {
      setWaitingForSignIn(false);
      return;
    }
    const interval = window.setInterval(reload, SIGN_IN_POLL_MS);
    const timeout = window.setTimeout(() => setWaitingForSignIn(false), SIGN_IN_WAIT_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [overview?.openRouterConnected, reload, waitingForSignIn]);

  if (!overview) {
    return <p className="routing__muted">{error ?? "Loading routing…"}</p>;
  }

  const signIn = onSignInOpenRouter
    ? () => {
        setWaitingForSignIn(true);
        onSignInOpenRouter();
      }
    : undefined;
  const cell = overview.matrix.find((entry) => entry.key === selectedCell);

  return (
    <div className={`routing routing--${variant}`} data-testid="routing-panel">
      {error ? <p className="routing__error">{error}</p> : null}
      <RouteMatrix
        overview={overview}
        selectedCell={selectedCell}
        onSelectCell={(key) => setSelectedCell((current) => (current === key ? undefined : key))}
        onSave={save}
      />
      {cell ? (
        <CellDetail
          api={api}
          cell={cell}
          overview={overview}
          onSave={save}
          onError={setError}
          {...(signIn ? { onSignIn: signIn } : {})}
        />
      ) : (
        <p className="routing__muted">
          Select a cell to see why it runs where it does and strong models to add.
        </p>
      )}
      <ClassifierCard overview={overview} onSave={save} />
      <OpenRouterCard
        overview={overview}
        waiting={waitingForSignIn}
        onSave={save}
        {...(signIn ? { onSignIn: signIn } : {})}
      />
      <Specialties overview={overview} onSave={save} />
    </div>
  );
}

function RouteMatrix({
  overview,
  selectedCell,
  onSelectCell,
  onSave,
}: {
  readonly overview: RouterOverview;
  readonly selectedCell: RouteCellKey | undefined;
  readonly onSelectCell: (key: RouteCellKey) => void;
  readonly onSave: (config: RouterConfig) => void;
}) {
  const { config } = overview;
  const available = useMemo(
    () => new Set(overview.availableModels.map((model) => refKey(model))),
    [overview.availableModels],
  );
  const usable = config.roster.filter((model) => available.has(refKey(model)));

  const setRoute = (key: RouteCellKey, value: string) => {
    const routes = { ...config.routes };
    const model = usable.find((entry) => refKey(entry) === value);
    if (model) routes[key] = { provider: model.provider, modelId: model.modelId };
    else delete routes[key];
    onSave({ ...config, routes });
  };

  return (
    <section className="routing__section">
      <h3 className="routing__heading">Decision matrix</h3>
      <p className="routing__muted">
        The classifier sorts each prompt into a task kind and difficulty. Each cell runs on the
        model shown; pick another to pin it, or Automatic to follow roster order.
      </p>
      <div className="routing__matrix" role="table" aria-label="Routing matrix">
        <div className="routing__matrix-row routing__matrix-row--head" role="row">
          <span role="columnheader" />
          {DIFFICULTY_BANDS.map((band) => (
            <span key={band} className="routing__band" role="columnheader">
              {band}
            </span>
          ))}
        </div>
        {TASK_KINDS.map((kind) => (
          <div key={kind} className="routing__matrix-row" role="row">
            <span className="routing__kind" role="rowheader">
              {KIND_LABELS[kind]}
            </span>
            {DIFFICULTY_BANDS.map((band) => {
              const key = routeCellKey(kind, band);
              const cell = overview.matrix.find((entry) => entry.key === key);
              if (!cell) return <span key={key} role="cell" />;
              const ordered = [
                ...usable.filter((model) => model.tier === cell.preferredTier),
                ...usable.filter((model) => model.tier !== cell.preferredTier),
              ];
              return (
                <div
                  key={key}
                  className={`routing__cell${selectedCell === key ? " routing__cell--selected" : ""}${cell.pinned ? " routing__cell--pinned" : ""}`}
                  data-testid={`routing-cell-${key}`}
                  role="cell"
                >
                  <select
                    aria-label={`Model for ${KIND_LABELS[kind]}, ${band}`}
                    className="routing__select"
                    value={cell.pinned && cell.pick ? refKey(cell.pick) : "auto"}
                    onChange={(event) => setRoute(key, event.currentTarget.value)}
                  >
                    <option value="auto">
                      {cell.pick ? `Auto: ${cell.pick.modelId}` : "Auto: no usable model"}
                    </option>
                    {MODEL_TIERS.map((tier) => {
                      const inTier = ordered.filter((model) => model.tier === tier);
                      return inTier.length > 0 ? (
                        <optgroup key={tier} label={TIER_LABELS[tier]}>
                          {inTier.map((model) => (
                            <option key={refKey(model)} value={refKey(model)}>
                              {model.modelId}
                            </option>
                          ))}
                        </optgroup>
                      ) : null;
                    })}
                  </select>
                  <button
                    className="routing__cell-meta"
                    type="button"
                    aria-expanded={selectedCell === key}
                    onClick={() => onSelectCell(key)}
                  >
                    {cell.pick ? TIER_LABELS[cell.pick.tier] : "—"} · {cell.thinkingLevel}
                    {cell.pinned ? " · pinned" : ""}
                    {cell.pinnedUnavailable ? " · pin unavailable" : ""}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function CellDetail({
  api,
  cell,
  overview,
  onSave,
  onError,
  onSignIn,
}: {
  readonly api: PiDesktopApi;
  readonly cell: RouteMatrixCell;
  readonly overview: RouterOverview;
  readonly onSave: (config: RouterConfig) => void;
  readonly onError: (message: string) => void;
  readonly onSignIn?: () => void;
}) {
  const { config } = overview;
  const suggestions = overview.suggestions[cell.key] ?? [];
  const [pulling, setPulling] = useState<ReadonlySet<string>>(new Set());

  const pin = (ref: ModelRef, rosterAddition?: CellSuggestion) => {
    const inRoster = config.roster.some((model) => sameRef(model, ref));
    onSave({
      ...config,
      roster:
        inRoster || !rosterAddition
          ? config.roster
          : [
              ...config.roster,
              {
                provider: ref.provider,
                modelId: ref.modelId,
                tier: rosterAddition.tier,
                capabilities: [cell.taskKind],
                goodAt: rosterAddition.note,
              },
            ],
      routes: { ...config.routes, [cell.key]: ref },
    });
  };

  const action = (suggestion: CellSuggestion) => {
    switch (suggestion.state) {
      case "routed":
        return cell.pick && sameRef(cell.pick, suggestion.ref) ? (
          <span className="routing__tag">In use here</span>
        ) : (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => pin(suggestion.ref)}
          >
            Use here
          </button>
        );
      case "add":
        return (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => pin(suggestion.ref, suggestion)}
          >
            Add and use
          </button>
        );
      case "pull": {
        const tag = suggestion.ollamaTag;
        if (!tag) return null;
        return pulling.has(tag) ? (
          <span className="routing__tag">Downloading…</span>
        ) : (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setPulling((current) => new Set([...current, tag]));
              api.setUpLocalModels([tag]).catch((reason: unknown) => onError(errorText(reason)));
            }}
          >
            Download
          </button>
        );
      }
      case "sign-in":
        return suggestion.ref.provider === "openrouter" && onSignIn ? (
          <button className="button button--secondary" type="button" onClick={onSignIn}>
            Sign in to OpenRouter
          </button>
        ) : (
          <span className="routing__tag">Connect {suggestion.ref.provider}</span>
        );
    }
  };

  return (
    <section className="routing__section routing__detail" data-testid="routing-cell-detail">
      <h3 className="routing__heading">
        {KIND_LABELS[cell.taskKind]} · {cell.difficulty}
      </h3>
      <p className="routing__muted">
        Prefers the {TIER_LABELS[cell.preferredTier].toLowerCase()} tier, thinking{" "}
        {cell.thinkingLevel}, {cell.mode} mode
        {cell.taskKind === "coding"
          ? " (plan when the prompt only asks for an explanation)"
          : ""}.{" "}
        {cell.pick
          ? `Runs on ${cell.pick.modelId} (${cell.pick.provider}${cell.pinned ? ", pinned" : ", first in roster order"}).`
          : "No usable model: add one below."}
        {cell.pinnedUnavailable
          ? ` The pinned ${cell.pinnedUnavailable.modelId} is not usable right now.`
          : ""}
      </p>
      {suggestions.length > 0 ? (
        <ul className="routing__suggestions">
          {suggestions.map((suggestion) => (
            <li key={refKey(suggestion.ref)} className="routing__suggestion">
              <div className="routing__suggestion-text">
                <div className="routing__suggestion-name">
                  {suggestion.name}
                  <span className="routing__tag">{TIER_LABELS[suggestion.tier]}</span>
                  {suggestion.price ? (
                    <span className="routing__price">{suggestion.price} per 1M</span>
                  ) : null}
                </div>
                <div className="routing__muted">{suggestion.note}</div>
                <code className="routing__ref">{refKey(suggestion.ref)}</code>
              </div>
              {action(suggestion)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ClassifierCard({
  overview,
  onSave,
}: {
  readonly overview: RouterOverview;
  readonly onSave: (config: RouterConfig) => void;
}) {
  const { classifier, config } = overview;
  const active = classifier.options.find(
    (option) => classifierKey(option.choice) === classifierKey(classifier.active),
  );
  return (
    <section className="routing__section">
      <h3 className="routing__heading">Classifier</h3>
      <div className="routing__row">
        <select
          aria-label="Classifier"
          className="routing__select"
          value={classifierKey(classifier.selected)}
          onChange={(event) => {
            const option = classifier.options.find(
              (candidate) => classifierKey(candidate.choice) === event.currentTarget.value,
            );
            if (option) onSave({ ...config, classifier: option.choice });
          }}
        >
          {classifier.options.map((option) => (
            <option key={classifierKey(option.choice)} value={classifierKey(option.choice)}>
              {option.available ? option.label : `${option.label} (not available)`}
            </option>
          ))}
        </select>
      </div>
      <p className="routing__muted" data-testid="routing-classifier-active">
        Classifying with {active?.label ?? classifierKey(classifier.active)}.{" "}
        {active?.description ?? ""}
      </p>
      {classifier.active.kind === "ollama" ? (
        <details className="routing__prompt">
          <summary>Classifier prompt</summary>
          <pre data-testid="routing-classifier-prompt">{overview.classifierPrompt}</pre>
          <p className="routing__muted">
            The model answers kind, difficulty, read_only and project as JSON. Follow-ups include
            the previous request. Wording cues (a named project, “don’t change anything”, “draw a
            picture”) then adjust its answer.
          </p>
        </details>
      ) : (
        <p className="routing__muted">
          {classifier.active.kind === "laya"
            ? "Laya answers fixed yes/no and choice questions about the prompt on the Neural Engine; keyword cues refine them."
            : "Keyword and phrasing rules decide the task kind."}
        </p>
      )}
    </section>
  );
}

function OpenRouterCard({
  overview,
  waiting,
  onSave,
  onSignIn,
}: {
  readonly overview: RouterOverview;
  readonly waiting: boolean;
  readonly onSave: (config: RouterConfig) => void;
  readonly onSignIn?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<ModelTier>("hosted");
  const { config } = overview;
  const roster = new Set(config.roster.map(refKey));
  const models = overview.availableModels.filter(
    (model) => model.provider === "openrouter" && !roster.has(refKey(model)),
  );
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? models.filter(
        (model) =>
          model.modelId.toLowerCase().includes(needle) ||
          model.label.toLowerCase().includes(needle),
      )
    : models;

  return (
    <section className="routing__section" data-testid="routing-openrouter">
      <h3 className="routing__heading">OpenRouter</h3>
      {overview.openRouterConnected ? (
        <>
          <p className="routing__muted">
            Signed in. {models.length} OpenRouter models are not in the roster yet; add any of them
            to a tier.
          </p>
          <div className="routing__row">
            <input
              aria-label="Search OpenRouter models"
              className="routing__search"
              placeholder="Search, e.g. sonnet, luna, glm"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <select
              aria-label="Tier for added models"
              className="routing__select routing__select--narrow"
              value={tier}
              onChange={(event) => setTier(event.currentTarget.value as ModelTier)}
            >
              {MODEL_TIERS.map((entry) => (
                <option key={entry} value={entry}>
                  {TIER_LABELS[entry]}
                </option>
              ))}
            </select>
          </div>
          <ul className="routing__browse">
            {matches.slice(0, BROWSE_LIMIT).map((model) => (
              <li key={refKey(model)} className="routing__browse-row">
                <span className="routing__browse-label">
                  {model.label}
                  <code className="routing__ref">{model.modelId}</code>
                </span>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() =>
                    onSave({
                      ...config,
                      roster: [
                        ...config.roster,
                        {
                          provider: model.provider,
                          modelId: model.modelId,
                          tier,
                          capabilities: model.supportsImages
                            ? ["general", "coding", "writing", "research", "vision"]
                            : ["general", "coding", "writing", "research"],
                          goodAt: "",
                        },
                      ],
                    })
                  }
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
          {matches.length > BROWSE_LIMIT ? (
            <p className="routing__muted">
              {matches.length - BROWSE_LIMIT} more; narrow the search.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="routing__muted">
            One OpenRouter account reaches hundreds of hosted models (Claude, GPT-6, Gemini, GLM,
            Kimi) plus the image and audio models the specialties below use.
          </p>
          {onSignIn ? (
            <button
              className="button button--primary"
              disabled={waiting}
              type="button"
              onClick={onSignIn}
            >
              {waiting ? "Waiting for the browser…" : "Sign in with OpenRouter"}
            </button>
          ) : (
            <p className="routing__muted">Sign in from Settings → Routing.</p>
          )}
        </>
      )}
    </section>
  );
}

function engineStatusText(status: SpecialtyStatus): string {
  const profile = SPECIALTY_CATALOG.find((entry) => entry.kind === status.kind);
  const name = (engine: SpecialtyEngineRef) =>
    profile?.engines.find((candidate) => sameEngine(candidate, engine))?.name ?? engine.modelId;
  if (status.active) return `Runs on ${name(status.active)}.`;
  const blockers = [
    ...new Set(
      status.engines
        .filter((entry) => isRunnableEngine(entry.engine) && entry.reason)
        .map((entry) => entry.reason),
    ),
  ];
  return blockers.length > 0 ? `Not set up: ${blockers.join(" or ")}.` : "Not set up.";
}

function Specialties({
  overview,
  onSave,
}: {
  readonly overview: RouterOverview;
  readonly onSave: (config: RouterConfig) => void;
}) {
  const { config } = overview;
  const setEngine = (kind: SpecialtyStatus["kind"], value: string) => {
    const specialties = { ...config.specialties };
    const profile = SPECIALTY_CATALOG.find((entry) => entry.kind === kind);
    const engine = profile?.engines.find((entry) => engineKey(entry) === value);
    if (engine) specialties[kind] = { runtime: engine.runtime, modelId: engine.modelId };
    else delete specialties[kind];
    onSave({ ...config, specialties });
  };

  return (
    <section className="routing__section">
      <h3 className="routing__heading">Specialties</h3>
      <p className="routing__muted">
        Narrow tasks go to narrow models. Image, speech-to-text and text-to-speech requests run
        through tools on the engine chosen here; the rest are recommendations.
      </p>
      <ul className="routing__specialties">
        {overview.specialties.map((status) => {
          const profile = SPECIALTY_CATALOG.find((entry) => entry.kind === status.kind);
          if (!profile) return null;
          const runnable = isRunnableSpecialty(status.kind);
          return (
            <li
              key={status.kind}
              className="routing__specialty"
              data-testid={`routing-specialty-${status.kind}`}
            >
              <div className="routing__row">
                <div>
                  <div className="routing__specialty-name">{profile.label}</div>
                  <div className="routing__muted">{profile.description}</div>
                </div>
                {runnable ? (
                  <select
                    aria-label={`Engine for ${profile.label}`}
                    className="routing__select routing__select--narrow"
                    value={status.selected ? engineKey(status.selected) : "auto"}
                    onChange={(event) => setEngine(status.kind, event.currentTarget.value)}
                  >
                    <option value="auto">Best available</option>
                    {status.engines
                      .filter((entry) => isRunnableEngine(entry.engine))
                      .map((entry) => {
                        const engine = profile.engines.find((candidate) =>
                          sameEngine(candidate, entry.engine),
                        );
                        return (
                          <option key={engineKey(entry.engine)} value={engineKey(entry.engine)}>
                            {engine?.name ?? entry.engine.modelId}
                            {entry.usable ? "" : ` (${entry.reason ?? "unavailable"})`}
                          </option>
                        );
                      })}
                  </select>
                ) : null}
              </div>
              {runnable ? <p className="routing__status">{engineStatusText(status)}</p> : null}
              <details className="routing__engines">
                <summary>{profile.engines.length} recommended models, local and hosted</summary>
                <ul>
                  {profile.engines.map((engine) => (
                    <li key={engineKey(engine)}>
                      <strong>{engine.name}</strong>{" "}
                      <span className="routing__tag">{engine.where}</span> {engine.note}
                      {engine.install ? (
                        <>
                          {" "}
                          <code className="routing__ref">{engine.install}</code>
                        </>
                      ) : null}
                      {engine.ollamaTag ? (
                        <>
                          {" "}
                          <code className="routing__ref">ollama pull {engine.ollamaTag}</code>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
