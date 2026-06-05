#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Agent } from "./agent/agent.js";
import { Context } from "./agent/context.js";
import { createInterface } from "node:readline";

const SESSION_FILE = ".sakura-code-session.json";

await new Command()
  .name("sakura-code")
  .description("Sakura Code - A Claude Code-style AI coding agent")
  .version("0.1.0")
  .argument("[prompt]", "Prompt to run")
  .option("-p, --print", "Non-interactive: run prompt and exit")
  .option("-c, --continue", "Continue the last session")
  .option("--no-color", "Disable colored output")
  .action(async (prompt: string | undefined, opts: { print?: boolean; continue?: boolean }) => {
    const ctx = opts.continue ? Context.load(SESSION_FILE) : new Context();
    const agent = new Agent();

    if (opts.print) {
      if (!prompt) throw new Error("Missing prompt: sakura-code -p <prompt>");
      await agent.run(ctx, prompt);
      ctx.save(SESSION_FILE);
      return;
    }

    // Interactive REPL mode
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

    console.log("Sakura Code — AI Coding Agent  (Ctrl+C or 'exit' to quit)\n");

    while (true) {
      const input = prompt ?? (await ask("\x1b[1;32m❯\x1b[0m "));
      prompt = undefined; // only use CLI prompt once

      if (!input.trim() || input.trim() === "exit") break;
      if (input.trim() === "/clear") { Object.assign(ctx, new Context()); console.log("Context cleared.\n"); continue; }
      if (input.trim() === "/save") { ctx.save(SESSION_FILE); console.log("Session saved.\n"); continue; }

      await agent.run(ctx, input);
      ctx.save(SESSION_FILE);
    }

    rl.close();
  })
  .parseAsync(process.argv);
