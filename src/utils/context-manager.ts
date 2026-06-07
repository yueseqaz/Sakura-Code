import type { ChatMsg } from "../types.js";
import type { ToolHandler, ToolDef } from "../types.js";

// ─── 模型 Context Window 映射 ─────────────────────────────────────────────────
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4": 8192,
  "gpt-4-32k": 32768,
  "gpt-3.5-turbo": 16385,
  "gpt-3.5-turbo-16k": 16385,
  "o1": 200000,
  "o1-mini": 128000,
  "o1-pro": 200000,
  // Anthropic
  "claude-3-opus": 200000,
  "claude-3-sonnet": 200000,
  "claude-3-haiku": 200000,
  "claude-3.5-sonnet": 200000,
  "claude-3.5-haiku": 200000,
  // DeepSeek
  "deepseek-chat": 128000,
  "deepseek-coder": 128000,
  "deepseek-reasoner": 128000,
  // Xiaomi
  "mimo-v2.5-pro": 128000,
  "mimo-v2.5-flash": 128000,
  // Google
  "gemini-pro": 128000,
  "gemini-1.5-pro": 1000000,
  "gemini-1.5-flash": 1000000,
  "gemini-2.0-flash": 1000000,
};

// ─── 获取模型 Context Window ──────────────────────────────────────────────────
export function getModelContextWindow(model: string): number {
  // 精确匹配
  if (MODEL_CONTEXT_WINDOWS[model]) {
    return MODEL_CONTEXT_WINDOWS[model];
  }
  
  // 模糊匹配（去掉版本后缀）
  const baseModel = model.replace(/-\d{4}$|\..*$/, "");
  if (MODEL_CONTEXT_WINDOWS[baseModel]) {
    return MODEL_CONTEXT_WINDOWS[baseModel];
  }
  
  // 前缀匹配
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (model.startsWith(key) || key.startsWith(model)) {
      return value;
    }
  }
  
  // 默认值
  return 128000;
}

// ─── Token 计数器（延迟加载 tiktoken）─────────────────────────────────────────
let encoder: any = null;

async function getEncoder() {
  if (!encoder) {
    try {
      const tiktoken = await import("tiktoken");
      encoder = tiktoken.encoding_for_model("gpt-4");
    } catch {
      encoder = null;
    }
  }
  return encoder;
}

// ─── Context 配置 ─────────────────────────────────────────────────────────────
export interface ContextConfig {
  maxTokens: number;          // 最大 token 数
  warnThreshold: number;      // 警告阈值 (0-1)
  compressThreshold: number;  // 压缩阈值 (0-1)
  keepRecentRounds: number;   // 保留最近轮数
  provider?: string;          // API provider
  model?: string;             // 模型名（用于自动获取 context window）
}

const DEFAULT_CONFIG: ContextConfig = {
  maxTokens: 128000,
  warnThreshold: 0.8,
  compressThreshold: 0.9,
  keepRecentRounds: 5,
};

// ─── Context Manager ──────────────────────────────────────────────────────────
export class ContextManager {
  private config: ContextConfig;
  private lastUsage: { prompt: number; completion: number; total: number } | null = null;
  private isCompressing = false;

  constructor(config: Partial<ContextConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // 如果提供了模型名，自动获取 context window
    if (config.model && !config.maxTokens) {
      this.config.maxTokens = getModelContextWindow(config.model);
    }
  }

