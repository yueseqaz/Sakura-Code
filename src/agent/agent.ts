import OpenAI from "openai";
import type { Context } from "./context.js";
import { Registry } from "../tools/registry.js";
import { logger } from "../utils/logger.js";
import type { AgentConfig, ChatMsg } from "../types.js";

const MAX_ITERATIONS = 50; // safety ceiling

export class Agent {
  private client: OpenAI;
  private model: string;
  private registry: Registry;
  private maxIterations: number;

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

    // Load any MCP servers
    if (config.mcpServers?.length) {
      Promise.all(config.mcpServers.map((s) => this.registry.loadMCP(s)));
    }
  }

  /**
   * Main Agent Loop with Streaming
   *
   * Claude Code-style workflow:
   *   1. User message → LLM (streaming)
   *   2. LLM responds with text and/or tool_calls
   *   3. Execute tool_calls in parallel
   *   4. Feed tool results back to LLM
   *   5. Repeat until LLM stops calling tools
   *   6. Return final text response
   */
  async run(ctx: Context, userInput: string): Promise<void> {
    ctx.push({ role: "user", content: userInput });

    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      // ── Call LLM with Streaming ──────────────────────────────────────────
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: ctx.messages,
        tools: this.registry.schemas(),
        tool_choice: "auto",
        parallel_tool_calls: true,
        stream: true,
      });

      // Accumulate streaming response
      let content = "";
      const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
      let hasContent = false;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Handle text content (stream to terminal)
        if (delta.content) {
          if (!hasContent) {
            hasContent = true;
            process.stdout.write("\n");
          }
          content += delta.content;
          process.stdout.write(delta.content);
        }

        // Handle tool calls (accumulate)
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

      if (hasContent) {
        process.stdout.write("\n");
      }

      // Build assistant message
      const assistantMsg: ChatMsg = {
        role: "assistant",
        content: content || null,
      };

      // Add tool calls if any
      if (toolCalls.size > 0) {
        (assistantMsg as any).tool_calls = Array.from(toolCalls.entries()).map(([_, tc]) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        }));
      }

      ctx.push(assistantMsg);

      // ── No tool calls → done ──────────────────────────────────────────────
      if (toolCalls.size === 0) break;

      // ── Execute tools (in parallel) ───────────────────────────────────────
      const toolResults = await this.executeTools(
        Array.from(toolCalls.entries()).map(([_, tc]) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }))
      );
      ctx.push(...toolResults);
    }

    if (iterations >= this.maxIterations) {
      logger.error(`Reached max iterations (${this.maxIterations}). Stopping.`);
    }
  }

  // ─── Tool Dispatch ─────────────────────────────────────────────────────────
  private async executeTools(
    toolCalls: { id: string; type: "function"; function: { name: string; arguments: string } }[]
  ): Promise<ChatMsg[]> {
    // Execute all tool calls in parallel
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

  // ─── Registry Access (for external inspection / testing) ───────────────────
  getRegistry(): Registry {
    return this.registry;
  }
}
