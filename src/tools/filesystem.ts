import {
  existsSync, readFileSync, writeFileSync,
  mkdirSync, readdirSync, statSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { assertSafePath, DEFAULT_POLICY, truncate } from "../utils/security.js";
import { generateDiff, formatCompactDiff } from "../utils/diff.js";
import type {
  ToolHandler, ToolDef,
  ReadFileArgs, WriteFileArgs, EditFileArgs, ListFilesArgs, SearchFilesArgs,
} from "../types.js";

// ─── read_file ────────────────────────────────────────────────────────────────
export const readFileTool: ToolHandler = {
  name: "read_file",
  schema: {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file. Optionally specify line range.",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string", description: "Absolute or relative file path" },
          start_line: { type: "number", description: "First line to return (1-indexed)" },
          end_line: { type: "number", description: "Last line to return (inclusive)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path, start_line, end_line } = args as unknown as ReadFileArgs;
    const abs = assertSafePath(path);

    if (!existsSync(abs)) throw new Error(`File not found: ${abs}`);
    const stat = statSync(abs);
    if (stat.size > DEFAULT_POLICY.maxFileSize!)
      throw new Error(`File too large: ${stat.size} bytes (max ${DEFAULT_POLICY.maxFileSize})`);

    const raw = readFileSync(abs, "utf8");
    let lines = raw.split("\n");
    const total = lines.length;

    if (start_line || end_line) {
      const s = (start_line ?? 1) - 1;
      const e = end_line ?? total;
      lines = lines.slice(s, e);
      const numbered = lines.map((l, i) => `${s + i + 1}\t${l}`).join("\n");
      return `${abs} (lines ${s + 1}–${Math.min(e, total)} of ${total}):\n${numbered}`;
    }

    const numbered = lines.map((l, i) => `${i + 1}\t${l}`).join("\n");
    return truncate(`${abs} (${total} lines):\n${numbered}`);
  },
};

// ─── write_file ───────────────────────────────────────────────────────────────
export const writeFileTool: ToolHandler = {
  name: "write_file",
  schema: {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file, creating it if it doesn't exist.",
      parameters: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string", description: "File path to write" },
          content: { type: "string", description: "Full file content" },
          create_dirs: { type: "boolean", description: "Create parent directories if missing (default: true)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path, content, create_dirs = true } = args as unknown as WriteFileArgs;
    const abs = assertSafePath(path);

    // 读取旧内容（如果文件存在）
    const oldContent = existsSync(abs) ? readFileSync(abs, "utf8") : "";

    if (create_dirs) mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");

    const lines = content.split("\n").length;
    const result = `Written ${content.length} chars (${lines} lines) to ${abs}`;

    // 生成并显示 diff
    if (oldContent && oldContent !== content) {
      const diff = generateDiff(abs, oldContent, content);
      const formatted = formatCompactDiff(diff);
      return `${result}\n${formatted}`;
    }

    return result;
  },
};

// ─── edit_file ────────────────────────────────────────────────────────────────
export const editFileTool: ToolHandler = {
  name: "edit_file",
  schema: {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Replace an exact string in a file with a new string. " +
        "old_str must match exactly once. Prefer this over write_file for targeted edits.",
      parameters: {
        type: "object",
        required: ["path", "old_str", "new_str"],
        properties: {
          path: { type: "string", description: "File path" },
          old_str: { type: "string", description: "Exact string to find and replace" },
          new_str: { type: "string", description: "Replacement string" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path, old_str, new_str } = args as unknown as EditFileArgs;
    const abs = assertSafePath(path);

    if (!existsSync(abs)) throw new Error(`File not found: ${abs}`);
    const original = readFileSync(abs, "utf8");

    const count = original.split(old_str).length - 1;
    if (count === 0) throw new Error(`String not found in ${abs}:\n${old_str.slice(0, 200)}`);
    if (count > 1)
      throw new Error(
        `Ambiguous edit: old_str appears ${count} times in ${abs}. ` +
        `Add more context to make it unique.`
      );

    const updated = original.replace(old_str, new_str);
    writeFileSync(abs, updated, "utf8");

    const oldLines = old_str.split("\n").length;
    const newLines = new_str.split("\n").length;

    // 生成简短的 diff 摘要（直接返回给用户看）
    const diff = generateDiff(abs, original, updated);
    const diffSummary = formatCompactDiff(diff);

    return `✅ Edited ${abs}\n${diffSummary}`;
  },
};

// ─── list_files ───────────────────────────────────────────────────────────────
export const listFilesTool: ToolHandler = {
  name: "list_files",
  schema: {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and directories. Respects .gitignore when available.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path (default: cwd)" },
          pattern: { type: "string", description: "Glob pattern filter (e.g. '*.ts')" },
          recursive: { type: "boolean", description: "List recursively (default: false)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", pattern, recursive = false } = args as unknown as ListFilesArgs;
    const abs = assertSafePath(path);

    // Use git ls-files if inside a repo (respects .gitignore)
    if (recursive) {
      const gitCheck = spawnSync("git", ["-C", abs, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
      if (gitCheck.status === 0) {
        const patternArgs = pattern ? ["--", `**/${pattern}`] : [];
        const r = spawnSync("git", ["-C", abs, "ls-files", ...patternArgs], { encoding: "utf8" });
        if (r.status === 0) return truncate(r.stdout.trim() || "(empty)");
      }
    }

    // Fallback: manual traversal
    const entries = collect(abs, recursive, 0, 4);
    const filtered = pattern
      ? entries.filter((e) => minimatch(e, pattern))
      : entries;

    return truncate(filtered.map((e) => relative(abs, e)).join("\n") || "(empty)");
  },
};

function collect(dir: string, recursive: boolean, depth: number, maxDepth: number): string[] {
  if (depth > maxDepth) return [];
  try {
    return readdirSync(dir).flatMap((name) => {
      if (name.startsWith(".") && name !== ".env.example") return [];
      const full = join(dir, name);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          if (name === "node_modules" || name === ".git" || name === "dist") return [full];
          return recursive ? [full, ...collect(full, true, depth + 1, maxDepth)] : [full];
        }
        return [full];
      } catch { return []; }
    });
  } catch { return []; }
}

// very minimal glob matching (only * and ?)
function minimatch(path: string, pattern: string): boolean {
  const re = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  );
  return re.test(path) || re.test(path.split("/").pop()!);
}

// ─── search_files ─────────────────────────────────────────────────────────────
export const searchFilesTool: ToolHandler = {
  name: "search_files",
  schema: {
    type: "function",
    function: {
      name: "search_files",
      description: "Search for a pattern in files using ripgrep (falls back to grep).",
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: { type: "string", description: "Regex or string to search for" },
          path: { type: "string", description: "Directory to search (default: cwd)" },
          file_pattern: { type: "string", description: "File glob filter (e.g. '*.ts')" },
          case_sensitive: { type: "boolean", description: "Default: false" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { pattern, path = ".", file_pattern, case_sensitive = false } = args as unknown as SearchFilesArgs;
    const abs = assertSafePath(path);

    // Try ripgrep first, fall back to grep
    const hasRg = spawnSync("which", ["rg"], { encoding: "utf8" }).status === 0;
    const tool = hasRg ? "rg" : "grep";

    let cmd: string[];
    if (hasRg) {
      cmd = ["rg", "--line-number", "--no-heading", "--color=never"];
      if (!case_sensitive) cmd.push("-i");
      if (file_pattern) cmd.push("--glob", file_pattern);
      cmd.push(pattern, abs);
    } else {
      cmd = ["grep", "-rn", "--include", file_pattern ?? "*"];
      if (!case_sensitive) cmd.push("-i");
      cmd.push(pattern, abs);
    }

    const r = spawnSync(cmd[0]!, cmd.slice(1), { encoding: "utf8", cwd: abs });
    const out = r.stdout.trim();

    if (!out) return `No matches for '${pattern}' in ${abs}`;
    const lines = out.split("\n");
    return truncate(`${lines.length} match(es) for '${pattern}':\n${out}`);
  },
};
