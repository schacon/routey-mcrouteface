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
