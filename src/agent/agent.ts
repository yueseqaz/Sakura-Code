import OpenAI from "openai";
import type { Context } from "./context.js";
import { Registry } from "../tools/registry.js";
import { logger } from "../utils/logger.js";
import { ContextManager } from "../utils/context-manager.js";
import { SubagentManager } from "./subagent-manager.js";
import { matchSkillByTool } from "../tools/skill.js";
import type { AgentConfig, ChatMsg, MCPAdapter } from "../types.js";

const MAX_ITERATIONS = 50;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// ─── Diff 颜色化 ─────────────────────────────────────────────────────────────
function colorizeDiff(diff: string): string {
  return diff.split("\n").map(line => {
    if (line.startsWith("+")) {
      return `\x1b[32m${line}\x1b[0m`;  // 绿色
    }
    if (line.startsWith("-")) {
      return `\x1b[31m${line}\x1b[0m`;  // 红色
    }
    if (line.startsWith("📄") || line.startsWith("─")) {
      return `\x1b[1m\x1b[36m${line}\x1b[0m`;  // 粗体青色
    }
    return line;
  }).join("\n");
}

// ─── Token Usage Tracking ────────────────────────────────────────────────────
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
}

export class Agent {
  private client: OpenAI;
  private model: string;
  private registry: Registry;
  private maxIterations: number;
  private tokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 };
  private aborted: boolean = false;
  private currentAbortController: AbortController | null = null;
  private contextManager: ContextManager;
  private subagentManager: SubagentManager;
  private progressCallback: ((progress: string) => void) | null = null;
  private silent: boolean = false; // 静默模式
  private outputBuffer: string[] = []; // 输出缓冲区（静默模式用）
  private mcpServers: MCPAdapter[];
  private mcpLoaded: boolean = false;

  constructor(config: AgentConfig = {}) {
    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    const baseURL = config.baseURL ?? process.env.OPENAI_BASE_URL;
    const model = config.model ?? process.env.OPENAI_MODEL;

    if (!apiKey) throw new Error("OPENAI_API_KEY is required");
    if (!model) throw new Error("OPENAI_MODEL is required");

    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
    this.maxIterations = config.maxIterations ?? MAX_ITERATIONS;
    this.registry = new Registry();
    this.mcpServers = config.mcpServers ?? [];

    // 初始化 context manager
    this.contextManager = new ContextManager({
      model: model,
      provider: config.provider,
      apiKey: apiKey,
      baseURL: baseURL,
    });

    // 初始化子代理管理器
    this.subagentManager = new SubagentManager(config);

    // 加载子代理工具
    this.registry.loadSubagentTools(this.subagentManager);

    // Setup Ctrl+C handler
    this.setupSignalHandlers();
  }

  // ─── 设置进度回调 ──────────────────────────────────────────────────────────
  setProgressCallback(callback: (progress: string) => void) {
    this.progressCallback = callback;
  }

  // ─── 设置静默模式 ──────────────────────────────────────────────────────────
  setSilent(silent: boolean) {
    this.silent = silent;
  }

  // ─── 输出方法（支持静默模式）──────────────────────────────────────────────
  private output(text: string) {
    if (this.silent) {
      this.outputBuffer.push(text);
    } else {
      process.stdout.write(text);
    }
  }

  // ─── 获取输出缓冲区 ────────────────────────────────────────────────────────
  getOutputBuffer(): string {
    return this.outputBuffer.join("");
  }

  clearOutputBuffer() {
    this.outputBuffer = [];
  }

  // ─── Signal Handlers (Ctrl+C) ──────────────────────────────────────────────
  private static signalHandlerAttached = false;

  private setupSignalHandlers(): void {
    if (Agent.signalHandlerAttached) return;
    Agent.signalHandlerAttached = true;

    process.on("SIGINT", () => {
      if (this.currentAbortController) {
        this.aborted = true;
        this.currentAbortController.abort();
        logger.info("Interrupted! Finishing current output...");
      } else {
        process.exit(0);
      }
    });
  }

  // ─── Retry with Exponential Backoff ────────────────────────────────────────
  private async withRetry<T>(
    fn: () => Promise<T>,
    label: string = "API call"
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;

        // Don't retry on non-retryable errors
        if (err.status === 401 || err.status === 403) {
          throw new Error(`Authentication failed: ${err.message}`);
        }
        if (err.status === 400) {
          throw new Error(`Bad request: ${err.message}`);
        }

        // Don't retry if aborted
        if (this.aborted) {
          throw new Error("Operation aborted by user");
        }

        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000;
          logger.info(`${label} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${Math.round(delay / 1000)}s...`);
          this.progressCallback?.(`Retrying ${label} (attempt ${attempt + 2})...`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError || new Error(`${label} failed after ${MAX_RETRIES + 1} attempts`);
  }

  // ─── Main Agent Loop ──────────────────────────────────────────────────────
  async run(ctx: Context, userInput: string): Promise<void> {
    // Load MCP servers on first run (deferred from constructor)
    if (!this.mcpLoaded && this.mcpServers.length > 0) {
      await Promise.all(this.mcpServers.map((s) => this.registry.loadMCP(s)));
      this.mcpLoaded = true;
    }

    // 初始化 context manager（从 API 获取 context window）
    this.progressCallback?.("Initializing context manager...");
    await this.contextManager.init();
    
    // 匹配并加载 Skill
    const skillLoaded = ctx.matchAndLoadSkill(userInput);
    if (skillLoaded) {
      logger.info(`Loaded skill: ${ctx.getActiveSkill()}`);
    }
    
    ctx.push({ role: "user", content: userInput });
    this.aborted = false;

    let iterations = 0;

    while (iterations < this.maxIterations && !this.aborted) {
      iterations++;

      // ── 更新心跳 ──────────────────────────────────────────────────────
      this.progressCallback?.(`Iteration ${iterations}/${this.maxIterations}...`);

      // ── Context 压缩检查 ──────────────────────────────────────────────
      const { messages: compressed, compressed: didCompress, level } = 
        await this.contextManager.compress(ctx.messages);
      
      if (didCompress) {
        ctx.messages = compressed;
        logger.info(`Context compressed (level ${level}), token usage reduced~`);
      }

      // Show thinking status
      logger.thinking();

      // Create abort controller for this request
      this.currentAbortController = new AbortController();

      // ── Call LLM with Retry ──────────────────────────────────────────────
      this.progressCallback?.(`Calling LLM (iteration ${iterations})...`);
      let stream: AsyncIterable<any>;
      try {
        stream = await this.withRetry(
          () => this.client.chat.completions.create({
            model: this.model,
            messages: ctx.messages,
            tools: this.registry.schemas(),
            tool_choice: "auto",
            parallel_tool_calls: true,
            stream: true,
            stream_options: { include_usage: true },
          }, { signal: this.currentAbortController!.signal }),
          "Chat completion"
        );
      } catch (err: any) {
        logger.stopLoading();
        logger.error(err.message);
        break;
      }

      // Accumulate streaming response
      let content = "";
      const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
      let hasContent = false;
      let thinkingStopped = false;

      try {
        for await (const chunk of stream) {
          // Check if aborted
          if (this.aborted) break;

          // 定期更新心跳（每收到一个 chunk 都算活跃）
          this.progressCallback?.(`Streaming response...`);

          // Extract usage from chunk
          if (chunk.usage) {
            const u = chunk.usage;
            this.tokenUsage.promptTokens += u.prompt_tokens || 0;
            this.tokenUsage.completionTokens += u.completion_tokens || 0;
            this.tokenUsage.totalTokens += u.total_tokens || 0;
            this.tokenUsage.requestCount++;
            
            // 更新 context manager
            this.contextManager.updateUsage(
              u.prompt_tokens || 0,
              u.completion_tokens || 0,
              u.total_tokens || 0
            );
          }

          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;

          // Handle text content
          if (delta.content) {
            if (!thinkingStopped) {
              thinkingStopped = true;
              logger.stopLoading();
            }
            if (!hasContent) {
              hasContent = true;
              this.output("\n");
            }
            content += delta.content;
            this.output(delta.content);
          }

          // Handle tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              if (!toolCalls.has(index)) {
                toolCalls.set(index, { id: "", name: "", arguments: "" });
              }
              const existing = toolCalls.get(index)!;
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
            }
          }
        }
      } catch (err: any) {
        if (this.aborted) {
          logger.info("Stream interrupted by user");
        } else {
          logger.error(`Stream error: ${err.message}`);
        }
      }

      // If API didn't return usage, estimate from content
      if (this.tokenUsage.requestCount === 0 || !stream) {
        // Simple estimation: ~4 chars per token
        const estimatedPrompt = Math.ceil(JSON.stringify(ctx.messages).length / 4);
        const estimatedCompletion = Math.ceil(content.length / 4);
        this.tokenUsage.promptTokens += estimatedPrompt;
        this.tokenUsage.completionTokens += estimatedCompletion;
        this.tokenUsage.totalTokens += estimatedPrompt + estimatedCompletion;
        this.tokenUsage.requestCount++;
      }

      // Cleanup
      this.currentAbortController = null;
      if (!thinkingStopped) {
        thinkingStopped = true;
        logger.stopLoading();
      }
      if (hasContent) {
        this.output("\n");
      }

      // If aborted, break the loop
      if (this.aborted) {
        logger.info("Operation cancelled");
        break;
      }

      // Build assistant message
      const assistantMsg: ChatMsg = {
        role: "assistant",
        content: content || null,
      };

      if (toolCalls.size > 0) {
        (assistantMsg as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam).tool_calls =
          Array.from(toolCalls.entries()).map(([_, tc]) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          }));
      }

      ctx.push(assistantMsg);

      // No tool calls → done
      if (toolCalls.size === 0) break;

      // 显示俏皮型加载动画
      logger.working();
      this.progressCallback?.(`Preparing ${toolCalls.size} tool(s)...`);
      
      // 短暂延迟让用户看到提示
      await new Promise(r => setTimeout(r, 300));
      
      const toolResults = await this.executeTools(
        Array.from(toolCalls.entries()).map(([_, tc]) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
        ctx
      );
      ctx.push(...toolResults);

      // ── 工具执行完成，更新心跳 ────────────────────────────────────────
      this.progressCallback?.(`Completed iteration ${iterations}`);
    }

    logger.stopLoading();

    if (iterations >= this.maxIterations) {
      logger.error(`Reached max iterations (${this.maxIterations}). Stopping.`);
    }
  }

  // ─── Tool Dispatch ─────────────────────────────────────────────────────────
  private async executeTools(
    toolCalls: { id: string; type: "function"; function: { name: string; arguments: string } }[],
    ctx?: Context
  ): Promise<ChatMsg[]> {
    const results = await Promise.all(
      toolCalls.map(async (call): Promise<ChatMsg> => {
        const { name, arguments: argsJson } = call.function;
        
        // 检查是否需要加载技能
        if (ctx) {
          const skill = matchSkillByTool(name);
          if (skill && skill.name !== ctx.getActiveSkill()) {
            // 直接加载技能，不通过 matchAndLoadSkill
            const loaded = ctx.loadSkillDirectly(skill.name);
            if (loaded) {
              logger.info(`Loaded skill: ${skill.name}`);
            }
          }
        }
        
        logger.toolCall(name, argsJson);

        let content: string;
        try {
          const args = JSON.parse(argsJson || "{}");
          content = await this.registry.call(name, args);
        } catch (err) {
          content = `Error: ${(err as Error).message}`;
        }

        // 如果是文件编辑工具，直接显示 diff（带颜色）
        if (name === "edit_file" || name === "write_file") {
          const diffMatch = content.match(/(📄[\s\S]*?────────────────────────────────────[\s\S]*?)(?=\n✅|$)/);
          if (diffMatch) {
            // 添加颜色后直接输出
            const coloredDiff = colorizeDiff(diffMatch[1]);
            process.stdout.write("\n" + coloredDiff + "\n\n");
          }
        }

        logger.toolResult(content);

        return {
          role: "tool",
          tool_call_id: call.id,
          content,
        };
      })
    );

    return results;
  }

  // ─── Public Accessors ──────────────────────────────────────────────────────
  getRegistry(): Registry {
    return this.registry;
  }

  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }

  // ─── 获取总 Token 用量（主 Agent + 子代理）──────────────────────────────────
  getGrandTotalTokens(): { main: TokenUsage; subagent: TokenUsage; grand: TokenUsage } {
    const main = { ...this.tokenUsage };
    const subagent = this.subagentManager.getTotalSubagentTokens();
    const grand: TokenUsage = {
      promptTokens: main.promptTokens + subagent.promptTokens,
      completionTokens: main.completionTokens + subagent.completionTokens,
      totalTokens: main.totalTokens + subagent.totalTokens,
      requestCount: main.requestCount + subagent.requestCount,
    };
    return { main, subagent, grand };
  }

  resetTokenUsage(): void {
    this.tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 };
  }

  getContextManager(): ContextManager {
    return this.contextManager;
  }

  getSubagentManager(): SubagentManager {
    return this.subagentManager;
  }
}
