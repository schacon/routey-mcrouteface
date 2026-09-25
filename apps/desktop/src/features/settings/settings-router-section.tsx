import { useCallback, useEffect, useState } from "react";
import type { PiDesktopApi } from "../../../contracts/ipc";
import {
  MODEL_CAPABILITIES,
  type ClassifierChoice,
  MODEL_TIERS,
  type ModelCapability,
  type ModelTier,
  type RosterModel,
  type RouterConfig,
  type RouterOverview,
} from "../../../contracts/router";
import { formatRelativeTime } from "../../lib/string-utils";
import { SettingsSelect } from "./settings-controls";
import { SettingsGroup, SettingsRow } from "./settings-utils";

interface SettingsRouterSectionProps {
  readonly api: PiDesktopApi;
}

const TIER_OPTIONS = MODEL_TIERS.map((tier) => ({
  value: tier,
  label: tier === "local" ? "Local" : tier === "hosted" ? "Hosted" : "Frontier",
}));

function layaStatusText(overview: RouterOverview): string {
  const { laya } = overview;
  switch (laya.state) {
    case "ready":
      return `Ready (${laya.lengths.join(" and ")}-token buckets)`;
    case "loading":
      return "Loading";
    case "stopped":
      return "Starts with the next prompt";
    case "unavailable":
      return `Unavailable: ${laya.message}`;
  }
}

function classifierChoiceKey(choice: ClassifierChoice): string {
  return choice.kind === "ollama" ? `ollama:${choice.model}` : choice.kind;
}

function classifierLabel(overview: RouterOverview, choice: ClassifierChoice): string {
  return (
    overview.classifier.options.find(
      (option) => classifierChoiceKey(option.choice) === classifierChoiceKey(choice),
    )?.label ?? classifierChoiceKey(choice)
  );
}

function modelKey(model: Pick<RosterModel, "provider" | "modelId">): string {
  return `${model.provider}/${model.modelId}`;
}

