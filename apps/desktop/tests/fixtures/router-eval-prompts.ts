import type { RouteMode, TaskKind } from "../../contracts/router";

/**
 * Labeled prompts for scoring the router. `project` is the folder name a new
 * session should run in ("scratch" for the scratch directory); leave a label
 * undefined when more than one answer is reasonable, and it is not scored.
 *
 * Expected modes follow the policy: coding runs in execute unless the user only
 * wants an explanation, review or plan; research reads (plan); general, app and
 * writing answer without tools.
 */
export interface RouterEvalCase {
  readonly prompt: string;
  readonly kind: TaskKind;
  readonly mode?: RouteMode;
  readonly project?: string;
}

/** Projects the eval pretends the user has worked in, most recent first. */
export const EVAL_PROJECTS = [
  "/Users/eval/projects/pi-gui",
  "/Users/eval/projects/blogerator",
  "/Users/eval/projects/gitbutler",
  "/Users/eval/projects/git-merge-26",
  "/Users/eval/projects/slide-engine",
] as const;

export const ROUTER_EVAL_CASES: readonly RouterEvalCase[] = [
  // Coding in a named project.
  {
    prompt: "in pi-gui, refactor the workbench panel persistence to use sqlite",
    kind: "coding",
    mode: "execute",
    project: "pi-gui",
  },
  {
    prompt: "explain how the router in pi-gui decides which model to use",
    kind: "coding",
    mode: "plan",
    project: "pi-gui",
  },
  {
    prompt: "add a dark mode toggle to blogerator",
    kind: "coding",
    mode: "execute",
    project: "blogerator",
  },
  {
    prompt: "why does the gitbutler build fail after the rust toolchain update?",
    kind: "coding",
    mode: "plan",
    project: "gitbutler",
  },
  {
    prompt: "bump the electron version in pi-gui and fix whatever breaks",
    kind: "coding",
    mode: "execute",
    project: "pi-gui",
  },
  {
    prompt: "review the last commit in slide-engine for bugs",
    kind: "coding",
    mode: "plan",
    project: "slide-engine",
  },
  {
    prompt: "write unit tests for the slide parser in slide-engine",
    kind: "coding",
    mode: "execute",
    project: "slide-engine",
  },
  {
    prompt: "plan how we would add RSS feeds to blogerator, don't change anything yet",
    kind: "coding",
    mode: "plan",
    project: "blogerator",
  },
  {
    prompt: "rename the Topbar component in pi-gui to HeaderBar",
    kind: "coding",
    mode: "execute",
    project: "pi-gui",
  },
  {
    prompt: "in git-merge-26, write a script that builds a changelog from the commit history",
    kind: "coding",
    mode: "execute",
    project: "git-merge-26",
  },

  // Coding without a named project.
  {
    prompt: "write a python script that renames my photos by the date they were taken",
    kind: "coding",
    mode: "execute",
    project: "scratch",
  },
  { prompt: "fix the failing test in parser.rs", kind: "coding", mode: "execute" },
  {
    prompt: "what does this regex do: ^(?=.*\\d)(?=.*[a-z]).{8,}$",
    kind: "coding",
    mode: "plan",
    project: "scratch",
  },
  {
    prompt: "write a bash one-liner to find the largest files in a directory",
    kind: "coding",
    project: "scratch",
  },
  {
    prompt: "set up a new Next.js project with Tailwind",
    kind: "coding",
    mode: "execute",
    project: "scratch",
  },
  { prompt: "debug why my node server leaks memory under load", kind: "coding", mode: "execute" },
  {
    prompt: "implement a binary search tree in Rust with insert and delete",
    kind: "coding",
    mode: "execute",
    project: "scratch",
  },
  {
    prompt: "how do I undo my last git commit but keep the changes?",
    kind: "coding",
    project: "scratch",
  },

  // General questions.
  { prompt: "what is the capital of Peru?", kind: "general", mode: "answer", project: "scratch" },
  {
    prompt: "explain how vaccines train the immune system",
    kind: "general",
    mode: "answer",
    project: "scratch",
  },
  { prompt: "hi, how are you?", kind: "general", mode: "answer", project: "scratch" },
  {
    prompt: "what's the difference between a latte and a flat white?",
    kind: "general",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "how many ounces are in a liter?",
    kind: "general",
    mode: "answer",
    project: "scratch",
  },
  { prompt: "tell me a joke about compilers", kind: "general", mode: "answer", project: "scratch" },
  {
    prompt: "what causes the northern lights?",
    kind: "general",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "summarize the plot of Hamlet in three sentences",
    kind: "general",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "is it safe to eat raw cookie dough?",
    kind: "general",
    mode: "answer",
    project: "scratch",
  },

  // About the app's own settings.
  {
    prompt: "use a local model for coding questions from now on",
    kind: "app",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "which models do you have configured?",
    kind: "app",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "always use high thinking for code reviews",
    kind: "app",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "don't use frontier models for simple questions",
    kind: "app",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "add qwen3-coder as a local coding model",
    kind: "app",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "stop routing anything to the deepseek server",
    kind: "app",
    mode: "answer",
    project: "scratch",
  },
  { prompt: "what are your current settings?", kind: "app", mode: "answer", project: "scratch" },
  { prompt: "exclude the blogerator project from routing", kind: "app", mode: "answer" },

  // Writing.
  {
    prompt: "draft a friendly email declining the meeting on friday",
    kind: "writing",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "write a blog post announcing that our beta is open to everyone",
    kind: "writing",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "proofread this paragraph: their going to the store tomorow and they wants apples",
    kind: "writing",
    mode: "answer",
    project: "scratch",
  },
  { prompt: "write a haiku about autumn", kind: "writing", mode: "answer", project: "scratch" },
  {
    prompt: "rewrite my bio to sound more professional: I build dev tools and like bikes",
    kind: "writing",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "write a cover letter for a senior engineer role",
    kind: "writing",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "make this tweet punchier: we shipped a thing today",
    kind: "writing",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "draft release notes for version 2.0 of blogerator",
    kind: "writing",
    project: "blogerator",
  },

  // Research.
  {
    prompt: "find recent papers on speculative decoding and summarize them",
    kind: "research",
    mode: "plan",
    project: "scratch",
  },
  {
    prompt: "what's the latest news on the EU AI act?",
    kind: "research",
    mode: "plan",
    project: "scratch",
  },
  {
    prompt: "compare the current pricing of the top three vector databases",
    kind: "research",
    mode: "plan",
    project: "scratch",
  },
  {
    prompt: "look up how other apps handle model routing and summarize the approaches",
    kind: "research",
    mode: "plan",
    project: "scratch",
  },
  {
    prompt: "what happened in the stock market today?",
    kind: "research",
    mode: "plan",
    project: "scratch",
  },
  {
    prompt: "search the web for benchmarks of small decision models",
    kind: "research",
    mode: "plan",
    project: "scratch",
  },
  {
    prompt: "what are people saying about the new MacBook Pro this week?",
    kind: "research",
    mode: "plan",
    project: "scratch",
  },
];

