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

// Yandere thinking messages ✨
const THINKING_MESSAGES = [
  "Thinking for you~ ♡",
  "Let me think about the best approach...",
  "Cherry blossoms falling... thinking ✨",
  "I'll do my best for you~",
  "Just a moment~ ♡",
  "Working hard for you~",
];

const WORKING_MESSAGES = [
  "Working hard... ♡",
  "Almost there~ wait a moment",
  "I'll do anything for you!",
  "Processing... please wait for me~",
];

let loadingInterval: NodeJS.Timeout | null = null;
let loadingDelayTimer: NodeJS.Timeout | null = null;
let loadingIndex = 0;
let isLoading = false;

const LOADING_DELAY = 300; // ms before showing loading animation

function getRandomMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
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
  
  // ✨ New: Thinking/Working status with delay
  thinking() {
    this.cancelLoading();
    
    loadingDelayTimer = setTimeout(() => {
      isLoading = true;
      const msg = getRandomMessage(THINKING_MESSAGES);
      const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
      loadingIndex = 0;
      
      process.stdout.write("\n");
      loadingInterval = setInterval(() => {
        const frame = frames[loadingIndex % frames.length];
        process.stdout.write(`\r${colorize(frame, c.cyan)} ${colorize(msg, c.dim)}`);
        loadingIndex++;
      }, 80);
    }, LOADING_DELAY);
  },
  
  working() {
    // Stop any existing animation first
    this.stopLoading();
    
    // Working shows immediately (no delay) - user already knows tools are being called
    isLoading = true;
    const msg = getRandomMessage(WORKING_MESSAGES);
    const dots = ["", ".", "..", "..."];
    loadingIndex = 0;
    
    // Add newline to ensure we're on a fresh line
    process.stdout.write("\n");
    
    loadingInterval = setInterval(() => {
      const dot = dots[loadingIndex % dots.length];
      process.stdout.write(`\r${colorize("⚙", c.magenta)} ${colorize(msg + dot, c.dim)}`);
      loadingIndex++;
    }, 400);
  },
  
  stopLoading() {
    // Cancel pending delay timer
    if (loadingDelayTimer) {
      clearTimeout(loadingDelayTimer);
      loadingDelayTimer = null;
    }
    
    // Stop animation if it was shown
    if (loadingInterval) {
      clearInterval(loadingInterval);
      loadingInterval = null;
      if (isLoading) {
        process.stdout.write("\r" + " ".repeat(60) + "\r");
      }
      isLoading = false;
    }
  },
  
  cancelLoading() {
    this.stopLoading();
  },
};
