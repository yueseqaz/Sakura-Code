import { spawnSync } from "node:child_process";
import { assertSafePath, truncate } from "../utils/security.js";
import type { ToolHandler, ToolDef, GitArgs, GitCommitArgs } from "../types.js";

function git(args: string[], cwd = process.cwd()): string {
  const r = spawnSync("git", args, { encoding: "utf8", cwd });
  const out = [r.stdout?.trim(), r.stderr?.trim()].filter(Boolean).join("\n");
  return out || `[exit ${r.status}]`;
}

// ─── git_status ───────────────────────────────────────────────────────────────
export const gitStatusTool: ToolHandler = {
  name: "git_status",
  schema: {
    type: "function",
    function: {
      name: "git_status",
      description: "Show the working tree status (staged, unstaged, untracked files).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = "." } = args as unknown as GitArgs;
    const abs = assertSafePath(path);
    const branch = git(["branch", "--show-current"], abs);
    const status = git(["status", "--short"], abs);
    const log = git(["log", "--oneline", "-5"], abs);
    return `Branch: ${branch}\n\nStatus:\n${status || "(clean)"}\n\nRecent commits:\n${log}`;
  },
};

// ─── git_diff ─────────────────────────────────────────────────────────────────
export const gitDiffTool: ToolHandler = {
  name: "git_diff",
  schema: {
    type: "function",
    function: {
      name: "git_diff",
      description: "Show diff of unstaged or staged changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          staged: { type: "boolean", description: "Show staged diff (default: false = unstaged)" },
          file: { type: "string", description: "Limit diff to a specific file" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", staged = false, file } = args as unknown as GitArgs & { staged?: boolean; file?: string };
    const abs = assertSafePath(path);
    const diffArgs = ["diff", "--stat"];
    if (staged) diffArgs.push("--cached");
    if (file) diffArgs.push("--", file);

    const stat = git(diffArgs, abs);
    const fullArgs = ["diff"];
    if (staged) fullArgs.push("--cached");
    if (file) fullArgs.push("--", file);
    const full = git(fullArgs, abs);

    return truncate(`${stat}\n\n${full || "(no changes)"}`);
  },
};

// ─── git_commit ───────────────────────────────────────────────────────────────
export const gitCommitTool: ToolHandler = {
  name: "git_commit",
  schema: {
    type: "function",
    function: {
      name: "git_commit",
      description: "Stage all changes and create a git commit.",
      parameters: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string", description: "Commit message" },
          path: { type: "string", description: "Repo directory (default: cwd)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { message, path = "." } = args as unknown as GitCommitArgs;
    const abs = assertSafePath(path);

    const add = git(["add", "-A"], abs);
    const status = git(["status", "--short"], abs);
    if (!status.trim()) return "Nothing to commit — working tree is clean.";

    const commit = git(["commit", "-m", message], abs);
    return `${add}\n${commit}`;
  },
};
