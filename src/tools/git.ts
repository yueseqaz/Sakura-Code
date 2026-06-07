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

// ─── git_clone ────────────────────────────────────────────────────────────────
export const gitCloneTool: ToolHandler = {
  name: "git_clone",
  schema: {
    type: "function",
    function: {
      name: "git_clone",
      description: "Clone a remote repository.",
      parameters: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", description: "Repository URL" },
          path: { type: "string", description: "Local directory (default: auto)" },
          depth: { type: "number", description: "Shallow clone depth" },
          branch: { type: "string", description: "Clone specific branch" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { url, path: localPath, depth, branch } = args as {
      url: string; path?: string; depth?: number; branch?: string;
    };
    
    const cloneArgs = ["clone"];
    if (depth) cloneArgs.push(`--depth=${depth}`);
    if (branch) cloneArgs.push(`--branch=${branch}`);
    cloneArgs.push(url);
    if (localPath) cloneArgs.push(localPath);

    const result = spawnSync("git", cloneArgs, { encoding: "utf8", timeout: 120_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return result.stdout || "Repository cloned successfully.";
  },
};

// ─── git_add ──────────────────────────────────────────────────────────────────
export const gitAddTool: ToolHandler = {
  name: "git_add",
  schema: {
    type: "function",
    function: {
      name: "git_add",
      description: "Stage files for commit.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          files: { type: "array", items: { type: "string" }, description: "Files to stage (default: all)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", files } = args as { path?: string; files?: string[] };
    const abs = assertSafePath(path);
    
    const addArgs = ["add"];
    if (files && files.length > 0) {
      addArgs.push(...files);
    } else {
      addArgs.push("-A");
    }
    
    return git(addArgs, abs) || "Files staged.";
  },
};

// ─── git_reset ────────────────────────────────────────────────────────────────
export const gitResetTool: ToolHandler = {
  name: "git_reset",
  schema: {
    type: "function",
    function: {
      name: "git_reset",
      description: "Unstage files or undo commits.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          mode: { type: "string", enum: ["soft", "mixed", "hard"], description: "Reset mode (default: mixed)" },
          target: { type: "string", description: "Commit ref to reset to (default: HEAD)" },
          file: { type: "string", description: "Unstage specific file" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", mode = "mixed", target, file } = args as {
      path?: string; mode?: string; target?: string; file?: string;
    };
    const abs = assertSafePath(path);

    if (file) {
      return git(["reset", "HEAD", "--", file], abs) || `Unstaged ${file}`;
    }

    const resetArgs = ["reset", `--${mode}`, target || "HEAD"];
    return git(resetArgs, abs);
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

// ─── git_fetch ────────────────────────────────────────────────────────────────
export const gitFetchTool: ToolHandler = {
  name: "git_fetch",
  schema: {
    type: "function",
    function: {
      name: "git_fetch",
      description: "Fetch updates from remote without merging.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          remote: { type: "string", description: "Remote name (default: origin)" },
          branch: { type: "string", description: "Specific branch to fetch" },
          all: { type: "boolean", description: "Fetch all remotes" },
          prune: { type: "boolean", description: "Remove stale remote-tracking branches" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", remote = "origin", branch, all, prune } = args as {
      path?: string; remote?: string; branch?: string; all?: boolean; prune?: boolean;
    };
    const abs = assertSafePath(path);

    const fetchArgs = ["fetch"];
    if (all) fetchArgs.push("--all");
    if (prune) fetchArgs.push("--prune");
    if (!all) fetchArgs.push(remote);
    if (branch) fetchArgs.push(branch);

    return git(fetchArgs, abs) || "Fetch complete.";
  },
};

// ─── git_tag ──────────────────────────────────────────────────────────────────
export const gitTagTool: ToolHandler = {
  name: "git_tag",
  schema: {
    type: "function",
    function: {
      name: "git_tag",
      description: "Create, list, or delete tags.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          action: { type: "string", enum: ["list", "create", "delete"], description: "Tag action (default: list)" },
          name: { type: "string", description: "Tag name" },
          message: { type: "string", description: "Tag message (for annotated tags)" },
          commit: { type: "string", description: "Commit to tag (default: HEAD)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", action = "list", name, message, commit } = args as {
      path?: string; action?: string; name?: string; message?: string; commit?: string;
    };
    const abs = assertSafePath(path);

    if (action === "list") return git(["tag"], abs) || "No tags found.";
    if (action === "delete") {
      if (!name) return "Error: Tag name is required.";
      return git(["tag", "-d", name], abs);
    }

    // Create
    if (!name) return "Error: Tag name is required.";
    const tagArgs = ["tag"];
    if (message) tagArgs.push("-a", name, "-m", message);
    else tagArgs.push(name);
    if (commit) tagArgs.push(commit);

    return git(tagArgs, abs) || `Tag '${name}' created.`;
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

// ─── git_blame ────────────────────────────────────────────────────────────────
export const gitBlameTool: ToolHandler = {
  name: "git_blame",
  schema: {
    type: "function",
    function: {
      name: "git_blame",
      description: "Show who wrote each line of a file.",
      parameters: {
        type: "object",
        required: ["file"],
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          file: { type: "string", description: "File to blame" },
          lines: { type: "string", description: "Line range (e.g., '10,20')" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", file, lines } = args as {
      path?: string; file: string; lines?: string;
    };
    const abs = assertSafePath(path);
    
    const blameArgs = ["blame"];
    if (lines) blameArgs.push(`-L${lines}`);
    blameArgs.push(file);

    return truncate(git(blameArgs, abs), 32_000);
  },
};

// ─── git_remote ───────────────────────────────────────────────────────────────
export const gitRemoteTool: ToolHandler = {
  name: "git_remote",
  schema: {
    type: "function",
    function: {
      name: "git_remote",
      description: "Manage remote repositories.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          action: { type: "string", enum: ["list", "add", "remove", "show"], description: "Remote action (default: list)" },
          name: { type: "string", description: "Remote name" },
          url: { type: "string", description: "Remote URL (for add)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", action = "list", name, url } = args as {
      path?: string; action?: string; name?: string; url?: string;
    };
    const abs = assertSafePath(path);

    if (action === "list") return git(["remote", "-v"], abs) || "No remotes configured.";
    if (action === "show") {
      if (!name) return "Error: Remote name is required.";
      return git(["remote", "show", name], abs);
    }
    if (action === "add") {
      if (!name || !url) return "Error: Remote name and URL are required.";
      return git(["remote", "add", name, url], abs) || `Remote '${name}' added.`;
    }
    if (action === "remove") {
      if (!name) return "Error: Remote name is required.";
      return git(["remote", "remove", name], abs) || `Remote '${name}' removed.`;
    }

    return git(["remote", "-v"], abs);
  },
};

// ─── git_show ─────────────────────────────────────────────────────────────────
export const gitShowTool: ToolHandler = {
  name: "git_show",
  schema: {
    type: "function",
    function: {
      name: "git_show",
      description: "Show details of a specific commit.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          commit: { type: "string", description: "Commit hash (default: HEAD)" },
          stat: { type: "boolean", description: "Show only stats (default: false)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", commit = "HEAD", stat } = args as {
      path?: string; commit?: string; stat?: boolean;
    };
    const abs = assertSafePath(path);

    const showArgs = ["show"];
    if (stat) showArgs.push("--stat");
    showArgs.push(commit);

    return truncate(git(showArgs, abs), 32_000);
  },
};

// ─── git_clean ────────────────────────────────────────────────────────────────
export const gitCleanTool: ToolHandler = {
  name: "git_clean",
  schema: {
    type: "function",
    function: {
      name: "git_clean",
      description: "Remove untracked files from working tree.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          dry_run: { type: "boolean", description: "Show what would be deleted" },
          directories: { type: "boolean", description: "Remove untracked directories too" },
          force: { type: "boolean", description: "Force deletion (required unless dry_run)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", dry_run, directories, force } = args as {
      path?: string; dry_run?: boolean; directories?: boolean; force?: boolean;
    };
    const abs = assertSafePath(path);

    if (!force && !dry_run) {
      return "Error: Use force=true to actually delete, or dry_run=true to preview.";
    }

    const cleanArgs = ["clean"];
    if (dry_run) cleanArgs.push("-n");
    else cleanArgs.push("-f");
    if (directories) cleanArgs.push("-d");

    return git(cleanArgs, abs) || "Nothing to clean.";
  },
};

// ─── git_submodule ────────────────────────────────────────────────────────────
export const gitSubmoduleTool: ToolHandler = {
  name: "git_submodule",
  schema: {
    type: "function",
    function: {
      name: "git_submodule",
      description: "Manage git submodules.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          action: { type: "string", enum: ["init", "update", "status", "add"], description: "Submodule action" },
          url: { type: "string", description: "Submodule URL (for add)" },
          name: { type: "string", description: "Submodule name/path (for add)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", action = "status", url, name } = args as {
      path?: string; action?: string; url?: string; name?: string;
    };
    const abs = assertSafePath(path);

    if (action === "status") return git(["submodule", "status"], abs) || "No submodules.";
    if (action === "init") return git(["submodule", "init"], abs) || "Submodules initialized.";
    if (action === "update") return git(["submodule", "update", "--init", "--recursive"], abs) || "Submodules updated.";
    if (action === "add") {
      if (!url) return "Error: Submodule URL is required.";
      const addArgs = ["submodule", "add", url];
      if (name) addArgs.push(name);
      return git(addArgs, abs) || "Submodule added.";
    }

    return git(["submodule", "status"], abs);
  },
};

// ─── git_bisect ───────────────────────────────────────────────────────────────
export const gitBisectTool: ToolHandler = {
  name: "git_bisect",
  schema: {
    type: "function",
    function: {
      name: "git_bisect",
      description: "Use binary search to find the commit that introduced a bug.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          action: { type: "string", enum: ["start", "good", "bad", "reset", "log"], description: "Bisect action" },
          commit: { type: "string", description: "Commit hash (for start, good, bad)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", action = "log", commit } = args as {
      path?: string; action?: string; commit?: string;
    };
    const abs = assertSafePath(path);

    if (action === "start") {
      if (!commit) return "Error: Commit hash is required to start bisect.";
      return git(["bisect", "start", commit], abs);
    }
    if (action === "good") return git(["bisect", "good", ...(commit ? [commit] : [])], abs);
    if (action === "bad") return git(["bisect", "bad", ...(commit ? [commit] : [])], abs);
    if (action === "reset") return git(["bisect", "reset"], abs) || "Bisect reset.";

    return git(["bisect", "log"], abs) || "No bisect in progress.";
  },
};
