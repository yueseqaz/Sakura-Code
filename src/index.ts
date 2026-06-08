#!/usr/bin/env node
import { Command } from "commander";
import { ConfigManager } from "./config.js";
import { firstTimeSetup, interactiveConfig } from "./interactive-config.js";
import { interactiveContext } from "./interactive-context.js";
import { Agent } from "./agent/agent.js";
import { Context } from "./agent/context.js";
import { cleanTempMemories } from "./tools/memory.js";

// Initialize config
const configManager = new ConfigManager();

// 启动时清除 temp 记忆
const cleanedTemp = cleanTempMemories();
if (cleanedTemp > 0) {
  console.log(`\x1b[90m🧹 Cleaned ${cleanedTemp} temp memories from last session\x1b[0m`);
}

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
        const { main, subagent, grand } = agent.getGrandTotalTokens();
        if (grand.requestCount > 0) {
          if (subagent.totalTokens > 0) {
            // 有子代理消耗时，展示分项
            console.log("\x1b[90m\n  Main: ↑" + fmtTokens(main.promptTokens) + " ↓" + fmtTokens(main.completionTokens) +
              " | Subagent: ↑" + fmtTokens(subagent.promptTokens) + " ↓" + fmtTokens(subagent.completionTokens) +
              " | Total: ↑" + fmtTokens(grand.promptTokens) + " ↓" + fmtTokens(grand.completionTokens) +
              " | " + grand.requestCount + " requests\x1b[0m");
          } else {
            console.log("\x1b[90m\n  ↑" + fmtTokens(grand.promptTokens) + " ↓" + fmtTokens(grand.completionTokens) + " | " + grand.requestCount + " requests\x1b[0m");
          }
        }
        return;
      }

      // Interactive REPL mode
      const HINT = "\x1b[90mEnter发送 | Option+Enter换行 | Ctrl+C退出\x1b[0m";
      
      const ask = (message: string): Promise<string> => {
        return new Promise((resolve) => {
          process.stdout.write(message + " ");
          
          let input = "";
          let hintShown = false;
          
          const showHint = () => {
            if (!hintShown && !input) {
              process.stdout.write(HINT);
              hintShown = true;
            }
          };
          
          const hideHint = () => {
            if (hintShown) {
              // Clear hint
              process.stdout.write("\r" + " ".repeat(50) + "\r");
              process.stdout.write(message + " " + input);
              hintShown = false;
            }
          };
          
          const cleanup = () => {
            process.stdin.removeListener("data", onData);
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(false);
            }
            process.stdin.pause();
          };
          
          const onData = (chunk: Buffer) => {
            const str = chunk.toString();
            
            for (let i = 0; i < str.length; i++) {
              const char = str[i];
              const code = str.charCodeAt(i);
              
              // Alt+Enter (Option+Enter on macOS) - newline
              // Alt sends ESC (0x1B) followed by the key
              if (code === 27 && i + 1 < str.length) {
                const nextChar = str[i + 1];
                const nextCode = str.charCodeAt(i + 1);
                if (nextChar === "\r" || nextChar === "\n") {
                  hideHint();
                  input += "\n";
                  process.stdout.write("\n" + message + " ");
                  i++; // Skip the next character
                  continue;
                }
              }
              
              // Enter (CR or LF) - send
              if (char === "\r" || char === "\n") {
                if (input.trim()) {
                  // Has content - send
                  cleanup();
                  process.stdout.write("\n");
                  resolve(input);
                  return;
                } else {
                  // Empty - don't send, show hint
                  hideHint();
                  showHint();
                  continue;
                }
              }
              
              // Ctrl+C - interrupt
              if (code === 3) {
                cleanup();
                process.stdout.write("\n");
                process.exit(0);
              }
              
              // Backspace (DEL or BS)
              if (code === 127 || code === 8) {
                if (input.length > 0) {
                  input = input.slice(0, -1);
                  hideHint();
                  // Handle newline in input
                  if (input.endsWith("\n")) {
                    process.stdout.write("\b \b"); // Remove the newline display
                  } else {
                    process.stdout.write("\b \b");
                  }
                }
                continue;
              }
              
              // Ctrl+U - clear line
              if (code === 21) {
                hideHint();
                process.stdout.write("\r" + " ".repeat(input.length + message.length + 2) + "\r");
                process.stdout.write(message + " ");
                input = "";
                showHint();
                continue;
              }
              
              // Regular printable character
              if (code >= 32) {
                hideHint();
                input += char;
                process.stdout.write(char);
              }
            }
          };
          
          // Set up stdin for raw input
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
          }
          process.stdin.resume();
          process.stdin.on("data", onData);
          
          // Show initial hint
          showHint();
        });
      };

      console.log("\x1b[36m🌸\x1b[0m \x1b[1mSakura Code\x1b[0m \x1b[90mv0.1.0\x1b[0m");
      console.log("\x1b[90m   Your cute AI coding companion~ ♡\x1b[0m\n");
      console.log("   Commands: /help /context /config /save /clear\n");

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
          await interactiveConfig(configManager);
          // Reinitialize agent with new config
          const newConfig = configManager.resolveForAgent();
          Object.assign(agent, new Agent(newConfig));
          continue;
        }
        if (input.trim() === "/help") {
          console.log(`
\x1b[1m🌸 Commands:\x1b[0m

  \x1b[36m/context\x1b[0m          — Context menu (view/set/clear)
  \x1b[36m/config\x1b[0m           — Configuration
  \x1b[36m/save\x1b[0m             — Save session
  \x1b[36m/clear\x1b[0m            — Clear context
  \x1b[36m/help\x1b[0m             — Show this help
  \x1b[36mexit\x1b[0m              — Exit
`);
          continue;
        }
        if (input.trim().startsWith("/context")) {
          const contextManager = agent.getContextManager();
          const parts = input.trim().split(/\s+/);
          
          // /context set <size> (quick set without menu)
          if (parts[1] === "set" && parts[2]) {
            const sizeStr = parts[2].toLowerCase();
            let maxTokens: number;
            
            if (sizeStr.endsWith("k")) {
              maxTokens = parseFloat(sizeStr) * 1000;
            } else if (sizeStr.endsWith("m")) {
              maxTokens = parseFloat(sizeStr) * 1000000;
            } else {
              maxTokens = parseInt(sizeStr);
            }
            
            if (isNaN(maxTokens) || maxTokens <= 0) {
              console.log("\x1b[31m✗ Invalid size. Use: /context set 128k\x1b[0m\n");
            } else {
              contextManager.setMaxTokens(maxTokens);
              console.log(`\x1b[32m✓ Context window set to ${sizeStr}\x1b[0m\n`);
            }
            continue;
          }
          
          // /context (交互式菜单)
          await interactiveContext(contextManager, ctx);
          continue;
        }

        await agent.run(ctx, input);
        ctx.save(SESSION_FILE);
        
        // Show token usage
        const { main, subagent, grand } = agent.getGrandTotalTokens();
        if (grand.requestCount > 0) {
          if (subagent.totalTokens > 0) {
            // 有子代理消耗时，展示分项
            console.log("\x1b[90m  Main: ↑" + fmtTokens(main.promptTokens) + " ↓" + fmtTokens(main.completionTokens) +
              " | Subagent: ↑" + fmtTokens(subagent.promptTokens) + " ↓" + fmtTokens(subagent.completionTokens) +
              " | Total: ↑" + fmtTokens(grand.promptTokens) + " ↓" + fmtTokens(grand.completionTokens) +
              " | " + grand.requestCount + " requests\x1b[0m\n");
          } else {
            console.log("\x1b[90m  ↑" + fmtTokens(grand.promptTokens) + " ↓" + fmtTokens(grand.completionTokens) + " | " + grand.requestCount + " requests\x1b[0m\n");
          }
        }
      }
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
