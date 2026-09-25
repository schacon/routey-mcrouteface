import { useEffect, useState } from "react";
import type { PiDesktopApi } from "../../../contracts/ipc";
import {
  DIFFICULTY_BANDS,
  MODEL_TIERS,
  TASK_KINDS,
  type RosterModelUse,
  type RouterOverview,
  type ModelTier,
  type RouteUse,
  type TaskKind,
} from "../../../contracts/router";

const KIND_LABELS: Record<TaskKind, string> = {
  coding: "coding",
  general: "general questions",
  app: "Routey settings",
  writing: "writing",
  research: "research",
};

const TIER_LABELS: Record<ModelTier, string> = {
  local: "Local",
  hosted: "Hosted",
  frontier: "Frontier",
};

function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** "Easy general questions and writing; hard coding." from the router's routing table. */
export function describeModelUses(uses: readonly RouteUse[]): string {
  if (uses.length === 0) {
    return "Not picked right now: another model comes first in its tier.";
  }
  const phrases = DIFFICULTY_BANDS.flatMap((band) => {
    const kinds = TASK_KINDS.filter((kind) =>
      uses.some((use) => use.difficulty === band && use.taskKind === kind),
    );
    if (kinds.length === 0) return [];
    return kinds.length === TASK_KINDS.length
      ? [`every ${band} prompt`]
      : [`${band} ${joinWords(kinds.map((kind) => KIND_LABELS[kind]))}`];
  });
  const sentence = phrases.join("; ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/** The models Routey can use now, and what the router sends to each. */
export function InfoAvailableModels({ api }: { readonly api: PiDesktopApi }) {
  const [overview, setOverview] = useState<RouterOverview | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let current = true;
    const load = () => {
      api.getRouterOverview().then(
        (next) => {
          if (current) setOverview(next);
        },
        (reason: unknown) => {
          if (current) setError(reason instanceof Error ? reason.message : String(reason));
        },
      );
    };
    load();
    const unsubscribe = api.onRouterChanged((target) => {
      if (!target) load();
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [api]);

  if (!overview) {
    return <p className="routey-panel__muted">{error ?? "Loading models…"}</p>;
  }
  if (overview.modelUses.length === 0) {
    return (
      <p className="routey-panel__muted">
        No models are available yet. Connect a provider, then add models in Settings → Router.
      </p>
    );
  }
  const goodAt = new Map(
    overview.config.roster.map((model) => [`${model.provider}/${model.modelId}`, model.goodAt]),
  );
  // Only models the router would actually pick; the rest wait behind another
  // model in their tier and can be reordered in Settings -> Router.
  const picked = overview.modelUses.filter((model) => model.uses.length > 0);
  return (
    <div className="routey-available-models" data-testid="info-available-models">
      {MODEL_TIERS.map((tier) => {
        const models = picked.filter((model) => model.tier === tier);
        if (models.length === 0) return null;
        return (
          <div key={tier} className="routey-available-models__tier">
            <div className="routey-available-models__tier-name">
              <span className={`routey-tier routey-tier--${tier}`}>{TIER_LABELS[tier]}</span>
            </div>
            <ul className="routey-panel__list">
              {models.map((model: RosterModelUse) => {
                const key = `${model.provider}/${model.modelId}`;
                const note = goodAt.get(key);
                return (
                  <li key={key} className="routey-available-model">
                    <span className="routey-panel__model-name" title={key}>
                      {model.modelId}
                    </span>
                    <p className="routey-available-model__use">{describeModelUses(model.uses)}</p>
                    {note ? <p className="routey-panel__muted">{note}</p> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
