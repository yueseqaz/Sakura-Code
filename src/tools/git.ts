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

// ─── git_log ──────────────────────────────────────────────────────────────────
export const gitLogTool: ToolHandler = {
  name: "git_log",
  schema: {
    type: "function",
    function: {
      name: "git_log",
      description: "Show commit history with optional filtering.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          count: { type: "number", description: "Number of commits to show (default: 20)" },
          file: { type: "string", description: "Show history for specific file" },
          author: { type: "string", description: "Filter by author" },
          search: { type: "string", description: "Search commit messages" },
          oneline: { type: "boolean", description: "Show one line per commit (default: true)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", count = 20, file, author, search, oneline = true } = args as {
      path?: string; count?: number; file?: string; author?: string; search?: string; oneline?: boolean;
    };
    const abs = assertSafePath(path);
    
    const logArgs = ["log"];
    if (oneline) logArgs.push("--oneline");
    logArgs.push(`-${count}`);
    if (author) logArgs.push(`--author=${author}`);
    if (search) logArgs.push(`--grep=${search}`);
    if (file) logArgs.push("--", file);

    return git(logArgs, abs) || "No commits found.";
  },
};

// ─── git_branch ───────────────────────────────────────────────────────────────
export const gitBranchTool: ToolHandler = {
  name: "git_branch",
  schema: {
    type: "function",
    function: {
      name: "git_branch",
      description: "List, create, or delete branches.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          action: { type: "string", enum: ["list", "create", "delete"], description: "Action to perform (default: list)" },
          name: { type: "string", description: "Branch name (for create/delete)" },
          remote: { type: "boolean", description: "Include remote branches (for list)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", action = "list", name, remote } = args as {
      path?: string; action?: string; name?: string; remote?: boolean;
    };
    const abs = assertSafePath(path);

    if (action === "create") {
      if (!name) return "Error: Branch name is required for create action.";
      return git(["branch", name], abs) || `Branch '${name}' created.`;
    }

    if (action === "delete") {
      if (!name) return "Error: Branch name is required for delete action.";
      return git(["branch", "-d", name], abs);
    }

    // List branches
    const args_list = ["branch"];
    if (remote) args_list.push("-a");
    return git(args_list, abs);
  },
};

// ─── git_checkout ─────────────────────────────────────────────────────────────
export const gitCheckoutTool: ToolHandler = {
  name: "git_checkout",
  schema: {
    type: "function",
    function: {
      name: "git_checkout",
      description: "Switch branches or restore files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          branch: { type: "string", description: "Branch name to switch to" },
          create: { type: "boolean", description: "Create new branch and switch to it" },
          file: { type: "string", description: "Restore specific file from HEAD" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", branch, create, file } = args as {
      path?: string; branch?: string; create?: boolean; file?: string;
    };
    const abs = assertSafePath(path);

    if (file) {
      return git(["checkout", "HEAD", "--", file], abs) || `Restored ${file}`;
    }

    if (!branch) return "Error: Branch name is required.";

    const checkoutArgs = ["checkout"];
    if (create) checkoutArgs.push("-b");
    checkoutArgs.push(branch);

    return git(checkoutArgs, abs);
  },
};

// ─── git_stash ────────────────────────────────────────────────────────────────
export const gitStashTool: ToolHandler = {
  name: "git_stash",
  schema: {
    type: "function",
    function: {
      name: "git_stash",
      description: "Stash or restore uncommitted changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          action: { type: "string", enum: ["save", "pop", "list", "drop", "clear"], description: "Stash action (default: save)" },
          message: { type: "string", description: "Stash message (for save)" },
          index: { type: "number", description: "Stash index (for pop/drop)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", action = "save", message, index } = args as {
      path?: string; action?: string; message?: string; index?: number;
    };
    const abs = assertSafePath(path);

    if (action === "list") return git(["stash", "list"], abs) || "No stashes found.";
    if (action === "pop") return git(["stash", "pop", index !== undefined ? String(index) : ""], abs);
    if (action === "drop") return git(["stash", "drop", index !== undefined ? String(index) : ""], abs);
    if (action === "clear") return git(["stash", "clear"], abs);

    // Save
    const saveArgs = ["stash", "push"];
    if (message) saveArgs.push("-m", message);
    return git(saveArgs, abs) || "Nothing to stash.";
  },
};

// ─── git_merge ────────────────────────────────────────────────────────────────
export const gitMergeTool: ToolHandler = {
  name: "git_merge",
  schema: {
    type: "function",
    function: {
      name: "git_merge",
      description: "Merge a branch into the current branch.",
      parameters: {
        type: "object",
        required: ["branch"],
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          branch: { type: "string", description: "Branch to merge" },
          noff: { type: "boolean", description: "Create merge commit even for fast-forward" },
          abort: { type: "boolean", description: "Abort an in-progress merge" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", branch, noff, abort } = args as {
      path?: string; branch?: string; noff?: boolean; abort?: boolean;
    };
    const abs = assertSafePath(path);

    if (abort) return git(["merge", "--abort"], abs);
    if (!branch) return "Error: Branch name is required.";

    const mergeArgs = ["merge"];
    if (noff) mergeArgs.push("--no-ff");
    mergeArgs.push(branch);

    return git(mergeArgs, abs);
  },
};

// ─── git_pull ─────────────────────────────────────────────────────────────────
export const gitPullTool: ToolHandler = {
  name: "git_pull",
  schema: {
    type: "function",
    function: {
      name: "git_pull",
      description: "Pull changes from remote repository.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          remote: { type: "string", description: "Remote name (default: origin)" },
          branch: { type: "string", description: "Branch to pull" },
          rebase: { type: "boolean", description: "Use rebase instead of merge" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", remote = "origin", branch, rebase } = args as {
      path?: string; remote?: string; branch?: string; rebase?: boolean;
    };
    const abs = assertSafePath(path);

    const pullArgs = ["pull", remote];
    if (rebase) pullArgs.push("--rebase");
    if (branch) pullArgs.push(branch);

    return git(pullArgs, abs);
  },
};

// ─── git_push ─────────────────────────────────────────────────────────────────
export const gitPushTool: ToolHandler = {
  name: "git_push",
  schema: {
    type: "function",
    function: {
      name: "git_push",
      description: "Push changes to remote repository.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          remote: { type: "string", description: "Remote name (default: origin)" },
          branch: { type: "string", description: "Branch to push" },
          force: { type: "boolean", description: "Force push (use with caution!)" },
          tags: { type: "boolean", description: "Push tags" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", remote = "origin", branch, force, tags } = args as {
      path?: string; remote?: string; branch?: string; force?: boolean; tags?: boolean;
    };
    const abs = assertSafePath(path);

    const pushArgs = ["push", remote];
    if (force) pushArgs.push("--force");
    if (tags) pushArgs.push("--tags");
    if (branch) pushArgs.push(branch);

    return git(pushArgs, abs);
  },
};
