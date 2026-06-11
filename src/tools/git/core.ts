import { spawnSync } from "node:child_process";
import { assertSafePath, truncate } from "../../utils/security.js";
import type { ToolHandler, ToolDef, GitArgs, GitCommitArgs } from "../../types.js";
import { git } from "./utils.js";

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

// ─── git_grep ─────────────────────────────────────────────────────────────────
export const gitGrepTool: ToolHandler = {
  name: "git_grep",
  schema: {
    type: "function",
    function: {
      name: "git_grep",
      description: "Search for patterns in tracked files (faster than grep for git repos).",
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          pattern: { type: "string", description: "Search pattern (regex supported)" },
          file_pattern: { type: "string", description: "Filter by file pattern (e.g., '*.ts')" },
          ignore_case: { type: "boolean", description: "Case insensitive search" },
          count: { type: "boolean", description: "Show only match count per file" },
          context: { type: "number", description: "Show N lines of context around matches" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", pattern, file_pattern, ignore_case, count, context } = args as {
      path?: string; pattern: string; file_pattern?: string; ignore_case?: boolean; count?: boolean; context?: number;
    };
    const abs = assertSafePath(path);

    const grepArgs = ["grep"];
    if (ignore_case) grepArgs.push("-i");
    if (count) grepArgs.push("-c");
    if (context) grepArgs.push(`-C${context}`);
    grepArgs.push(pattern);
    if (file_pattern) grepArgs.push("--", file_pattern);

    return truncate(git(grepArgs, abs) || "No matches found.", 32_000);
  },
};

// ─── git_config ───────────────────────────────────────────────────────────────
export const gitConfigTool: ToolHandler = {
  name: "git_config",
  schema: {
    type: "function",
    function: {
      name: "git_config",
      description: "View or modify git configuration.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repo directory (default: cwd)" },
          action: { type: "string", enum: ["get", "set", "list"], description: "Config action (default: list)" },
          key: { type: "string", description: "Config key (e.g., 'user.name')" },
          value: { type: "string", description: "Config value (for set)" },
          global: { type: "boolean", description: "Use global config" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", action = "list", key, value, global } = args as {
      path?: string; action?: string; key?: string; value?: string; global?: boolean;
    };
    const abs = assertSafePath(path);

    if (action === "list") {
      return git(["config", "--list"], abs);
    }
    if (action === "get") {
      if (!key) return "Error: Config key is required.";
      return git(["config", key], abs) || "Not set.";
    }
    if (action === "set") {
      if (!key) return "Error: Config key is required.";
      const setArgs = ["config"];
      if (global) setArgs.push("--global");
      setArgs.push(key);
      if (value) setArgs.push(value);
      return git(setArgs, abs) || "Config updated.";
    }

    return git(["config", "--list"], abs);
  },
};

// ─── git_init ─────────────────────────────────────────────────────────────────
export const gitInitTool: ToolHandler = {
  name: "git_init",
  schema: {
    type: "function",
    function: {
      name: "git_init",
      description: "Initialize a new git repository.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory to initialize (default: cwd)" },
          bare: { type: "boolean", description: "Create bare repository" },
          template: { type: "string", description: "Template directory" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", bare, template } = args as {
      path?: string; bare?: boolean; template?: string;
    };

    const initArgs = ["init"];
    if (bare) initArgs.push("--bare");
    if (template) initArgs.push(`--template=${template}`);
    initArgs.push(path);

    const result = spawnSync("git", initArgs, { encoding: "utf8" });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return result.stdout || "Repository initialized.";
  },
};
