import { spawnSync } from "node:child_process";
import { assertSafePath, truncate } from "../../utils/security.js";
import { confirmAction } from "../../utils/confirm.js";
import type { ToolHandler, ToolDef } from "../../types.js";
import { git } from "./utils.js";

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

    if (force) {
      const confirmed = await confirmAction(
        "Force Push",
        `git push --force ${remote}/${branch || "当前分支"}`
      );
      if (!confirmed) {
        return "❌ 操作已取消";
      }
    }

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

      const confirmed = await confirmAction("删除标签", `git tag -d ${name}`);
      if (!confirmed) {
        return "❌ 操作已取消";
      }

      return git(["tag", "-d", name], abs);
    }

    if (!name) return "Error: Tag name is required.";
    const tagArgs = ["tag"];
    if (message) tagArgs.push("-a", name, "-m", message);
    else tagArgs.push(name);
    if (commit) tagArgs.push(commit);

    return git(tagArgs, abs) || `Tag '${name}' created.`;
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

    if (force && !dry_run) {
      const confirmed = await confirmAction(
        "删除未跟踪文件",
        `git clean -f${directories ? " -d" : ""}`
      );
      if (!confirmed) {
        return "❌ 操作已取消";
      }
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

// ─── git_reflog ───────────────────────────────────────────────────────────────
export const gitReflogTool: ToolHandler = {
  name: "git_reflog",
  schema: {
    type: "function",
    function: {
      name: "git_reflog",
      description: "Show reference log (useful for recovering lost commits).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          count: { type: "number", description: "Number of entries to show (default: 20)" },
          all: { type: "boolean", description: "Show reflog for all refs" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", count = 20, all } = args as {
      path?: string; count?: number; all?: boolean;
    };
    const abs = assertSafePath(path);

    const reflogArgs = ["reflog"];
    if (all) reflogArgs.push("--all");
    reflogArgs.push(`-${count}`);

    return git(reflogArgs, abs) || "No reflog entries found.";
  },
};

// ─── git_worktree ─────────────────────────────────────────────────────────────
export const gitWorktreeTool: ToolHandler = {
  name: "git_worktree",
  schema: {
    type: "function",
    function: {
      name: "git_worktree",
      description: "Manage multiple working trees for the same repo.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          action: { type: "string", enum: ["list", "add", "remove", "prune"], description: "Worktree action (default: list)" },
          worktree_path: { type: "string", description: "Path for new worktree (for add)" },
          branch: { type: "string", description: "Branch for new worktree" },
          force: { type: "boolean", description: "Force remove" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", action = "list", worktree_path, branch, force } = args as {
      path?: string; action?: string; worktree_path?: string; branch?: string; force?: boolean;
    };
    const abs = assertSafePath(path);

    if (action === "list") return git(["worktree", "list"], abs);
    if (action === "prune") return git(["worktree", "prune"], abs) || "Pruned.";
    if (action === "remove") {
      if (!worktree_path) return "Error: Worktree path is required.";
      const rmArgs = ["worktree", "remove"];
      if (force) rmArgs.push("--force");
      rmArgs.push(worktree_path);
      return git(rmArgs, abs);
    }
    if (action === "add") {
      if (!worktree_path) return "Error: Worktree path is required.";
      const addArgs = ["worktree", "add", worktree_path];
      if (branch) addArgs.push(branch);
      return git(addArgs, abs) || `Worktree created at ${worktree_path}`;
    }

    return git(["worktree", "list"], abs);
  },
};
