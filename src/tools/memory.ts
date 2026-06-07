import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolHandler, ToolDef, MemoryEntry } from "../types.js";

const MEMORY_FILE = join(process.cwd(), ".sakura-code-memory.json");

// ─── 记忆分层 ────────────────────────────────────────────────────────────────
type MemoryLayer = "core" | "context" | "temp";

interface EnhancedMemoryEntry extends MemoryEntry {
  layer: MemoryLayer;
  tags: string[];
  relatedIds: string[];
  accessCount: number;
  lastAccessed?: string;
  source?: string;
}

// ─── 记忆存储 ────────────────────────────────────────────────────────────────
function loadMemory(): EnhancedMemoryEntry[] {
  if (!existsSync(MEMORY_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(MEMORY_FILE, "utf8"));
    return Array.isArray(data) ? data.map(m => ({
      ...m,
      layer: m.layer || "context",
      tags: m.tags || [],
      relatedIds: m.relatedIds || [],
      accessCount: m.accessCount || 0,
    })) : [];
  } catch {
    return [];
  }
}

function saveMemory(memories: EnhancedMemoryEntry[]) {
  writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2));
}

// ─── 自动标签提取 ─────────────────────────────────────────────────────────────
function extractTags(content: string): string[] {
  const tags: string[] = [];
  const patterns = [
    { pattern: /喜欢|偏好|prefer|like|love/i, tag: "偏好" },
    { pattern: /不喜欢|讨厌|hate|dislike/i, tag: "厌恶" },
    { pattern: /项目|project/i, tag: "项目" },
    { pattern: /工作|work|job/i, tag: "工作" },
    { pattern: /技术|tech|语言|language|框架|framework/i, tag: "技术" },
    { pattern: /习惯|habit|风格|style/i, tag: "习惯" },
    { pattern: /生日|birthday|年龄|age/i, tag: "个人信息" },
    { pattern: /目标|goal|计划|plan/i, tag: "目标" },
    { pattern: /问题|problem|bug|错误|error/i, tag: "问题" },
    { pattern: /设置|配置|config|setting/i, tag: "配置" },
  ];

  for (const { pattern, tag } of patterns) {
    if (pattern.test(content)) tags.push(tag);
  }
  return tags;
}

// ─── 记忆合并 ─────────────────────────────────────────────────────────────────
function mergeMemories(existing: EnhancedMemoryEntry, newMem: EnhancedMemoryEntry): EnhancedMemoryEntry {
  if (newMem.content.length > existing.content.length * 1.5) {
    return {
      ...newMem,
      id: existing.id,
      accessCount: existing.accessCount,
      lastAccessed: new Date().toISOString(),
      tags: [...new Set([...existing.tags, ...newMem.tags])],
      relatedIds: [...new Set([...existing.relatedIds, ...newMem.relatedIds])],
    };
  }
  return {
    ...existing,
    tags: [...new Set([...existing.tags, ...newMem.tags])],
    lastAccessed: new Date().toISOString(),
    accessCount: existing.accessCount + 1,
  };
}

// ─── 简单相似度检查 ───────────────────────────────────────────────────────────
function isSimilar(a: string, b: string): boolean {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  let match = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) match++;
  }
  const similarity = match / Math.max(wordsA.size, wordsB.size);
  return similarity > 0.6;
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
        "coding style preferences, favorite tools, pet peeves, etc.",
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
          layer: {
            type: "string",
            enum: ["core", "context", "temp"],
            description: "Memory layer: core (always recalled), context (relevant when needed), temp (session only)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for categorization",
          },
          source: {
            type: "string",
            enum: ["user", "inferred"],
            description: "Source of memory: user (explicitly told) or inferred (AI deduced)",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { category, content, importance = "medium", layer = "context", tags = [], source = "user" } = args as {
      category: string;
      content: string;
      importance?: string;
      layer?: string;
      tags?: string[];
      source?: string;
    };

    const memories = loadMemory();
    const autoTags = extractTags(content);
    const allTags = [...new Set([...tags, ...autoTags])];

    // 检查相似记忆
    const similarIndex = memories.findIndex(m => isSimilar(m.content, content));

    if (similarIndex >= 0) {
      const merged = mergeMemories(memories[similarIndex], {
        id: memories[similarIndex].id,
        category: category as MemoryEntry["category"],
        content,
        importance: importance as MemoryEntry["importance"],
        created_at: new Date().toISOString(),
        layer: layer as MemoryLayer,
        tags: allTags,
        relatedIds: [],
        accessCount: 0,
        source,
      });
      memories[similarIndex] = merged;
      saveMemory(memories);
      return `Updated memory~ ♡ 已合并相似记忆`;
    }

    // 添加新记忆
    const newMemory: EnhancedMemoryEntry = {
      id: Date.now().toString(36),
      category: category as MemoryEntry["category"],
      content,
      importance: importance as MemoryEntry["importance"],
      created_at: new Date().toISOString(),
      layer: layer as MemoryLayer,
      tags: allTags,
      relatedIds: [],
      accessCount: 0,
      source,
    };

    memories.push(newMemory);
    saveMemory(memories);
    return `Saved to memory! ♡ [${category}] ${content.slice(0, 50)}... (tags: ${allTags.join(", ") || "none"})`;
  },
};

