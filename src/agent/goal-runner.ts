import { Agent } from "./agent.js";
import { Context } from "./context.js";
import { logger } from "../utils/logger.js";

export interface GoalConfig {
  maxIterations?: number;
  timeout?: number;  // ms
  verbose?: boolean;
}

export class GoalRunner {
  private agent: Agent;
  private ctx: Context;
  private config: GoalConfig;
  private startTime: number = 0;
  private aborted: boolean = false;

  constructor(agent: Agent, ctx: Context, config: GoalConfig = {}) {
    this.agent = agent;
    this.ctx = ctx;
    this.config = {
      maxIterations: config.maxIterations ?? 50,
      timeout: config.timeout ?? 600_000,  // 10 minutes default
      verbose: config.verbose ?? false,
    };
  }

  async run(goal: string): Promise<GoalResult> {
    this.startTime = Date.now();
    this.aborted = false;

    // Handle Ctrl+C
    const onSigint = () => {
      this.aborted = true;
      logger.info("\n⚠️  Goal interrupted by user");
    };
    process.on("SIGINT", onSigint);

    try {
      // Show goal start
      console.log(`\n🎯 Goal: ${goal}\n`);
      console.log("━".repeat(50));

      // Run the agent with Goal: prefix
      await this.agent.run(this.ctx, `Goal: ${goal}`);

      // Check if timed out
      const elapsed = Date.now() - this.startTime;
      if (elapsed >= this.config.timeout!) {
        return {
          success: false,
          error: "Timeout exceeded",
          elapsed,
          iterations: this.agent.getGrandTotalTokens().grand.requestCount,
        };
      }

      // Check if aborted
      if (this.aborted) {
        return {
          success: false,
          error: "Interrupted by user",
          elapsed,
          iterations: this.agent.getGrandTotalTokens().grand.requestCount,
        };
      }

      // Success
      const { grand } = this.agent.getGrandTotalTokens();
      return {
        success: true,
        elapsed,
        iterations: grand.requestCount,
        tokens: {
          prompt: grand.promptTokens,
          completion: grand.completionTokens,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
        elapsed: Date.now() - this.startTime,
        iterations: this.agent.getGrandTotalTokens().grand.requestCount,
      };
    } finally {
      process.removeListener("SIGINT", onSigint);
    }
  }

  abort() {
    this.aborted = true;
  }
}

export interface GoalResult {
  success: boolean;
  error?: string;
  elapsed: number;
  iterations: number;
  tokens?: {
    prompt: number;
    completion: number;
  };
}

// ─── Format elapsed time ─────────────────────────────────────────────────────
function fmtElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

// ─── Format token count ──────────────────────────────────────────────────────
function fmtTokens(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

// ─── Print goal result ───────────────────────────────────────────────────────
export function printGoalResult(result: GoalResult) {
  console.log("\n" + "━".repeat(50));
  
  if (result.success) {
    console.log("\n✅ \x1b[32mGoal completed!\x1b[0m\n");
  } else {
    console.log(`\n❌ \x1b[31mGoal failed: ${result.error}\x1b[0m\n`);
  }

  console.log(`  ⏱  Time: ${fmtElapsed(result.elapsed)}`);
  console.log(`  🔄 Iterations: ${result.iterations}`);
  
  if (result.tokens) {
    console.log(`  📊 Tokens: ↑${fmtTokens(result.tokens.prompt)} ↓${fmtTokens(result.tokens.completion)}`);
  }
  
  console.log("");
}
