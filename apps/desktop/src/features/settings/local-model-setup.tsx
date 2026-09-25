import { useEffect, useState } from "react";
import type { PiDesktopApi } from "../../../contracts/ipc";
import type { LocalModelSetup, LocalModelStatus } from "../../../contracts/local-models";

const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download";

/** The setup state, refreshed whenever the router reports a change (including pull progress). */
export function useLocalModelSetup(api: PiDesktopApi | undefined) {
  const [setup, setSetup] = useState<LocalModelSetup | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!api) return;
    let current = true;
    const load = () => {
      api.getLocalModelSetup().then(
        (next) => {
          if (current) {
            setSetup(next);
            setError(undefined);
          }
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
  }, [api, nonce]);

  return { setup, error, setError, setSetup, refresh: () => setNonce((value) => value + 1) };
}

function statusText(model: LocalModelStatus): string | undefined {
  const pull = model.pull;
  if (pull?.state === "queued") return "Queued";
  if (pull?.state === "pulling") {
    return pull.total && pull.completed !== undefined
      ? `Downloading ${Math.round((pull.completed / pull.total) * 100)}%`
      : pull.status;
  }
  if (pull?.state === "failed") return `Failed: ${pull.message}`;
  if (model.routed) return "In use";
  if (model.installedTag) return "Installed";
  if (!model.fits) return `Needs ${model.profile.minMemoryGb} GB of memory`;
  return undefined;
}

/**
 * Onboarding for local models: install Ollama when it is missing, then pick
 * from recommended small models for routing. Chosen models are pulled when
 * missing, registered with pi and added to the router's local tier.
 */
export function LocalModelSetupGuide({ api }: { readonly api: PiDesktopApi }) {
  const { setup, error, setError, setSetup, refresh } = useLocalModelSetup(api);
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);

  if (!setup) {
    return <p className="settings-row__description">{error ?? "Checking for Ollama…"}</p>;
  }

  if (setup.ollama === "unreachable") {
    return (
      <div className="routey-setup" data-testid="local-setup-install">
        <p>
          Routey runs quick, private work on small local models through <strong>Ollama</strong>, and
          uses one of them to route every prompt. Ollama isn’t answering at{" "}
          <code>{setup.ollamaUrl}</code>.
        </p>
        <ol className="routey-setup__steps">
          <li>
            Install Ollama: download it for Mac, or run <code>brew install ollama</code>.
          </li>
          <li>
            Start it: open the Ollama app, or run <code>ollama serve</code> in a terminal.
          </li>
          <li>Come back here and check again to choose models.</li>
        </ol>
        <div className="settings-row__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              void api.openExternal(OLLAMA_DOWNLOAD_URL).catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : String(reason));
              });
            }}
          >
            Download Ollama
          </button>
          <button className="button button--secondary" type="button" onClick={refresh}>
            Check again
          </button>
        </div>
      </div>
    );
  }

  const busy = setup.models.some(
    (model) => model.pull?.state === "queued" || model.pull?.state === "pulling",
  );
  const defaults = new Set(
    setup.models
      .filter((model) => model.profile.recommended && model.fits && !model.routed)
      .map((model) => model.profile.tag),
  );
  const chosen = selected ?? defaults;
  const choosable = (model: LocalModelStatus) => !model.routed && model.fits;
  const downloadGb = setup.models
    .filter((model) => chosen.has(model.profile.tag) && !model.installedTag)
    .reduce((sum, model) => sum + model.profile.sizeGb, 0);

  return (
    <div className="routey-setup" data-testid="local-setup-models">
      <p>
        {setup.needsSetup
          ? "Choose local models for Routey to route easy work to. Models you already have are set up without downloading."
          : "Add more local models. Each is used only for the kinds of work it is good at."}{" "}
        This Mac has {setup.memoryGb} GB of memory.
      </p>
      <ul className="routey-setup__models">
        {setup.models.map((model) => {
          const status = statusText(model);
          return (
            <li key={model.profile.tag} className="routey-setup__model">
              <label>
                <input
                  checked={model.routed || chosen.has(model.profile.tag)}
                  disabled={!choosable(model) || busy}
                  type="checkbox"
                  onChange={(event) => {
                    const next = new Set(chosen);
                    if (event.currentTarget.checked) next.add(model.profile.tag);
                    else next.delete(model.profile.tag);
                    setSelected(next);
                  }}
                />
                <span className="routey-setup__model-name">{model.profile.name}</span>
                <span className="routey-panel__muted">
                  {model.profile.sizeGb} GB · {model.profile.speed}
                  {model.profile.thinking === "always" ? " · always thinks" : ""}
                </span>
              </label>
              <p className="routey-setup__summary">{model.profile.summary}</p>
              {status ? <p className="routey-setup__status">{status}</p> : null}
            </li>
          );
        })}
      </ul>
      <div className="settings-row__actions">
        <button
          className="button button--secondary"
          data-testid="local-setup-apply"
          disabled={busy || chosen.size === 0}
          type="button"
          onClick={() => {
            setError(undefined);
            api.setUpLocalModels([...chosen]).then(
              (next) => {
                setSetup(next);
                setSelected(null);
              },
              (reason: unknown) => {
                setError(reason instanceof Error ? reason.message : String(reason));
              },
            );
          }}
        >
          {busy
            ? "Setting up…"
            : downloadGb > 0
              ? `Set up ${chosen.size} ${chosen.size === 1 ? "model" : "models"} (downloads ${Math.round(downloadGb)} GB)`
              : `Set up ${chosen.size} ${chosen.size === 1 ? "model" : "models"}`}
        </button>
      </div>
      {error ? <p className="routey-settings__error">{error}</p> : null}
    </div>
  );
}
