import { spawnSync } from "node:child_process";
import { truncate } from "../utils/security.js";
import type { ToolHandler, ToolDef, WebSearchArgs, FetchUrlArgs } from "../types.js";

// ─── web_search ───────────────────────────────────────────────────────────────
export const webSearchTool: ToolHandler = {
  name: "web_search",
  schema: {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for documentation, packages, error messages, or current information. " +
        "Uses DuckDuckGo (no API key required).",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Search query" },
          num_results: { type: "number", description: "Number of results (default: 5)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { query, num_results = 5 } = args as unknown as WebSearchArgs;

    // Use curl to hit DuckDuckGo Lite (no JS required)
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const r = spawnSync(
      "curl",
      ["-s", "-L", "--max-time", "15", "-A", "Mozilla/5.0", url],
      { encoding: "utf8", timeout: 20_000 }
    );

    if (r.status !== 0) {
      return `Search failed (exit ${r.status}). Check network connectivity.`;
    }

    const html = r.stdout;
    const results = parseSearchResults(html, num_results);

    if (!results.length) return `No results found for: "${query}"`;

    return results
      .map((r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`)
      .join("\n\n");
  },
};

// ─── fetch_url ────────────────────────────────────────────────────────────────
export const fetchUrlTool: ToolHandler = {
  name: "fetch_url",
  schema: {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "Fetch the content of a URL and return it as plain text. " +
        "Useful for reading documentation, READMEs, or API specs. " +
        "Converts HTML to readable text.",
      parameters: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", description: "URL to fetch" },
          timeout_ms: { type: "number", description: "Timeout (default: 15000)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { url, timeout_ms = 15_000 } = args as unknown as FetchUrlArgs;

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      throw new Error("URL must start with http:// or https://");
    }

    const timeoutSec = Math.ceil(timeout_ms / 1000);

    // Try w3m (renders HTML → text) first, fall back to curl
    const hasW3m = spawnSync("which", ["w3m"], { encoding: "utf8" }).status === 0;
    const hasPandoc = spawnSync("which", ["pandoc"], { encoding: "utf8" }).status === 0;

    let content: string;

    if (hasW3m) {
      const r = spawnSync("w3m", ["-dump", url], {
        encoding: "utf8",
        timeout: timeout_ms + 5_000,
      });
      content = r.stdout;
    } else {
      const r = spawnSync(
        "curl",
        ["-s", "-L", "--max-time", String(timeoutSec), "-A", "Mozilla/5.0", url],
        { encoding: "utf8", timeout: timeout_ms + 5_000 }
      );

      if (r.status !== 0) {
        return `Fetch failed (exit ${r.status}): ${r.stderr?.slice(0, 200) || "unknown error"}`;
      }

      // Strip HTML tags
      content = r.stdout
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s{3,}/g, "\n\n")
        .trim();
    }

    if (!content.trim()) return `No content retrieved from ${url}`;
    return truncate(`[${url}]\n\n${content}`);
  },
};

// ─── DuckDuckGo HTML Parser ───────────────────────────────────────────────────
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function parseSearchResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Match DDG result blocks
  const blockRe = /class="result__body">([\s\S]*?)(?=class="result__body"|<\/div>)/g;
  const titleRe = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/;
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;

  // Simpler extraction: pull all links + snippets
  const linkRe = /href="(https?:\/\/[^"]+)"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/g;
  const snipRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/g;

  const links: Array<{ url: string; title: string }> = [];
  for (const m of html.matchAll(linkRe)) {
    links.push({ url: m[1]!, title: stripTags(m[2]!) });
  }

  const snippets: string[] = [];
  for (const m of html.matchAll(snipRe)) {
    snippets.push(stripTags(m[1]!));
  }

  for (let i = 0; i < Math.min(links.length, limit); i++) {
    results.push({
      title: links[i]!.title.trim() || "(no title)",
      url: links[i]!.url,
      snippet: snippets[i]?.trim() || "",
    });
  }

  return results;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