/**
 * Held-out prompts, written after the cues were tuned against the set above.
 * Never tune cues or questions against these: they measure how routing
 * generalizes. Add new tuning cases to ROUTER_EVAL_CASES instead.
 */
export const ROUTER_HELDOUT_CASES: readonly RouterEvalCase[] = [
  {
    prompt: "the login page in blogerator is broken on mobile, can you fix it",
    kind: "coding",
    mode: "execute",
    project: "blogerator",
  },
  {
    prompt: "walk me through how sessions are persisted in pi-gui",
    kind: "coding",
    mode: "plan",
    project: "pi-gui",
  },
  {
    prompt: "add a --dry-run flag to the git-merge-26 cli",
    kind: "coding",
    mode: "execute",
    project: "git-merge-26",
  },
  {
    prompt: "what would it take to port slide-engine to Deno?",
    kind: "coding",
    mode: "plan",
    project: "slide-engine",
  },
  {
    prompt: "gitbutler: make the commit message editor autosave",
    kind: "coding",
    mode: "execute",
    project: "gitbutler",
  },
  {
    prompt: "clean up the dead code in pi-gui's settings folder",
    kind: "coding",
    mode: "execute",
    project: "pi-gui",
  },
  {
    prompt: "write a Go function that parses ISO 8601 durations",
    kind: "coding",
    mode: "execute",
    project: "scratch",
  },
  { prompt: "my docker container can't reach the host network, help", kind: "coding" },
  {
    prompt: "generate a SQL query that finds duplicate emails in a users table",
    kind: "coding",
    project: "scratch",
  },
  {
    prompt: "create a small Flask app with a health check endpoint",
    kind: "coding",
    mode: "execute",
    project: "scratch",
  },
  { prompt: "why is my React component rendering twice?", kind: "coding", mode: "plan" },
  {
    prompt: "how far is the moon from earth?",
    kind: "general",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "what's a good name for a golden retriever puppy?",
    kind: "general",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "explain the difference between weather and climate",
    kind: "general",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "how do I get red wine out of a carpet?",
    kind: "general",
    mode: "answer",
    project: "scratch",
  },
  { prompt: "who wrote Pride and Prejudice?", kind: "general", mode: "answer", project: "scratch" },
  {
    prompt: "prefer the cheaper hosted model for writing tasks",
    kind: "app",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "show me which projects you can work in",
    kind: "app",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "turn off thinking for quick questions",
    kind: "app",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "make gpt-oss the default frontier model",
    kind: "app",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "why did you pick that model for my last message?",
    kind: "app",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "write a thank-you note to my team for shipping the release",
    kind: "writing",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "help me word a polite complaint to my landlord about the heating",
    kind: "writing",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "turn these bullet points into a paragraph: fast, private, local",
    kind: "writing",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "write a short story about a robot learning to paint",
    kind: "writing",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "suggest a catchy title for my talk about agent routing",
    kind: "writing",
    mode: "answer",
    project: "scratch",
  },
  {
    prompt: "what are the best-reviewed noise cancelling headphones right now?",
    kind: "research",
    mode: "plan",
    project: "scratch",
  },
  {
    prompt: "find out what changed in the latest Node.js release",
    kind: "research",
    mode: "plan",
    project: "scratch",
  },
  {
    prompt: "who won the most recent Formula 1 race?",
    kind: "research",
    mode: "plan",
    project: "scratch",
  },
  {
    prompt: "gather sources on the health effects of intermittent fasting",
    kind: "research",
    mode: "plan",
    project: "scratch",
  },
];

