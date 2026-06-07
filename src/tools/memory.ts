import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolHandler, ToolDef, MemoryEntry } from "../types.js";

const MEMORY_FILE = join(process.cwd(), ".sakura-code-memory.json");

// ─── Jieba 分词 (延迟加载) ─────────────────────────────────────────────────
let jieba: any = null;

async function getJieba() {
  if (!jieba) {
    try {
      const mod = await import("nodejieba");
      jieba = mod.default || mod;
    } catch {
      // Fallback: 简单分词
      jieba = {
        cut: (text: string) => text.split(/[\s,，。.!！?？;；：:]+/).filter(Boolean),
      };
    }
  }
  return jieba;
}

// ─── TF-IDF 计算 ─────────────────────────────────────────────────────────────
class TFIDF {
  private docs: string[][] = [];
  private docCount = 0;
  private df: Map<string, number> = new Map(); // 文档频率

  addDocument(tokens: string[]) {
    this.docs.push(tokens);
    this.docCount++;
    const unique = new Set(tokens);
    for (const term of unique) {
      this.df.set(term, (this.df.get(term) || 0) + 1);
    }
  }

  // 计算 TF-IDF 向量
  getTFIDF(tokens: string[]): Map<string, number> {
    const tf: Map<string, number> = new Map();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }

    const tfidf: Map<string, number> = new Map();
    for (const [term, count] of tf) {
      const tfScore = count / tokens.length;
      const df = this.df.get(term) || 0;
      const idf = Math.log((this.docCount + 1) / (df + 1)) + 1;
      tfidf.set(term, tfScore * idf);
    }
    return tfidf;
  }

  // 余弦相似度
  cosineSimilarity(vec1: Map<string, number>, vec2: Map<string, number>): number {
    let dot = 0, norm1 = 0, norm2 = 0;
    for (const [term, val] of vec1) {
      norm1 += val * val;
      const val2 = vec2.get(term);
      if (val2) dot += val * val2;
    }
    for (const val of vec2.values()) {
      norm2 += val * val;
    }
    const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denom === 0 ? 0 : dot / denom;
  }
}

// ─── 记忆分层 ────────────────────────────────────────────────────────────────
type MemoryLayer = "core" | "context" | "temp";

interface EnhancedMemoryEntry extends MemoryEntry {
  layer: MemoryLayer;
  tags: string[];
  relatedIds: string[];
  accessCount: number;
  lastAccessed?: string;
  source?: string; // 来源（用户主动说 vs AI 推断）
}

