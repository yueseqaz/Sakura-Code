import prompts from "prompts";
import { Context } from "./agent/context.js";
import { ContextManager } from "./utils/context-manager.js";

export async function interactiveContext(
  contextManager: ContextManager,
  ctx: Context
): Promise<void> {
  let exit = false;

  while (!exit) {
    const status = await contextManager.getStatus(ctx.messages);
    const model = contextManager.getModel() || "unknown";
    const maxTokens = contextManager.getMaxTokens();

    const { action } = await prompts({
      type: "select",
      name: "action",
      message: `Context (${status.formatted})`,
      choices: [
        { title: "📊 View Usage", value: "view" },
        { title: "⚙️  Set Max Context", value: "set" },
        { title: "🧹 Clear Context", value: "clear" },
        { title: "🔙 Back", value: "exit" },
      ],
    });

    if (action === undefined || action === "exit") {
      exit = true;
      continue;
    }

    switch (action) {
      case "view":
        await viewUsage(contextManager, ctx);
        break;
      case "set":
        await setMaxContext(contextManager);
        break;
      case "clear":
        await clearContext(ctx);
        break;
    }
  }
}

async function viewUsage(contextManager: ContextManager, ctx: Context) {
  const status = await contextManager.getStatus(ctx.messages);
  const model = contextManager.getModel() || "unknown";
  const maxTokens = contextManager.getMaxTokens();

  console.log("\n┌─────────────────────────────────────┐");
  console.log("│         📊 Context Usage            │");
  console.log("├─────────────────────────────────────┤");
  console.log(`│  ${status.formatted}`);
  console.log(`│  Model: ${model}`);
  console.log(`│  Messages: ${ctx.messages.length}`);
  console.log(`│  Max: ${formatTokens(maxTokens)}`);
  console.log("└─────────────────────────────────────┘\n");

  await prompts({
    type: "confirm",
    name: "ok",
    message: "Press Enter to continue",
    initial: true,
  });
}

async function setMaxContext(contextManager: ContextManager) {
  const current = contextManager.getMaxTokens();

  const { preset } = await prompts({
    type: "select",
    name: "preset",
    message: "Select context window size",
    choices: [
      { title: `Current: ${formatTokens(current)}`, value: "current" },
      { title: "16k (GPT-3.5)", value: "16k" },
      { title: "32k", value: "32k" },
      { title: "64k", value: "64k" },
      { title: "128k (GPT-4o/DeepSeek)", value: "128k" },
      { title: "200k (Claude)", value: "200k" },
      { title: "1M (Gemini)", value: "1m" },
      { title: "Custom", value: "custom" },
    ],
  });

  if (preset === undefined || preset === "current") {
    return;
  }

  if (preset === "custom") {
    const { customSize } = await prompts({
      type: "text",
      name: "customSize",
      message: "Enter custom size (e.g., 256k, 1m, 256000)",
      validate: (v) => {
        const num = parseSize(v);
        return num > 0 ? true : "Invalid size format";
      },
    });

    if (customSize) {
      const maxTokens = parseSize(customSize);
      contextManager.setMaxTokens(maxTokens);
      console.log(`\n✓ Context window set to ${formatTokens(maxTokens)}\n`);
    }
  } else {
    const maxTokens = parseSize(preset);
    contextManager.setMaxTokens(maxTokens);
    console.log(`\n✓ Context window set to ${formatTokens(maxTokens)}\n`);
  }
}

async function clearContext(ctx: Context) {
  const { confirm } = await prompts({
    type: "confirm",
    name: "confirm",
    message: "Clear all context? This will reset the conversation.",
    initial: false,
  });

  if (confirm) {
    Object.assign(ctx, new (ctx.constructor as any)());
    console.log("\n✓ Context cleared\n");
  }
}

function parseSize(str: string): number {
  str = str.toLowerCase().trim();
  if (str.endsWith("k")) return parseFloat(str) * 1000;
  if (str.endsWith("m")) return parseFloat(str) * 1000000;
  return parseInt(str) || 0;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(0) + "M";
  if (n >= 1000) return (n / 1000).toFixed(0) + "k";
  return String(n);
}
