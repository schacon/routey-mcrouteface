// Hero: type a prompt, scan the model chips, pick one, repeat. Illustrative only.
const models = {
  claude: { name: "Claude", where: "cloud" },
  openai: { name: "OpenAI", where: "cloud" },
  qwen: { name: "Qwen", where: "cloud" },
  muse: { name: "Muse Glimmer", where: "local" },
  oss: { name: "GPT-oss", where: "local" },
};

const script = [
  {
    prompt: "Rename 400 vacation photos by vibe",
    model: "muse",
    quip: "your beach pics stay home",
  },
  {
    prompt: "Plan a refactor of our billing system without crying",
    model: "claude",
    quip: "big brain rented. crying optional.",
  },
  {
    prompt: "Write a haiku apologizing to my houseplants",
    model: "oss",
    quip: "no data center needed for remorse",
  },
  {
    prompt: "Translate the menu for grandma’s 90th",
    model: "qwen",
    quip: "grandma deserves the good model",
  },
  {
    prompt: "Summarize these 83 open browser tabs",
    model: "openai",
    quip: "long context, longer tabs",
  },
];

// Samples for the "Where would Routey send it?" picker. Keep index 0 in sync with the HTML.
const samples = [
  {
    verdict: "Local, obviously.",
    reason:
      "Receipts are private and the clicking is easy. A small on-device model handles it without phoning anyone.",
    lat: "1.2s",
    cost: "0.00",
    priv: "never leaves",
    dest: "local",
  },
  {
    verdict: "Hosted. Big brain time.",
    reason:
      "Long-horizon planning with lots of backtracking. Routey rents a frontier model for the thinking bits.",
    lat: "6.8s",
    cost: "0.04",
    priv: "no secrets seen",
    dest: "cloud",
  },
  {
    verdict: "Both. Relay race.",
    reason:
      "Local model scrubs names and addresses, hosted model writes the diplomacy, local model types it in.",
    lat: "3.1s",
    cost: "0.01",
    priv: "redacted first",
    dest: "both",
  },
  {
    verdict: "Local. Come on.",
    reason: "Sending this to the cloud would be like hiring a limo to cross the street.",
    lat: "0.3s",
    cost: "0.00",
    priv: "never leaves",
    dest: "local",
  },
];

const PLACEHOLDER = "Ask anything. Routey picks the model and effort.";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** @param {string} id */
const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

const composer = /** @type {HTMLElement} */ (document.querySelector(".composer"));
const typed = byId("typed");
const routeStatus = byId("route-status");
const quip = byId("quip");
const chips = /** @type {HTMLElement[]} */ ([...document.querySelectorAll(".chip")]);

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {string} phase @param {string} text */
function setComposer(phase, text) {
  composer.dataset.phase = phase;
  composer.classList.toggle("has-text", text.length > 0);
  typed.textContent = text || PLACEHOLDER;
}

/** @param {(chip: HTMLElement, index: number) => "picked" | "scanned" | null} stateFor */
function setChips(stateFor) {
  chips.forEach((chip, index) => {
    const state = stateFor(chip, index);
    chip.classList.toggle("picked", state === "picked");
    chip.classList.toggle("scanned", state === "scanned");
  });
}

async function playHero() {
  setInterval(() => composer.classList.toggle("caret-on"), 480);
  for (let i = 0; ; i = (i + 1) % script.length) {
    const step = script[i];
    const model = models[/** @type {keyof typeof models} */ (step.model)];
    setChips(() => null);
    setComposer("typing", "");
    composer.classList.add("typing-busy");
    routeStatus.textContent = "idle";
    quip.textContent = "“go on, I’m listening”";
    await wait(700);

    routeStatus.textContent = "typing…";
    if (reducedMotion.matches) {
      setComposer("typing", step.prompt);
    } else {
      for (let n = 1; n <= step.prompt.length; n++) {
        setComposer("typing", step.prompt.slice(0, n));
        await wait(42);
      }
    }
    composer.classList.remove("typing-busy");
    await wait(450);

    setComposer("routing", step.prompt);
    routeStatus.textContent = "squinting at it…";
    quip.textContent = "“hmm. hmmmm.”";
    if (reducedMotion.matches) {
      await wait(600);
    } else {
      for (let n = 0; n < 9; n++) {
        setChips((_, index) => (index === n % chips.length ? "scanned" : null));
        await wait(110 + (n + 1) * 12);
      }
    }

    setComposer("sent", step.prompt);
    setChips((chip) => (chip.dataset.model === step.model ? "picked" : null));
    routeStatus.textContent = `→ ${model.name} · ${model.where}`;
    quip.textContent = `“${step.quip}”`;
    await wait(2600);
  }
}

const flow = byId("flow");
const sampleButtons = document.querySelectorAll("button[data-sample]");
for (const button of sampleButtons) {
  button.addEventListener("click", () => {
    const sample = samples[Number(button.getAttribute("data-sample"))];
    if (!sample) return;
    flow.dataset.dest = sample.dest;
    for (const field of /** @type {const} */ (["verdict", "reason", "lat", "cost", "priv"])) {
      byId(field).textContent = sample[field];
    }
    for (const option of sampleButtons) {
      option.setAttribute("aria-pressed", String(option === button));
    }
  });
}

void playHero();
