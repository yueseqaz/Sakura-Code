#!/usr/bin/env node
import { Command } from "commander";
import { createInterface, emitKeypressEvents } from "node:readline";
import { ConfigManager } from "./config.js";
import { firstTimeSetup, interactiveConfig } from "./interactive-config.js";
import { interactiveContext } from "./interactive-context.js";
import { Agent } from "./agent/agent.js";
import { Context } from "./agent/context.js";
import { GoalRunner, printGoalResult } from "./agent/goal-runner.js";
import { cleanTempMemories } from "./tools/memory.js";
import { logger } from "./utils/logger.js";
import prompts from "prompts";

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
  .option("-g, --goal <spec>", "Goal mode: run spec autonomously and exit")
  .option("-c, --continue", "Continue the last session")
  .option("--provider <name>", "Use a specific provider")
  .option("--model <name>", "Use a specific model")
  .option("--setup", "Run first-time setup")
  .option("--no-color", "Disable colored output")
  .option("--max-iterations <n>", "Max iterations for goal mode (default: 50)")
  .option("--timeout <ms>", "Timeout for goal mode in ms (default: 600000)")
  .action(async (prompt: string | undefined, opts: {
    print?: boolean;
    goal?: string;
    continue?: boolean;
    provider?: string;
    model?: string;
    setup?: boolean;
    maxIterations?: string;
    timeout?: string;
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
      let { apiKey, baseURL, model: defaultModel } = configManager.resolveForAgent();
      let model = opts.model ?? defaultModel;

      // Validate API key on startup — guide user to reconfigure on failure
      let validation = await configManager.validateApiKey();
      while (!validation.valid) {
        console.warn("\x1b[33m⚠ API validation failed: " + validation.error + "\x1b[0m\n");
        const { reconfigure } = await prompts({
          type: "confirm",
          name: "reconfigure",
          message: "Do you want to reconfigure now?",
          initial: true,
        });
        if (reconfigure) {
          await interactiveConfig(configManager);
          // Re-resolve config after reconfiguration
          const resolved = configManager.resolveForAgent();
          apiKey = resolved.apiKey;
          baseURL = resolved.baseURL;
          model = opts.model ?? resolved.model;
          validation = await configManager.validateApiKey();
        } else {
          console.warn("\x1b[90m  Continuing with current config — errors may occur.\x1b[0m\n");
          break;
        }
      }
      if (validation.valid) {
        console.log("\x1b[32m✓ Connected to " + configManager.get().defaultProvider + "\x1b[0m\n");
      }

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

      // Goal mode - autonomous execution
      if (opts.goal) {
        const goalRunner = new GoalRunner(agent, ctx, {
          maxIterations: opts.maxIterations ? parseInt(opts.maxIterations) : undefined,
          timeout: opts.timeout ? parseInt(opts.timeout) : undefined,
        });
        
        const result = await goalRunner.run(opts.goal);
        ctx.save(SESSION_FILE);
        printGoalResult(result);
        process.exit(result.success ? 0 : 1);
      }

      // Interactive REPL mode
      const PROMPT_STR = "\x1b[1;32m❯\x1b[0m ";
      const HINT = "Enter发送 | ESC清空 | 历史↑↓ | Ctrl+C退出";
      const HIDDEN = "\x1b[90m" + HINT + "\x1b[0m";

      // Set up readline with history (terminal: false — we handle raw input ourselves)
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        historySize: 1000,
        removeHistoryDuplicates: true,
        terminal: false,
      }) as ReturnType<typeof createInterface> & { history: string[] };

      // Enable keypress events for custom Enter handling
      emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }

      let inputBuffer = "";
      let cursorPos = 0;
      let contextSuffix = ""; // e.g. " | Context: 15.2k/128k (11.9%)"

      // Format context usage from context manager
      const updateContextStatus = async () => {
        try {
          const cm = agent.getContextManager();
          const status = await cm.getStatus(ctx.messages);
          const fmt = (n: number) => n >= 1000000 ? (n / 1000000).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
          contextSuffix = `\x1b[90m | Context: ${fmt(status.tokenCount)}/${fmt(status.maxTokens)} (${(status.usage * 100).toFixed(1)}%)\x1b[0m`;
        } catch {
          contextSuffix = "";
        }
      };

      // Build the hint placeholder (hint + context, all one line)
      const getHint = () => HIDDEN + contextSuffix;

      // Render the current input line with prompt
      const renderLine = () => {
        process.stdout.write("\r\x1b[2K");
        process.stdout.write(PROMPT_STR);
        if (inputBuffer) {
          // User is typing — show input, cursor at end
          process.stdout.write(inputBuffer);
        } else {
          // Empty — show hint placeholder, cursor at prompt position
          process.stdout.write(getHint());
          process.stdout.write("\r" + PROMPT_STR);
        }
      };

      // ask() returns a promise that resolves when user submits non-empty input
      const ask = (): Promise<string> => {
        return new Promise((resolve) => {
          inputBuffer = "";
          cursorPos = 0;
          renderLine();

          const onKeypress = (_str: string, key: { name: string; ctrl: boolean; meta: boolean; shift: boolean; sequence: string } | undefined) => {
            if (!key) return;

            // Ctrl+C → exit
            if (key.ctrl && key.name === "c") {
              process.stdout.write("\n");
              process.stdin.removeListener("keypress", onKeypress);
              ctx.save(SESSION_FILE);
              process.exit(0);
            }

            // Ctrl+U → clear line
            if (key.ctrl && key.name === "u") {
              inputBuffer = "";
              cursorPos = 0;
              renderLine();
              return;
            }

            // Backspace
            if (key.name === "backspace") {
              if (cursorPos > 0) {
                inputBuffer = inputBuffer.slice(0, cursorPos - 1) + inputBuffer.slice(cursorPos);
                cursorPos--;
                renderLine();
              }
              return;
            }

            // Delete
            if (key.name === "delete") {
              if (cursorPos < inputBuffer.length) {
                inputBuffer = inputBuffer.slice(0, cursorPos) + inputBuffer.slice(cursorPos + 1);
                renderLine();
              }
              return;
            }

            // Left arrow
            if (key.name === "left") {
              if (cursorPos > 0) {
                cursorPos--;
                process.stdout.write("\x1b[D");
              }
              return;
            }

            // Right arrow
            if (key.name === "right") {
              if (cursorPos < inputBuffer.length) {
                cursorPos++;
                process.stdout.write("\x1b[C");
              }
              return;
            }

            // Home
            if (key.name === "home") {
              cursorPos = 0;
              process.stdout.write("\r" + PROMPT_STR);
              return;
            }

            // End
            if (key.name === "end") {
              cursorPos = inputBuffer.length;
              renderLine();
              return;
            }

            // ESC → clear input
            if (key.name === "escape") {
              inputBuffer = "";
              cursorPos = 0;
              renderLine();
              return;
            }

            // Enter → submit
            if (key.name === "return" || key.name === "enter") {
              if (inputBuffer.trim()) {
                // Submit: print input + newline
                process.stdout.write("\r\x1b[2K" + PROMPT_STR + inputBuffer + "\n");
                process.stdin.removeListener("keypress", onKeypress);
                rl.history.unshift(inputBuffer);
                resolve(inputBuffer);
              }
              // Empty input → do nothing
              return;
            }

            // Up/Down arrow → readline history navigation
            if (key.name === "up" || key.name === "down") {
              // Handled by readline in non-raw mode, but we're in raw mode
              // so we need to handle it manually
              const direction = key.name === "up" ? -1 : 1;
              // Find current position in history
              const histIdx = rl.history.indexOf(inputBuffer);
              let newIdx: number;
              if (histIdx === -1) {
                newIdx = direction === -1 ? 0 : -1;
              } else {
                newIdx = histIdx + direction;
              }
              if (newIdx >= 0 && newIdx < rl.history.length) {
                inputBuffer = rl.history[newIdx];
                cursorPos = inputBuffer.length;
              } else if (newIdx < 0) {
                inputBuffer = "";
                cursorPos = 0;
              }
              renderLine();
              return;
            }

            // Printable character
            if (key.sequence && !key.ctrl && !key.meta && key.sequence.length === 1 && key.sequence.charCodeAt(0) >= 32) {
              inputBuffer = inputBuffer.slice(0, cursorPos) + key.sequence + inputBuffer.slice(cursorPos);
              cursorPos++;
              renderLine();
            }
          };

          process.stdin.on("keypress", onKeypress);
        });
      };

      console.log("\x1b[36m🌸\x1b[0m \x1b[1mSakura Code\x1b[0m \x1b[90mv0.1.0\x1b[0m");
      console.log("\x1b[90m   Your cute AI coding companion~ ♡\x1b[0m\n");
      console.log("   Commands: /help /context /config /save /clear /compact\n");

      while (true) {
        let input: string;
        if (prompt) {
          input = prompt;
          prompt = undefined;
        } else {
          input = await ask();
        }

        if (input.trim() === "exit") break;

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

  \x1b[36m/goal <spec>\x1b[0m       — Run goal autonomously
  \x1b[36m/context\x1b[0m          — Context menu (view/set/clear)
  \x1b[36m/config\x1b[0m           — Configuration
  \x1b[36m/save\x1b[0m             — Save session
  \x1b[36m/clear\x1b[0m            — Clear context
  \x1b[36m/compact\x1b[0m          — Compress context manually
  \x1b[36m/help\x1b[0m             — Show this help
  \x1b[36mexit\x1b[0m              — Exit
`);
          continue;
        }
        if (input.trim() === "/compact") {
          const contextManager = agent.getContextManager();
          const { messages, compressed, level } = await contextManager.compress(ctx.messages);
          if (compressed) {
            ctx.messages = messages;
            ctx.save(SESSION_FILE);
            logger.info(`Context compressed (level ${level})~`);
          } else {
            logger.info("Context is fine, no compression needed~");
          }
          continue;
        }
        if (input.trim().startsWith("/goal ")) {
          const goal = input.trim().slice(6).trim();
          if (!goal) {
            console.log("\x1b[31m✗ Missing goal spec: /goal <spec>\x1b[0m\n");
            continue;
          }

          const goalRunner = new GoalRunner(agent, ctx);
          const result = await goalRunner.run(goal);
          ctx.save(SESSION_FILE);
          printGoalResult(result);
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
        await updateContextStatus();

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

      // Clean exit: restore terminal state
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
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
