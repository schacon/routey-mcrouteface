const examples = {
  question: {
    prompt: "What's the capital of Peru?",
    tier: "Local",
    thinking: "Off",
    mode: "Answer",
    directory: "~/routey-mcrouteface",
    reason: "A general question can go to a local model, without opening a project or using tools.",
  },
  plan: {
    prompt: "In my website project, plan a simpler navigation.",
    tier: "Hosted",
    thinking: "Medium",
    mode: "Plan",
    directory: "~/projects/website",
    reason:
      "This request names a project and asks for a plan. Read-only tools let the agent explore before proposing changes.",
  },
  code: {
    prompt: "In my app, fix the race condition in the session queue.",
    tier: "Frontier",
    thinking: "High",
    mode: "Execute",
    directory: "~/projects/my-app",
    reason:
      "A complex coding task can use a frontier model with more thinking and the tools to make changes.",
  },
};

const controls = document.querySelector(".example-controls");
const buttons = document.querySelectorAll("button[data-example]");

for (const button of buttons) {
  button.addEventListener("click", () => {
    const key = button.getAttribute("data-example");
    if (key !== "question" && key !== "plan" && key !== "code") return;
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
