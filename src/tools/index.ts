import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { assertSafePath, truncate } from "../utils/security.js";
import type { ToolHandler, ToolDef, ProjectIndexArgs, SemanticSearchArgs } from "../types.js";

const INDEX_FILE = ".sakura-code-index.json";
const DEFAULT_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs",
  ".py", ".rb", ".go", ".rs", ".java", ".cs",
  ".md", ".mdx", ".txt", ".json", ".yaml", ".yml",
  ".toml", ".env.example", ".sh",
];

interface IndexEntry {
  path: string;
  size: number;
  lines: number;
  symbols: string[];   // extracted function/class names
  summary: string;     // first non-empty line or docstring
}

interface ProjectIndex {
  root: string;
  indexed_at: string;
  entries: IndexEntry[];
}

// ─── project_index ────────────────────────────────────────────────────────────
export const projectIndexTool: ToolHandler = {
  name: "project_index",
  schema: {
    type: "function",
    function: {
      name: "project_index",
      description:
        "Build or refresh a structural index of the project. " +
        "Extracts file paths, sizes, symbol names, and summaries. " +
        "Run this when starting work on an unfamiliar codebase.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Root directory (default: cwd)" },
          extensions: {
            type: "array",
            items: { type: "string" },
            description: "File extensions to index (default: common code extensions)",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", extensions = DEFAULT_EXTENSIONS } = args as unknown as ProjectIndexArgs;
    const abs = assertSafePath(path);
    const entries: IndexEntry[] = [];

    const files = collectFiles(abs, extensions);

    for (const file of files.slice(0, 500)) { // cap at 500 files
      try {
        const content = readFileSync(file, "utf8");
        const lines = content.split("\n");
        const symbols = extractSymbols(content, extname(file));
        const summary = lines.find((l) => l.trim().length > 10)?.trim().slice(0, 100) ?? "";

        entries.push({
          path: relative(abs, file),
          size: content.length,
          lines: lines.length,
          symbols: symbols.slice(0, 20),
          summary,
        });
      } catch { /* skip unreadable */ }
    }

    const index: ProjectIndex = {
      root: abs,
      indexed_at: new Date().toISOString(),
      entries,
    };

    writeFileSync(join(abs, INDEX_FILE), JSON.stringify(index, null, 2));

    const report = entries
      .slice(0, 50)
      .map((e) => `${e.path} (${e.lines}L) — ${e.symbols.slice(0, 5).join(", ")}`)
      .join("\n");

    return `Indexed ${entries.length} files in ${abs}\n\n${report}\n\n(Full index saved to ${INDEX_FILE})`;
  },
};

// ─── semantic_search ──────────────────────────────────────────────────────────
export const semanticSearchTool: ToolHandler = {
  name: "semantic_search",
  schema: {
    type: "function",
    function: {
      name: "semantic_search",
      description:
        "Search the project index for files and symbols relevant to a query. " +
        "Run project_index first if the index doesn't exist. " +
        "Uses keyword matching across paths, symbols, and summaries.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Natural language or keyword query" },
          path: { type: "string", description: "Root directory (default: cwd)" },
          top_k: { type: "number", description: "Number of results (default: 10)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { query, path = ".", top_k = 10 } = args as unknown as SemanticSearchArgs;
    const abs = assertSafePath(path);
    const indexPath = join(abs, INDEX_FILE);

    if (!existsSync(indexPath)) {
      return `No index found at ${indexPath}. Run project_index first.`;
    }

    const index: ProjectIndex = JSON.parse(readFileSync(indexPath, "utf8"));
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

    const scored = index.entries.map((entry) => {
      const text = [
        entry.path,
        entry.symbols.join(" "),
        entry.summary,
      ].join(" ").toLowerCase();

      const score = terms.reduce((acc, term) => {
        const pathBonus = entry.path.toLowerCase().includes(term) ? 3 : 0;
        const symbolBonus = entry.symbols.some((s) => s.toLowerCase().includes(term)) ? 2 : 0;
        const textBonus = text.includes(term) ? 1 : 0;
        return acc + pathBonus + symbolBonus + textBonus;
      }, 0);

      return { entry, score };
    });

    const results = scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, top_k);

    if (!results.length) return `No results found for: "${query}"`;

    const output = results
      .map(
        ({ entry, score }) =>
          `[score:${score}] ${entry.path} (${entry.lines}L)\n` +
          `  Symbols: ${entry.symbols.slice(0, 8).join(", ") || "—"}\n` +
          `  ${entry.summary}`
      )
      .join("\n\n");

    return `Top ${results.length} results for "${query}":\n\n${output}`;
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function collectFiles(dir: string, extensions: string[], results: string[] = []): string[] {
  try {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || name === "node_modules" || name === "dist") continue;
      const full = join(dir, name);
      try {
        const st = statSync(full);
        if (st.isDirectory()) collectFiles(full, extensions, results);
        else if (extensions.includes(extname(name))) results.push(full);
      } catch {}
    }
  } catch {}
  return results;
}

function extractSymbols(content: string, ext: string): string[] {
  const symbols: string[] = [];

  // TypeScript/JavaScript
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(ext)) {
    const patterns = [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
      /(?:export\s+)?class\s+(\w+)/g,
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g,
      /(?:export\s+)?(?:type|interface)\s+(\w+)/g,
    ];
    for (const re of patterns) {
      for (const m of content.matchAll(re)) symbols.push(m[1]!);
    }
  }

  // Python
  if (ext === ".py") {
    for (const m of content.matchAll(/^(?:async\s+)?def\s+(\w+)|^class\s+(\w+)/gm)) {
      symbols.push(m[1] ?? m[2]!);
    }
  }

  // Go
  if (ext === ".go") {
    for (const m of content.matchAll(/^func\s+(?:\(.*?\)\s+)?(\w+)/gm)) {
      symbols.push(m[1]!);
    }
  }

  return [...new Set(symbols)];
}
