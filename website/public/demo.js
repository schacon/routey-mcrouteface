const examples = {
  question: {
    prompt: "In my app, what does the session queue do?",
    tier: "Local",
    thinking: "Low",
    mode: "Plan",
    directory: "~/projects/my-app",
    reason:
      "A local model can read the code and explain the queue. The big rocket can stay parked.",
  },
  code: {
    prompt: "Oh. Two sessions can grab the same job. Fix that race condition.",
    tier: "Frontier",
    thinking: "High",
    mode: "Execute",
    directory: "~/projects/my-app",
    reason:
      "Concurrency trouble. Time for a frontier model, more thinking, and tools to edit the code. Big noggin, you're up.",
  },
  summary: {
    prompt: "Explain that fix like I'm a slightly confused duck.",
    tier: "Local",
    thinking: "Off",
    mode: "Answer",
    directory: "~/projects/my-app",
    reason:
      "A short explanation can go back to a local model. Same chat, same project. The rocket has left the meeting. Honk.",
  },
};

const controls = document.querySelector(".example-controls");
const buttons = document.querySelectorAll("button[data-example]");

for (const button of buttons) {
  button.addEventListener("click", () => {
    const key = button.getAttribute("data-example");
    if (key !== "question" && key !== "code" && key !== "summary") return;
    const example = examples[key];

    for (const [field, value] of Object.entries(example)) {
      const element = document.getElementById(`example-${field}`);
      if (element) element.textContent = value;
    }
    for (const option of buttons) {
      option.setAttribute("aria-pressed", String(option === button));
    }
  });
}

if (controls instanceof HTMLElement) controls.hidden = false;