// ─── 记忆存储 ────────────────────────────────────────────────────────────────
function loadMemory(): EnhancedMemoryEntry[] {
  if (!existsSync(MEMORY_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(MEMORY_FILE, "utf8"));
    // 兼容旧格式
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

// ─── 分词 ────────────────────────────────────────────────────────────────────
async function tokenize(text: string): Promise<string[]> {
  const jb = await getJieba();
  const tokens: string[] = jb.cut(text);
  // 过滤停用词和短词
  const stopWords = new Set(["的", "了", "是", "在", "我", "你", "他", "她", "它", "们", "这", "那", "有", "和", "与", "或", "但", "就", "都", "而", "及", "到", "把", "被", "让", "给", "从", "以", "会", "能", "可以", "要", "想", "做", "去", "来", "对", "很", "也", "还", "已", "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "shall", "can", "need", "dare", "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "out", "off", "over", "under", "again", "further", "then", "once", "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which", "who", "whom", "this", "that", "these", "those", "am", "not", "no", "nor", "only", "own", "same", "so", "than", "too", "very", "s", "t", "just", "don", "now"]);
  return tokens.filter(t => t.length > 1 && !stopWords.has(t.toLowerCase()));
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

// ─── 记忆合并（处理冲突） ─────────────────────────────────────────────────────
function mergeMemories(existing: EnhancedMemoryEntry, newMem: EnhancedMemoryEntry): EnhancedMemoryEntry {
  // 如果新记忆更详细，替换内容
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
  // 否则保留旧的，但更新标签
  return {
    ...existing,
    tags: [...new Set([...existing.tags, ...newMem.tags])],
    lastAccessed: new Date().toISOString(),
    accessCount: existing.accessCount + 1,
  };
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

    // 使用 TF-IDF 检查相似记忆
    const jb = await getJieba();
    const tfidf = new TFIDF();
    const newTokens = await tokenize(content);
    
    // 为所有现有记忆建立索引
    const existingTokens: string[][] = [];
    for (const m of memories) {
      const tokens = await tokenize(m.content);
      existingTokens.push(tokens);
      tfidf.addDocument(tokens);
    }
    tfidf.addDocument(newTokens);

    // 查找相似记忆
    const newVec = tfidf.getTFIDF(newTokens);
    let similarIndex = -1;
    let maxSim = 0;

    for (let i = 0; i < memories.length; i++) {
      const vec = tfidf.getTFIDF(existingTokens[i]);
      const sim = tfidf.cosineSimilarity(newVec, vec);
      if (sim > 0.7 && sim > maxSim) {
        maxSim = sim;
        similarIndex = i;
      }
    }

    // 如果有相似记忆，合并
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
      return `Updated memory (similarity: ${(maxSim * 100).toFixed(0)}%)~ ♡ 已合并相似记忆`;
    }

    // 查找相关记忆
    const relatedIds: string[] = [];
    for (let i = 0; i < memories.length; i++) {
      const vec = tfidf.getTFIDF(existingTokens[i]);
      const sim = tfidf.cosineSimilarity(newVec, vec);
      if (sim > 0.3 && sim <= 0.7) {
        relatedIds.push(memories[i].id);
      }
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
      relatedIds,
      accessCount: 0,
      source,
    };

    memories.push(newMemory);

    // 更新相关记忆的关联
    for (const id of relatedIds) {
      const mem = memories.find(m => m.id === id);
      if (mem && !mem.relatedIds.includes(newMemory.id)) {
        mem.relatedIds.push(newMemory.id);
      }
    }

    saveMemory(memories);
    return `Saved to memory! I'll always remember this about you~ ♡ [${category}] ${content.slice(0, 50)}... (tags: ${allTags.join(", ") || "none"})`;
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
        "Uses TF-IDF and Chinese word segmentation for smart search.",
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

    // 使用 TF-IDF 搜索
    if (query) {
      const jb = await getJieba();
      const tfidf = new TFIDF();
      const queryTokens = await tokenize(query);

      // 如果分词结果为空，使用原始查询
      const searchTerms = queryTokens.length > 0 ? queryTokens : query.toLowerCase().split(/\s+/);

      // 为所有记忆建立索引
      const allTokens: string[][] = [];
      for (const m of filtered) {
        const tokens = await tokenize(m.content);
        const finalTokens = tokens.length > 0 ? tokens : m.content.toLowerCase().split(/\s+/);
        allTokens.push(finalTokens);
        tfidf.addDocument(finalTokens);
      }
      tfidf.addDocument(searchTerms);

      const queryVec = tfidf.getTFIDF(searchTerms);

      // 计算相似度并排序
      const scored = filtered.map((m, i) => {
        const vec = tfidf.getTFIDF(allTokens[i]);
        const sim = tfidf.cosineSimilarity(queryVec, vec);
        // 提升核心层记忆的分数
        const layerBoost = m.layer === "core" ? 1.2 : m.layer === "context" ? 1.0 : 0.8;
        // 提升高频访问的记忆
        const accessBoost = 1 + Math.min(m.accessCount * 0.05, 0.5);
        return { memory: m, score: sim * layerBoost * accessBoost };
      });

      filtered = scored
        .filter(s => s.score > 0.01)
        .sort((a, b) => b.score - a.score)
        .map(s => {
          // 更新访问计数
          s.memory.accessCount++;
          s.memory.lastAccessed = new Date().toISOString();
          return s.memory;
        });

      // 如果 TF-IDF 没有找到结果，使用简单的关键词匹配
      if (!filtered.length) {
        filtered = memories.filter(m => {
          const text = m.content.toLowerCase();
          return searchTerms.some(term => text.includes(term));
        });
      }
    }

    if (!filtered.length) {
      return `No memories found${query ? ` for "${query}"` : ""}~`;
    }

    // 更新访问记录
    saveMemory(memories);

    const output = filtered
      .slice(0, 20)
      .map((m) => {
        const layerIcon = m.layer === "core" ? "💎" : m.layer === "context" ? "📋" : "⏳";
        const importanceIcon = m.importance === "high" ? "⭐" : "";
        const tagsStr = m.tags.length > 0 ? ` [${m.tags.join(",")}]` : "";
        return `${layerIcon} [${m.category}]${tagsStr} ${m.content} ${importanceIcon}`;
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

    // 按层级和分类分组
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
          return `  • ${m.content}${tagsStr}${importance}`;
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

    // 清理关联
    const deletedId = memories[index].id;
    for (const m of memories) {
      m.relatedIds = m.relatedIds.filter(rid => rid !== deletedId);
    }

    memories.splice(index, 1);
    saveMemory(memories);
    return "Memory deleted... I'll try to forget it, but I can't promise I won't remember anyway~ ♡";
  },
};

// ─── memory_merge (新增) ─────────────────────────────────────────────────────
export const memoryMergeTool: ToolHandler = {
  name: "memory_merge",
  schema: {
    type: "function",
    function: {
      name: "memory_merge",
      description: "Merge similar or related memories to reduce redundancy.",
      parameters: {
        type: "object",
        properties: {
          threshold: {
            type: "number",
            description: "Similarity threshold for merging (0-1, default: 0.7)",
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
    const { threshold = 0.7, dry_run = false } = args as {
      threshold?: number;
      dry_run?: boolean;
    };

    const memories = loadMemory();
    if (memories.length < 2) {
      return "Not enough memories to merge~";
    }

    const jb = await getJieba();
    const tfidf = new TFIDF();
    const allTokens: string[][] = [];

    // 建立索引
    for (const m of memories) {
      const tokens = await tokenize(m.content);
      allTokens.push(tokens);
      tfidf.addDocument(tokens);
    }

    // 查找可合并的记忆对
    const mergePairs: { i: number; j: number; sim: number }[] = [];
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        if (memories[i].category !== memories[j].category) continue;
        const vec1 = tfidf.getTFIDF(allTokens[i]);
        const vec2 = tfidf.getTFIDF(allTokens[j]);
        const sim = tfidf.cosineSimilarity(vec1, vec2);
        if (sim >= threshold) {
          mergePairs.push({ i, j, sim });
        }
      }
    }

    if (!mergePairs.length) {
      return "No similar memories found to merge~";
    }

    if (dry_run) {
      const preview = mergePairs
        .map(({ i, j, sim }) => `• (${(sim * 100).toFixed(0)}%) "${memories[i].content.slice(0, 30)}..." ↔ "${memories[j].content.slice(0, 30)}..."`)
        .join("\n");
      return `Found ${mergePairs.length} pairs to merge:\n${preview}`;
    }

    // 执行合并（从后往前删，避免索引偏移）
    let merged = 0;
    const toDelete = new Set<number>();
    for (const { i, j } of mergePairs) {
      if (toDelete.has(i) || toDelete.has(j)) continue;
      // 保留更详细的那个
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