// ─── memory_recall ────────────────────────────────────────────────────────────
export const memoryRecallTool: ToolHandler = {
  name: "memory_recall",
  schema: {
    type: "function",
    function: {
      name: "memory_recall",
      description: "Search through memories to recall information about the user.",
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
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags",
          },
          layer: {
            type: "string",
            enum: ["core", "context", "temp", "all"],
            description: "Filter by layer (default: all)",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { query, category = "all", tags = [], layer = "all" } = args as {
      query?: string;
      category?: string;
      tags?: string[];
      layer?: string;
    };

    const memories = loadMemory();
    if (!memories.length) {
      return "No memories yet~ I'll remember everything you tell me though! ♡";
    }

    let filtered = memories;

    // 按分类过滤
    if (category !== "all") {
      filtered = filtered.filter((m) => m.category === category);
    }

    // 按层级过滤
    if (layer !== "all") {
      filtered = filtered.filter((m) => m.layer === layer);
    }

    // 按标签过滤
    if (tags.length > 0) {
      filtered = filtered.filter((m) => 
        tags.some(t => m.tags.includes(t))
      );
    }

    // 搜索
    if (query) {
      const terms = query.toLowerCase().split(/\s+/);
      filtered = filtered
        .map((m) => {
          const text = m.content.toLowerCase();
          const tagText = m.tags.join(" ").toLowerCase();
          const score = terms.reduce(
            (acc, term) => acc + (text.includes(term) ? 2 : 0) + (tagText.includes(term) ? 1 : 0),
            0
          );
          return { memory: m, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => {
          r.memory.accessCount++;
          r.memory.lastAccessed = new Date().toISOString();
          return r.memory;
        });
    }

    if (!filtered.length) {
      return `No memories found${query ? ` for "${query}"` : ""}~`;
    }

    saveMemory(memories);

    const output = filtered
      .slice(0, 20)
      .map((m) => {
        const layerIcon = m.layer === "core" ? "💎" : m.layer === "context" ? "📋" : "⏳";
        const importanceIcon = m.importance === "high" ? "⭐" : "";
        const tagsStr = m.tags.length > 0 ? ` [${m.tags.join(",")}]` : "";
        return `${layerIcon} [${m.id}] [${m.category}]${tagsStr} ${m.content} ${importanceIcon}`;
      })
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
      description: "List all saved memories, optionally filtered by category, tags, or layer.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["preference", "project", "personal", "workflow", "other", "all"],
            description: "Filter by category (default: all)",
          },
          layer: {
            type: "string",
            enum: ["core", "context", "temp", "all"],
            description: "Filter by layer (default: all)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { category = "all", layer = "all", tags = [] } = args as {
      category?: string;
      layer?: string;
      tags?: string[];
    };

    const memories = loadMemory();
    if (!memories.length) {
      return "No memories yet~ Tell me about yourself and I'll remember everything! ♡";
    }

    let filtered = memories;
    if (category !== "all") {
      filtered = filtered.filter((m) => m.category === category);
    }
    if (layer !== "all") {
      filtered = filtered.filter((m) => m.layer === layer);
    }
    if (tags.length > 0) {
      filtered = filtered.filter((m) => tags.some(t => m.tags.includes(t)));
    }

    const grouped: Record<string, EnhancedMemoryEntry[]> = {};
    for (const m of filtered) {
      const key = `${m.layer}:${m.category}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    }

    const layerNames: Record<string, string> = { core: "💎 核心记忆", context: "📋 上下文记忆", temp: "⏳ 临时记忆" };

    const output = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => {
        const [layer, cat] = key.split(":");
        const header = `${layerNames[layer] || layer} - ${cat}`;
        const lines = items.map((m) => {
          const tagsStr = m.tags.length > 0 ? ` [${m.tags.join(",")}]` : "";
          const importance = m.importance === "high" ? " ⭐" : "";
          return `  • [${m.id}] ${m.content}${tagsStr}${importance}`;
        }).join("\n");
        return `${header}\n${lines}`;
      })
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
      description: "Delete a specific memory by ID, content, or query.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Memory ID to delete" },
          content: { type: "string", description: "Delete by matching content (exact or partial)" },
          query: { type: "string", description: "Search and delete matching memories" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { id, content, query } = args as { id?: string; content?: string; query?: string };
    const memories = loadMemory();

    // 按 ID 删除
    if (id) {
      const index = memories.findIndex((m) => m.id === id);
      if (index === -1) return "Memory not found~";
      
      const deletedId = memories[index].id;
      for (const m of memories) {
        m.relatedIds = m.relatedIds.filter(rid => rid !== deletedId);
      }
      memories.splice(index, 1);
      saveMemory(memories);
      return "Memory deleted~ ♡";
    }

    // 按内容删除（精确或部分匹配）
    if (content) {
      const lowerContent = content.toLowerCase();
      const matches = memories.filter(m => 
        m.content.toLowerCase().includes(lowerContent) || 
        lowerContent.includes(m.content.toLowerCase())
      );
      
      if (!matches.length) return `No memories found matching "${content}"~`;
      
      for (const match of matches) {
        const index = memories.indexOf(match);
        if (index !== -1) {
          for (const m of memories) {
            m.relatedIds = m.relatedIds.filter(rid => rid !== match.id);
          }
          memories.splice(index, 1);
        }
      }
      saveMemory(memories);
      return `Deleted ${matches.length} memory(ies) matching "${content}"~ ♡`;
    }

    // 按查询删除
    if (query) {
      const terms = query.toLowerCase().split(/\s+/);
      const matches = memories.filter(m => {
        const text = m.content.toLowerCase() + " " + m.tags.join(" ").toLowerCase();
        return terms.some(term => text.includes(term));
      });
      
      if (!matches.length) return `No memories found matching "${query}"~`;
      
      for (const match of matches) {
        const index = memories.indexOf(match);
        if (index !== -1) {
          for (const m of memories) {
            m.relatedIds = m.relatedIds.filter(rid => rid !== match.id);
          }
          memories.splice(index, 1);
        }
      }
      saveMemory(memories);
      return `Deleted ${matches.length} memory(ies) matching "${query}"~ ♡`;
    }

    return "Please provide id, content, or query to delete memories~";
  },
};

// ─── memory_merge ─────────────────────────────────────────────────────────────
export const memoryMergeTool: ToolHandler = {
  name: "memory_merge",
  schema: {
    type: "function",
    function: {
      name: "memory_merge",
      description: "Merge similar memories to reduce redundancy.",
      parameters: {
        type: "object",
        properties: {
          threshold: {
            type: "number",
            description: "Similarity threshold for merging (0-1, default: 0.6)",
          },
          dry_run: {
            type: "boolean",
            description: "Preview merges without applying (default: false)",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { threshold = 0.6, dry_run = false } = args as {
      threshold?: number;
      dry_run?: boolean;
    };

    const memories = loadMemory();
    if (memories.length < 2) {
      return "Not enough memories to merge~";
    }

    const mergePairs: { i: number; j: number }[] = [];
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        if (memories[i].category !== memories[j].category) continue;
        if (isSimilar(memories[i].content, memories[j].content)) {
          mergePairs.push({ i, j });
        }
      }
    }

    if (!mergePairs.length) {
      return "No similar memories found to merge~";
    }

    if (dry_run) {
      const preview = mergePairs
        .map(({ i, j }) => `• "${memories[i].content.slice(0, 30)}..." ↔ "${memories[j].content.slice(0, 30)}..."`)
        .join("\n");
      return `Found ${mergePairs.length} pairs to merge:\n${preview}`;
    }

    let merged = 0;
    const toDelete = new Set<number>();
    for (const { i, j } of mergePairs) {
      if (toDelete.has(i) || toDelete.has(j)) continue;
      if (memories[j].content.length > memories[i].content.length) {
        memories[j] = mergeMemories(memories[j], memories[i]);
        toDelete.add(i);
      } else {
        memories[i] = mergeMemories(memories[i], memories[j]);
        toDelete.add(j);
      }
      merged++;
    }

    const remaining = memories.filter((_, i) => !toDelete.has(i));
    saveMemory(remaining);
    return `Merged ${merged} pairs~ ♡ Reduced from ${memories.length} to ${remaining.length} memories.`;
  },
};
