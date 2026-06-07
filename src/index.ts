#!/usr/bin/env node
import { Command } from "commander";
import { ConfigManager } from "./config.js";
import { firstTimeSetup, interactiveConfig } from "./interactive-config.js";
import { Agent } from "./agent/agent.js";
import { Context } from "./agent/context.js";
import { createInterface } from "node:readline";

// Initialize config
const configManager = new ConfigManager();

const SESSION_FILE = ".sakura-code-session.json";

const program = new Command();

program
  .name("sakura-code")
  .description("Sakura Code - A cute AI coding agent with yandere personality ✨")
  .version("0.1.0");

// ─── Format token count ──────────────────────────────────────────────────────
function fmtTokens(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

// ─── Main command (REPL or single prompt) ────────────────────────────────────
program
  .argument("[prompt]", "Prompt to run")
  .option("-p, --print", "Non-interactive: run prompt and exit")
  .option("-c, --continue", "Continue the last session")
  .option("--provider <name>", "Use a specific provider")
  .option("--model <name>", "Use a specific model")
  .option("--setup", "Run first-time setup")
  .option("--no-color", "Disable colored output")
  .action(async (prompt: string | undefined, opts: {
    print?: boolean;
    continue?: boolean;
    provider?: string;
    model?: string;
    setup?: boolean;
  }) => {
    try {
      // Check if first-time setup is needed
      const provider = configManager.getProvider();
      if (opts.setup || !provider?.apiKey) {
        await firstTimeSetup(configManager);
        if (!prompt && !opts.print) {
          // Continue to REPL after setup
        } else {
          return;
        }
      }

      // Resolve API config
      const { apiKey, baseURL, model: defaultModel } = configManager.resolveForAgent();
      const model = opts.model ?? defaultModel;

      // Validate API key on startup
      const validation = await configManager.validateApiKey();
      if (!validation.valid) {
        console.error("\x1b[31m✗ API key validation failed: " + validation.error + "\x1b[0m");
        console.error("\x1b[90mRun 'sakura-code config' to fix your configuration\x1b[0m");
        process.exit(1);
      }
      console.log("\x1b[32m✓ Connected to " + configManager.get().defaultProvider + "\x1b[0m\n");

      const ctx = opts.continue ? Context.load(SESSION_FILE) : new Context();
      const agent = new Agent({ apiKey, baseURL, model });

      if (opts.print) {
        if (!prompt) throw new Error("Missing prompt: sakura-code -p <prompt>");
        await agent.run(ctx, prompt);
        ctx.save(SESSION_FILE);
        
        // Show token usage
        const usage = agent.getTokenUsage();
        if (usage.requestCount > 0) {
          console.log("\x1b[90m\n  ↑" + fmtTokens(usage.promptTokens) + " ↓" + fmtTokens(usage.completionTokens) + " | " + usage.requestCount + " requests\x1b[0m");
        }
        return;
      }

      // Interactive REPL mode
      let rl = createInterface({ input: process.stdin, output: process.stdout });
      
      const recreateReadline = () => {
        rl.close();
        rl = createInterface({ input: process.stdin, output: process.stdout });
      };
      
      const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

      console.log("🌸 Sakura Code — AI Coding Agent  (Ctrl+C or 'exit' to quit)\n");
      console.log("   Type /config for configuration\n");

      while (true) {
        const input = prompt ?? (await ask("\x1b[1;32m❯\x1b[0m "));
        prompt = undefined;

        if (!input.trim() || input.trim() === "exit") break;
        
        // Slash commands
        if (input.trim() === "/clear") {
          Object.assign(ctx, new Context());
          console.log("Context cleared.\n");
          continue;
        }
        if (input.trim() === "/save") {
          ctx.save(SESSION_FILE);
          console.log("Session saved.\n");
          continue;
        }
        if (input.trim() === "/config") {
          // Close readline before config
          rl.close();
          await interactiveConfig(configManager);
          // Reinitialize agent with new config
          const newConfig = configManager.resolveForAgent();
          Object.assign(agent, new Agent(newConfig));
          // Recreate readline
          recreateReadline();
          continue;
        }
        if (input.trim() === "/help") {
          console.log(`
\x1b[1mAvailable commands:\x1b[0m
  /config   — Configuration
  /clear    — Clear context
  /save     — Save session
  /help     — Show this help
  exit      — Exit
`);
          continue;
        }

        await agent.run(ctx, input);
        ctx.save(SESSION_FILE);
        
        // Show token usage
        const usage = agent.getTokenUsage();
        if (usage.requestCount > 0) {
          console.log("\x1b[90m  ↑" + fmtTokens(usage.promptTokens) + " ↓" + fmtTokens(usage.completionTokens) + " | " + usage.requestCount + " requests\x1b[0m\n");
        }
      }

      rl.close();
    } catch (err) {
      console.error("\x1b[31m✗ " + (err as Error).message + "\x1b[0m");
      process.exit(1);
    }
  });

// ─── Config command (standalone) ─────────────────────────────────────────────
program
  .command("config")
  .description("Open interactive configuration")
  .action(async () => {
    await interactiveConfig(configManager);
  });

// ─── Parse ───────────────────────────────────────────────────────────────────
program.parse(process.argv);
