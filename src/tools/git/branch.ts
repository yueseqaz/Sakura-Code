import { assertSafePath } from "../../utils/security.js";
import { confirmAction } from "../../utils/confirm.js";
import type { ToolHandler, ToolDef } from "../../types.js";
import { git } from "./utils.js";

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

      const confirmed = await confirmAction("删除分支", `git branch -d ${name}`);
      if (!confirmed) {
        return "❌ 操作已取消";
      }

      return git(["branch", "-d", name], abs);
    }

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

// ─── git_rebase ───────────────────────────────────────────────────────────────
export const gitRebaseTool: ToolHandler = {
  name: "git_rebase",
  schema: {
    type: "function",
    function: {
      name: "git_rebase",
      description: "Rebase current branch onto another branch.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          branch: { type: "string", description: "Branch to rebase onto" },
          interactive: { type: "boolean", description: "Interactive rebase (shows commit list)" },
          onto: { type: "string", description: "Rebase onto specific commit" },
          abort: { type: "boolean", description: "Abort current rebase" },
          continue_rebase: { type: "boolean", description: "Continue after resolving conflicts" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", branch, interactive, onto, abort, continue_rebase } = args as {
      path?: string; branch?: string; interactive?: boolean; onto?: string; abort?: boolean; continue_rebase?: boolean;
    };
    const abs = assertSafePath(path);

    if (abort) return git(["rebase", "--abort"], abs);
    if (continue_rebase) return git(["rebase", "--continue"], abs);

    const rebaseArgs = ["rebase"];
    if (interactive) rebaseArgs.push("-i");
    if (onto) rebaseArgs.push("--onto", onto);
    if (branch) rebaseArgs.push(branch);

    return git(rebaseArgs, abs);
  },
};

// ─── git_cherry_pick ──────────────────────────────────────────────────────────
export const gitCherryPickTool: ToolHandler = {
  name: "git_cherry_pick",
  schema: {
    type: "function",
    function: {
      name: "git_cherry_pick",
      description: "Cherry-pick a commit from another branch.",
      parameters: {
        type: "object",
        required: ["commit"],
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          commit: { type: "string", description: "Commit hash to cherry-pick" },
          no_commit: { type: "boolean", description: "Don't auto-commit" },
          abort: { type: "boolean", description: "Abort current cherry-pick" },
          continue_pick: { type: "boolean", description: "Continue after resolving conflicts" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", commit, no_commit, abort, continue_pick } = args as {
      path?: string; commit?: string; no_commit?: boolean; abort?: boolean; continue_pick?: boolean;
    };
    const abs = assertSafePath(path);

    if (abort) return git(["cherry-pick", "--abort"], abs);
    if (continue_pick) return git(["cherry-pick", "--continue"], abs);
    if (!commit) return "Error: Commit hash is required.";

    const cpArgs = ["cherry-pick"];
    if (no_commit) cpArgs.push("--no-commit");
    cpArgs.push(commit);

    return git(cpArgs, abs);
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

    const saveArgs = ["stash", "push"];
    if (message) saveArgs.push("-m", message);
    return git(saveArgs, abs) || "Nothing to stash.";
  },
};

// ─── git_revert ───────────────────────────────────────────────────────────────
export const gitRevertTool: ToolHandler = {
  name: "git_revert",
  schema: {
    type: "function",
    function: {
      name: "git_revert",
      description: "Revert a specific commit by creating a new commit.",
      parameters: {
        type: "object",
        required: ["commit"],
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          commit: { type: "string", description: "Commit hash to revert" },
          no_commit: { type: "boolean", description: "Don't auto-commit the revert" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", commit, no_commit } = args as {
      path?: string; commit: string; no_commit?: boolean;
    };
    const abs = assertSafePath(path);

    const revertArgs = ["revert"];
    if (no_commit) revertArgs.push("--no-commit");
    revertArgs.push(commit);

    return git(revertArgs, abs);
  },
};