  // ─── Token 计数 ──────────────────────────────────────────────────────────
  async countTokens(messages: ChatMsg[]): Promise<number> {
    // 优先使用 API 返回的 usage
    if (this.lastUsage) {
      return this.lastUsage.total;
    }

    // 尝试使用 tiktoken（OpenAI/DeepSeek）
    const enc = await getEncoder();
    if (enc) {
      try {
        let total = 0;
        for (const msg of messages) {
          // 粗略计算：每个消息有固定开销
          total += 4; // message overhead
          if (typeof msg.content === "string") {
            total += enc.encode(msg.content).length;
          } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === "text") {
                total += enc.encode(part.text).length;
              }
            }
          }
        }
        return total;
      } catch {
        // fallback
      }
    }

    // 字符估算兜底
    return this.estimateByChars(messages);
  }

  // ─── 字符估算 ─────────────────────────────────────────────────────────────
  private estimateByChars(messages: ChatMsg[]): number {
    let totalChars = 0;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "text") {
            totalChars += part.text.length;
          }
        }
      }
    }
    // 中文约 1.5 token/字，英文约 0.25 token/字，取中间值
    return Math.ceil(totalChars * 0.5);
  }

  // ─── 更新 usage（从 API 响应）─────────────────────────────────────────────
  updateUsage(promptTokens: number, completionTokens: number, totalTokens: number) {
    this.lastUsage = {
      prompt: promptTokens,
      completion: completionTokens,
      total: totalTokens,
    };
  }

  // ─── 检查是否需要压缩 ────────────────────────────────────────────────────
  async needsCompression(messages: ChatMsg[]): Promise<{ needed: boolean; level: number }> {
    const tokenCount = await this.countTokens(messages);
    const ratio = tokenCount / this.config.maxTokens;

    if (ratio >= 0.95) {
      return { needed: true, level: 3 }; // 强制滑动窗口
    }
    if (ratio >= this.config.compressThreshold) {
      return { needed: true, level: 2 }; // 摘要压缩
    }
    if (ratio >= this.config.warnThreshold) {
      return { needed: true, level: 1 }; // 移除工具详情
    }

    return { needed: false, level: 0 };
  }

  // ─── 压缩消息 ─────────────────────────────────────────────────────────────
  async compress(messages: ChatMsg[]): Promise<{ messages: ChatMsg[]; compressed: boolean; level: number }> {
    const { needed, level } = await this.needsCompression(messages);
    
    if (!needed) {
      return { messages, compressed: false, level: 0 };
    }

    this.isCompressing = true;
    let result = [...messages];

    // Level 1: 移除工具调用详情
    if (level >= 1) {
      result = this.removeToolDetails(result);
    }

    // 检查是否仍需压缩
    if (level >= 2) {
      const stillNeeded = await this.needsCompression(result);
      if (stillNeeded.needed) {
        // Level 2 & 3: 保留最近 N 轮 + 系统提示词
        result = this.slidingWindow(result);
      }
    }

    this.isCompressing = false;
    return { messages: result, compressed: true, level };
  }

  // ─── Level 1: 移除工具详情 ────────────────────────────────────────────────
  private removeToolDetails(messages: ChatMsg[]): ChatMsg[] {
    return messages.map(msg => {
      // 移除工具调用的详细参数
      if (msg.role === "assistant" && (msg as any).tool_calls) {
        return {
          ...msg,
          tool_calls: (msg as any).tool_calls.map((tc: any) => ({
            ...tc,
            function: {
              ...tc.function,
              arguments: "{}", // 清空参数详情
            },
          })),
        };
      }
      // 移除工具返回的详细内容
      if (msg.role === "tool") {
        return {
          ...msg,
          content: "[tool output omitted]",
        };
      }
      return msg;
    });
  }

  // ─── Level 2/3: 滑动窗口 ─────────────────────────────────────────────────
  private slidingWindow(messages: ChatMsg[]): ChatMsg[] {
    const keepRounds = this.config.keepRecentRounds;
    
    // 找到系统提示词（第一条）
    const systemMsg = messages[0];
    const rest = messages.slice(1);

    // 计算要保留的消息数（每轮约 2-3 条消息）
    const keepCount = keepRounds * 3;
    
    if (rest.length <= keepCount) {
      return messages; // 已经够短
    }

    // 分离旧消息和新消息
    const oldMessages = rest.slice(0, rest.length - keepCount);
    const newMessages = rest.slice(rest.length - keepCount);

    // 生成摘要
    const summary = this.generateSummary(oldMessages);

    // 组合：系统提示词 + 摘要 + 最近消息
    return [
      systemMsg,
      { role: "assistant", content: `[对话摘要] ${summary}` } as ChatMsg,
      ...newMessages,
    ];
  }

  // ─── 生成摘要 ─────────────────────────────────────────────────────────────
  private generateSummary(messages: ChatMsg[]): string {
    // 提取关键信息
    const topics: string[] = [];
    const actions: string[] = [];

    for (const msg of messages) {
      if (typeof msg.content === "string") {
        // 用户消息：提取主题
        if (msg.role === "user") {
          const preview = msg.content.slice(0, 100);
          if (preview.length > 10) {
            topics.push(preview);
          }
        }
        // 助手消息：提取操作
        if (msg.role === "assistant" && msg.content) {
          const preview = msg.content.slice(0, 80);
          if (preview.length > 10) {
            actions.push(preview);
          }
        }
      }
    }

    // 构建摘要
    const parts: string[] = [];
    if (topics.length > 0) {
      parts.push(`讨论了: ${topics.slice(0, 3).join("; ")}`);
    }
    if (actions.length > 0) {
      parts.push(`执行了: ${actions.slice(0, 3).join("; ")}`);
    }

    return parts.join("。") || "之前的对话";
  }

  // ─── 获取状态信息 ─────────────────────────────────────────────────────────
  async getStatus(messages: ChatMsg[]): Promise<{
    tokenCount: number;
    maxTokens: number;
    usage: number;
    needsAction: boolean;
    formatted: string;
  }> {
    const tokenCount = await this.countTokens(messages);
    const usage = tokenCount / this.config.maxTokens;
    
    // 格式化输出
    const formatTokens = (n: number) => {
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return String(n);
    };
    
    const percent = (usage * 100).toFixed(1);
    const bar = this.generateProgressBar(usage);
    
    return {
      tokenCount,
      maxTokens: this.config.maxTokens,
      usage,
      needsAction: usage >= this.config.warnThreshold,
      formatted: `${bar} ${formatTokens(tokenCount)}/${formatTokens(this.config.maxTokens)} (${percent}%)`,
    };
  }

  // ─── 生成进度条 ─────────────────────────────────────────────────────────────
  private generateProgressBar(ratio: number): string {
    const width = 20;
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    
    let color: string;
    if (ratio >= 0.9) color = '🔴';
    else if (ratio >= 0.7) color = '🟡';
    else color = '🟢';
    
    return `${color} [${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  // ─── 重置 ─────────────────────────────────────────────────────────────────
  reset() {
    this.lastUsage = null;
  }
}
