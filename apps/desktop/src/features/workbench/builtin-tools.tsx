import type { ComponentType, ReactNode } from "react";
import { BUILTIN_TOOL_KINDS, type BuiltinToolKind } from "../../../contracts/workbench";
import {
  FileIcon,
  ModelIcon,
  ReasoningIcon,
  StatusIcon,
  TerminalIcon,
  WorktreeIcon,
} from "../../ui/icons";

interface BuiltinToolDefinition {
  readonly label: string;
  /** Shown in the tool chooser. */
  readonly description: string;
  readonly Icon: ComponentType;
  /** Key that toggles the tool with the platform modifier, when it has one. */
  readonly shortcutKey?: string;
}

/** Presentation for every built-in tool; a missing kind fails the build. */
export const BUILTIN_TOOLS = {
  info: {
    label: "Info",
    description: "Where this session works, its models and its purpose",
    Icon: StatusIcon,
  },
  inspector: {
    label: "Inspector",
    description: "Why the router picked each turn's model, mode and effort",
    Icon: ReasoningIcon,
  },
  stats: {
    label: "Stats",
    description: "Turns and tokens per model, for this session or all sessions",
    Icon: ModelIcon,
  },
  gitbutler: {
    label: "GitButler",
    description: "Branches, commits and uncommitted changes from but status",
    Icon: WorktreeIcon,
    shortcutKey: "R",
  },
  files: { label: "Files", description: "Browse files in this checkout", Icon: FileIcon },
  terminal: {
    label: "Terminal",
    description: "Run commands in this task's checkout",
    Icon: TerminalIcon,
    shortcutKey: "J",
  },
} as const satisfies Record<BuiltinToolKind, BuiltinToolDefinition>;

/** Chooser order follows the contract's kind list. */
export const BUILTIN_TOOL_ENTRIES = BUILTIN_TOOL_KINDS.map(
  (kind): BuiltinToolDefinition & { readonly kind: BuiltinToolKind } => ({
    kind,
    ...BUILTIN_TOOLS[kind],
  }),
);

/** The composition root supplies one panel per built-in tool; rendered only while selected. */
type BuiltinToolPanels = Record<BuiltinToolKind, () => ReactNode>;

/** Requires a panel for every built-in kind, so a new tool cannot silently render nothing. */
export function renderBuiltinToolPanel(
  kind: BuiltinToolKind,
  panels: BuiltinToolPanels,
): ReactNode {
  return panels[kind]();
}