/** A follow-up in an existing session, with the turn before it. */
export interface RouterFollowUpCase extends RouterEvalCase {
  readonly previousPrompt: string;
  readonly previousKind: TaskKind;
  readonly previousMode: RouteMode;
}

/**
 * Follow-ups are classified with the previous request as context, and bare
 * continuations ("do it", "try again") keep the previous turn's routing. The
 * first case is the conversation that routed a coding follow-up to a local
 * model without tools.
 */
export const ROUTER_FOLLOWUP_CASES: readonly RouterFollowUpCase[] = [
  {
    previousPrompt: "look at my nvim setup and tell me what to do exactly",
    previousKind: "coding",
    previousMode: "execute",
    prompt: "do it for me - fully disabled",
    kind: "coding",
    mode: "execute",
  },
  {
    previousPrompt: "look at my nvim setup and tell me what to do exactly",
    previousKind: "coding",
    previousMode: "execute",
    prompt: "try again",
    kind: "coding",
    mode: "execute",
  },
  {
    previousPrompt: "how do I turn off autocomplete in neovim",
    previousKind: "coding",
    previousMode: "plan",
    prompt: "make it disabled only for markdown files instead",
    kind: "coding",
  },
  {
    previousPrompt: "write a python script that renames my photos by date",
    previousKind: "coding",
    previousMode: "execute",
    prompt: "also handle heic files",
    kind: "coding",
    mode: "execute",
  },
  {
    previousPrompt: "draft a friendly email declining the meeting on friday",
    previousKind: "writing",
    previousMode: "answer",
    prompt: "make it shorter and less formal",
    kind: "writing",
    mode: "answer",
  },
  {
    previousPrompt: "draft a friendly email declining the meeting on friday",
    previousKind: "writing",
    previousMode: "answer",
    prompt: "now what's the capital of Peru?",
    kind: "general",
    mode: "answer",
  },
  {
    previousPrompt: "what's the latest news on the EU AI act?",
    previousKind: "research",
    previousMode: "plan",
    prompt: "what about the UK?",
    kind: "research",
    mode: "plan",
  },
  {
    previousPrompt: "in pi-gui, explain how sessions are persisted",
    previousKind: "coding",
    previousMode: "plan",
    prompt: "ok now refactor it to use sqlite",
    kind: "coding",
    mode: "execute",
  },
  {
    previousPrompt: "which models do you have configured?",
    previousKind: "app",
    previousMode: "answer",
    prompt: "use the local one for everything simple",
    kind: "app",
    mode: "answer",
  },
  {
    previousPrompt: "explain how vaccines train the immune system",
    previousKind: "general",
    previousMode: "answer",
    prompt: "turn that into a short poem",
    kind: "writing",
    mode: "answer",
  },
];
