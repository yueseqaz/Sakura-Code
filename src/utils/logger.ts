const USE_COLOR = process.env.NO_COLOR === undefined;

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

function colorize(text: string, ...codes: string[]): string {
  if (!USE_COLOR) return text;
  return codes.join("") + text + c.reset;
}

export const logger = {
  user(content: string) {
    console.log(colorize("❯ user", c.bold, c.green) + "  " + content);
  },
  assistant(content: string) {
    console.log(colorize("◆ assistant", c.bold, c.cyan) + "\n" + content + "\n");
  },
  toolCall(name: string, args: string) {
    const short = args.length > 120 ? args.slice(0, 120) + "…" : args;
    console.log(colorize(`⚙ ${name}`, c.bold, c.magenta) + colorize(`(${short})`, c.dim));
  },
  toolResult(content: string) {
    const lines = content.split("\n").length;
    const chars = content.length;
    console.log(colorize(`  → ${lines} lines, ${chars} chars`, c.gray) + "\n");
  },
  error(msg: string) {
    console.error(colorize("✗ error: " + msg, c.red));
  },
  info(msg: string) {
    console.log(colorize("ℹ " + msg, c.blue));
  },
};
