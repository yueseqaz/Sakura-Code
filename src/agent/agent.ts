import OpenAI from "openai";
import type { Context } from "./context.js";
import { Registry } from "../tools/registry.js";
import { logger } from "../utils/logger.js";
import { ContextManager } from "../utils/context-manager.js";
import type { AgentConfig, ChatMsg } from "../types.js";

const MAX_ITERATIONS = 50;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

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

    // 初始化 context manager
    this.contextManager = new ContextManager({
      maxTokens: config.contextWindow,
      model: model,
      provider: config.provider,
    });

    // Load MCP servers
    if (config.mcpServers?.length) {
      Promise.all(config.mcpServers.map((s) => this.registry.loadMCP(s)));
    }

    // Setup Ctrl+C handler
    this.setupSignalHandlers();
  }

  // ─── Signal Handlers (Ctrl+C) ──────────────────────────────────────────────
  private setupSignalHandlers(): void {
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
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError || new Error(`${label} failed after ${MAX_RETRIES + 1} attempts`);
  }

  // ─── Main Agent Loop ──────────────────────────────────────────────────────
  async run(ctx: Context, userInput: string): Promise<void> {
    // 匹配并加载 Skill
    ctx.matchAndLoadSkill(userInput);
    
    ctx.push({ role: "user", content: userInput });
    this.aborted = false;

    let iterations = 0;

    while (iterations < this.maxIterations && !this.aborted) {
      iterations++;

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
              process.stdout.write("\n");
            }
            content += delta.content;
            process.stdout.write(delta.content);
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
        process.stdout.write("\n");
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
        (assistantMsg as any).tool_calls = Array.from(toolCalls.entries()).map(([_, tc]) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        }));
      }

      ctx.push(assistantMsg);

      // No tool calls → done
      if (toolCalls.size === 0) break;

      // Execute tools
      logger.working();
      const toolResults = await this.executeTools(
        Array.from(toolCalls.entries()).map(([_, tc]) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }))
      );
      ctx.push(...toolResults);
    }

    logger.stopLoading();

    if (iterations >= this.maxIterations) {
      logger.error(`Reached max iterations (${this.maxIterations}). Stopping.`);
    }
  }

  // ─── Tool Dispatch ─────────────────────────────────────────────────────────
  private async executeTools(
    toolCalls: { id: string; type: "function"; function: { name: string; arguments: string } }[]
  ): Promise<ChatMsg[]> {
    const results = await Promise.all(
      toolCalls.map(async (call): Promise<ChatMsg> => {
        const { name, arguments: argsJson } = call.function;
        logger.toolCall(name, argsJson);

        let content: string;
        try {
          const args = JSON.parse(argsJson || "{}");
          content = await this.registry.call(name, args);
        } catch (err) {
          content = `Error: ${(err as Error).message}`;
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

  resetTokenUsage(): void {
    this.tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 };
  }

  getContextManager(): ContextManager {
    return this.contextManager;
  }
}
