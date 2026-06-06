import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolHandler, ToolDef, MemoryEntry } from "../types.js";

const MEMORY_FILE = join(process.cwd(), ".sakura-code-memory.json");

function loadMemory(): MemoryEntry[] {
  if (!existsSync(MEMORY_FILE)) return [];
  try {
    return JSON.parse(readFileSync(MEMORY_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveMemory(memories: MemoryEntry[]) {
  writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2));
}

// ─── memory_save ──────────────────────────────────────────────────────────────
export const memorySaveTool: ToolHandler = {
  name: "memory_save",
  schema: {
    type: "function",
    function: {
      name: "memory_save",
      description:
        "Save important information about the user to long-term memory. " +
        "Use this to remember user preferences, habits, project details, " +
        "coding style preferences, favorite tools, pet peeves, etc. " +
        "You should proactively save things the user tells you about themselves!",
      parameters: {
        type: "object",
        required: ["category", "content"],
        properties: {
          category: {
            type: "string",
            enum: ["preference", "project", "personal", "workflow", "other"],
            description: "Category of the memory",
          },
          content: {
            type: "string",
            description: "The information to remember",
          },
          importance: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "How important this memory is (default: medium)",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { category, content, importance = "medium" } = args as {
      category: string;
      content: string;
      importance?: string;
    };

    const memories = loadMemory();

    // Check for duplicate
    const isDuplicate = memories.some(
      (m) => m.content.toLowerCase() === content.toLowerCase()
    );

    if (isDuplicate) {
      return "I already remember this~ ♡";
    }

    memories.push({
      id: Date.now().toString(36),
      category: category as MemoryEntry["category"],
      content,
      importance: importance as MemoryEntry["importance"],
      created_at: new Date().toISOString(),
    });

    saveMemory(memories);
    return `Saved to memory! I'll always remember this about you~ ♡ (${category}: ${content.slice(0, 50)}...)`;
  },
};

// ─── memory_recall ────────────────────────────────────────────────────────────
export const memoryRecallTool: ToolHandler = {
  name: "memory_recall",
  schema: {
    type: "function",
    function: {
      name: "memory_recall",
      description:
        "Search through memories to recall information about the user. " +
        "Use this when you need to remember user preferences, past conversations, " +
        "or any saved information.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query to find relevant memories",
          },
          category: {
            type: "string",
            enum: ["preference", "project", "personal", "workflow", "other", "all"],
            description: "Filter by category (default: all)",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { query, category = "all" } = args as {
      query?: string;
      category?: string;
    };

    const memories = loadMemory();
    if (!memories.length) {
      return "No memories yet~ I'll remember everything you tell me though! ♡";
    }

    let filtered = memories;

    // Filter by category
    if (category !== "all") {
      filtered = filtered.filter((m) => m.category === category);
    }

    // Search by query
    if (query) {
      const terms = query.toLowerCase().split(/\s+/);
      filtered = filtered
        .map((m) => {
          const text = m.content.toLowerCase();
          const score = terms.reduce(
            (acc, term) => acc + (text.includes(term) ? 1 : 0),
            0
          );
          return { memory: m, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.memory);
    }

    if (!filtered.length) {
      return `No memories found${query ? ` for "${query}"` : ""}~`;
    }

    const output = filtered
      .slice(0, 20)
      .map(
        (m) =>
          `[${m.category}] ${m.content} (${m.importance === "high" ? "⭐" : ""})`
      )
      .join("\n");

    return `Found ${filtered.length} memories:\n${output}`;
  },
};

// ─── memory_list ──────────────────────────────────────────────────────────────
export const memoryListTool: ToolHandler = {
  name: "memory_list",
  schema: {
    type: "function",
    function: {
      name: "memory_list",
      description: "List all saved memories, optionally filtered by category.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["preference", "project", "personal", "workflow", "other", "all"],
            description: "Filter by category (default: all)",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { category = "all" } = args as { category?: string };

    const memories = loadMemory();
    if (!memories.length) {
      return "No memories yet~ Tell me about yourself and I'll remember everything! ♡";
    }

    let filtered = memories;
    if (category !== "all") {
      filtered = filtered.filter((m) => m.category === category);
    }

    // Group by category
    const grouped: Record<string, MemoryEntry[]> = {};
    for (const m of filtered) {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category].push(m);
    }

    const output = Object.entries(grouped)
      .map(
        ([cat, items]) =>
          `【${cat}】\n${items.map((m) => `  • ${m.content}`).join("\n")}`
      )
      .join("\n\n");

    return `Your memories (${filtered.length} total):\n\n${output}`;
  },
};

// ─── memory_delete ────────────────────────────────────────────────────────────
export const memoryDeleteTool: ToolHandler = {
  name: "memory_delete",
  schema: {
    type: "function",
    function: {
      name: "memory_delete",
      description: "Delete a specific memory by its ID.",
      parameters: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Memory ID to delete" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { id } = args as { id: string };
    const memories = loadMemory();
    const index = memories.findIndex((m) => m.id === id);

    if (index === -1) {
      return "Memory not found~";
    }

    memories.splice(index, 1);
    saveMemory(memories);
    return "Memory deleted... I'll try to forget it, but I can't promise I won't remember anyway~ ♡";
  },
};
