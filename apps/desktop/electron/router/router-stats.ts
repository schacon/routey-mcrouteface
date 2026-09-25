import type {
  ModelTier,
  ModelTokenUsage,
  RouterDecisionRecord,
  RouterModelStats,
  RouterStats,
} from "../../contracts/router";

interface SessionLog {
  readonly decisions: readonly RouterDecisionRecord[];
  readonly usage: readonly ModelTokenUsage[];
}

/**
 * Routed turns per model (from decisions) and tokens per model (from usage
 * attributed after routed turns), most-used model first.
 */
export function aggregateRouterStats(
  scope: RouterStats["scope"],
  sessions: readonly SessionLog[],
): RouterStats {
  const byModel = new Map<string, RouterModelStats & { tier?: ModelTier }>();
  const entry = (provider: string, modelId: string, tier?: ModelTier) => {
    const key = `${provider}/${modelId}`;
    const existing = byModel.get(key) ?? {
      provider,
      modelId,
      turns: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
    };
    const next = tier && !existing.tier ? { ...existing, tier } : existing;
    byModel.set(key, next);
    return { key, value: next };
  };
  let turns = 0;
  let since: string | undefined;
  for (const session of sessions) {
    for (const record of session.decisions) {
      const { key, value } = entry(
        record.decision.provider,
        record.decision.modelId,
        record.decision.tier,
      );
      byModel.set(key, { ...value, turns: value.turns + 1 });
      turns += 1;
      if (!since || record.timestamp < since) since = record.timestamp;
    }
    for (const usage of session.usage) {
      const { key, value } = entry(usage.provider, usage.modelId);
      byModel.set(key, {
        ...value,
        input: value.input + usage.input,
        output: value.output + usage.output,
        cacheRead: value.cacheRead + usage.cacheRead,
      });
    }
  }
  const models = [...byModel.values()].sort(
    (left, right) =>
      right.turns - left.turns || right.input + right.output - (left.input + left.output),
  );
  return {
    scope,
    sessions: sessions.filter((session) => session.decisions.length > 0).length,
    turns,
    models,
    ...(since ? { since } : {}),
  };
}