/** The model roster the router picks from, the projects it may work in, and Laya's state. */
export function SettingsRouterSection({ api }: SettingsRouterSectionProps) {
  const [overview, setOverview] = useState<RouterOverview | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [addKey, setAddKey] = useState<string | undefined>();

  const load = useCallback(() => {
    api.getRouterOverview().then(setOverview, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, [api]);

  useEffect(() => {
    load();
    return api.onRouterChanged((target) => {
      if (!target) load();
    });
  }, [api, load]);

  const save = (config: RouterConfig) => {
    setError(undefined);
    api.setRouterConfig(config).then(setOverview, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  };

  if (!overview) {
    return <p className="settings-row__description">{error ?? "Loading router settings…"}</p>;
  }
  const { config } = overview;
  const updateModel = (key: string, patch: Partial<RosterModel>) =>
    save({
      ...config,
      roster: config.roster.map((model) =>
        modelKey(model) === key ? { ...model, ...patch } : model,
      ),
    });
  const moveModel = (key: string, step: -1 | 1) => {
    const index = config.roster.findIndex((model) => modelKey(model) === key);
    const target = index + step;
    if (index < 0 || target < 0 || target >= config.roster.length) return;
    const roster = [...config.roster];
    const [moved] = roster.splice(index, 1);
    if (moved) roster.splice(target, 0, moved);
    save({ ...config, roster });
  };
  const rosterKeys = new Set(config.roster.map(modelKey));
  const addable = overview.availableModels.filter((model) => !rosterKeys.has(modelKey(model)));
  const excluded = new Set(config.excludedProjects);

  return (
    <>
      {error ? <p className="settings-row__description routey-settings__error">{error}</p> : null}
      <SettingsGroup
        title="Decision model"
        description="Every prompt is classified on this Mac before it runs: what kind of task it is, how hard, whether it may change files, and which project."
      >
        <SettingsRow
          title="Classifier"
          description={
            classifierChoiceKey(overview.classifier.selected) === "auto"
              ? `Automatic is using ${classifierLabel(overview, overview.classifier.active)}.`
              : (overview.classifier.options.find(
                  (option) =>
                    classifierChoiceKey(option.choice) ===
                    classifierChoiceKey(overview.classifier.selected),
                )?.description ?? "")
          }
        >
          <SettingsSelect
            label="Classifier"
            options={overview.classifier.options.map((option) => ({
              value: classifierChoiceKey(option.choice),
              label: option.available ? option.label : `${option.label} (not available)`,
            }))}
            value={classifierChoiceKey(overview.classifier.selected)}
            onChange={(key) => {
              const option = overview.classifier.options.find(
                (candidate) => classifierChoiceKey(candidate.choice) === key,
              );
              if (option) save({ ...config, classifier: option.choice });
            }}
          />
        </SettingsRow>
        <SettingsRow
          title="Laya"
          description="Local Core ML model, loaded from the FluidUse cache."
        >
          <span className="settings-row__value" data-testid="router-laya-status">
            {layaStatusText(overview)}
          </span>
        </SettingsRow>
        <SettingsRow
          title="Scratch directory"
          description="Where sessions run when a prompt needs no project."
        >
          <code className="settings-row__value">{config.scratchDirectory}</code>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Models"
        description="The router picks a tier from the task and its difficulty, then the first model in that tier tagged for the task. Order matters."
      >
        {config.roster.length === 0 ? (
          <SettingsRow
            title="No models yet"
            description="Connect a provider or add an Ollama endpoint, then add models here."
          />
        ) : null}
        {config.roster.map((model, index) => {
          const key = modelKey(model);
          return (
            <div
              className="settings-row routey-settings__model"
              data-testid="router-model"
              key={key}
            >
              <div className="settings-row__label">
                <div className="settings-row__title">{model.modelId}</div>
                <div className="settings-row__description">{model.provider}</div>
                <input
                  aria-label={`What ${model.modelId} is good at`}
                  className="routey-settings__good-at"
                  defaultValue={model.goodAt}
                  placeholder="What is this model good at?"
                  onBlur={(event) => {
                    if (event.currentTarget.value !== model.goodAt) {
                      updateModel(key, { goodAt: event.currentTarget.value });
                    }
                  }}
                />
                <div className="routey-settings__capabilities" role="group" aria-label="Good for">
                  {MODEL_CAPABILITIES.map((capability: ModelCapability) => (
                    <label key={capability}>
                      <input
                        checked={model.capabilities.includes(capability)}
                        type="checkbox"
                        onChange={(event) =>
                          updateModel(key, {
                            capabilities: event.currentTarget.checked
                              ? [...model.capabilities, capability]
                              : model.capabilities.filter((entry) => entry !== capability),
                          })
                        }
                      />
                      {capability}
                    </label>
                  ))}
                </div>
              </div>
              <div className="settings-row__control routey-settings__model-controls">
                <SettingsSelect<ModelTier>
                  label={`Tier for ${model.modelId}`}
                  options={TIER_OPTIONS}
                  value={model.tier}
                  onChange={(tier) => updateModel(key, { tier })}
                />
                <button
                  aria-label={`Move ${model.modelId} up`}
                  className="icon-button"
                  disabled={index === 0}
                  type="button"
                  onClick={() => moveModel(key, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${model.modelId} down`}
                  className="icon-button"
                  disabled={index === config.roster.length - 1}
                  type="button"
                  onClick={() => moveModel(key, 1)}
                >
                  ↓
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() =>
                    save({
                      ...config,
                      roster: config.roster.filter((entry) => modelKey(entry) !== key),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
        {addable.length > 0 ? (
          <SettingsRow title="Add a model" description="Models your providers can run right now.">
            <div className="settings-row__actions">
              <SettingsSelect
                label="Model to add"
                options={addable.map((model) => ({ value: modelKey(model), label: model.label }))}
                value={addKey}
                onChange={setAddKey}
              />
              <button
                className="button button--secondary"
                disabled={!addKey}
                type="button"
                onClick={() => {
                  const model = addable.find((entry) => modelKey(entry) === addKey);
                  if (!model) return;
                  setAddKey(undefined);
                  save({
                    ...config,
                    roster: [
                      ...config.roster,
                      {
                        provider: model.provider,
                        modelId: model.modelId,
                        tier: "hosted",
                        capabilities: model.supportsImages ? ["general", "vision"] : ["general"],
                        goodAt: "",
                      },
                    ],
                  });
                }}
              >
                Add
              </button>
            </div>
          </SettingsRow>
        ) : null}
      </SettingsGroup>

      <SettingsGroup
        title="Projects"
        description="Folders found in Claude, Codex, pi and Cursor transcripts. The router may start a session in any of these unless you exclude it."
      >
        {overview.projects.length === 0 && config.excludedProjects.length === 0 ? (
          <SettingsRow title="No projects found yet" />
        ) : null}
        {[...overview.projects.map((project) => project.path), ...config.excludedProjects].map(
          (path) => {
            const project = overview.projects.find((entry) => entry.path === path);
            const isExcluded = excluded.has(path);
            return (
              <SettingsRow
                key={path}
                title={path.split("/").filter(Boolean).at(-1) ?? path}
                description={
                  project
                    ? `${path} · ${project.sources.join(", ")} · ${formatRelativeTime(project.lastUsedAt)}`
                    : `${path} · excluded`
                }
              >
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() =>
                    save({
                      ...config,
                      excludedProjects: isExcluded
                        ? config.excludedProjects.filter((entry) => entry !== path)
                        : [...config.excludedProjects, path],
                    })
                  }
                >
                  {isExcluded ? "Include" : "Exclude"}
                </button>
              </SettingsRow>
            );
          },
        )}
      </SettingsGroup>
    </>
  );
}
