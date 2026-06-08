import * as readline from "readline";

// ─── Dangerous patterns ──────────────────────────────────────────────────────
const DANGEROUS_BASH_PATTERNS = [
  /\brm\s+(-rf?|--recursive)\b/i,  // rm -rf
  /\bmkfs\b/i,                      // format disk
  /\bdd\b.*\bof=/i,                 // dd to device
  />\s*\/dev\/sd[a-z]/i,            // write to disk
  /\bchmod\s+777\b/i,               // chmod 777
  /\bchown\s+root\b/i,              // chown root
  /\bkill\s+-9\b/i,                 // kill -9
  /\bpkill\b/i,                     // pkill
  /\bsudo\b/i,                      // sudo
  /\bsu\s+-\b/i,                    // su -
];

const DANGEROUS_GIT_ACTIONS = [
  "push --force",
  "push -f",
  "branch -d",
  "branch -D",
  "tag -d",
  "reset --hard",
  "clean -f",
  "checkout --force",
];

// ─── Confirmation function ────────────────────────────────────────────────────
export async function confirmAction(
  action: string,
  details?: string
): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log("\n⚠️  危险操作检测");
    console.log(`   操作: ${action}`);
    if (details) {
      console.log(`   详情: ${details}`);
    }
    console.log("");

    rl.question("   确认执行？(y/N): ", (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// ─── Check if bash command is dangerous ───────────────────────────────────────
export function isDangerousBashCommand(command: string): boolean {
  return DANGEROUS_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

// ─── Check if git action is dangerous ────────────────────────────────────────
export function isDangerousGitAction(action: string, args: Record<string, unknown>): boolean {
  const actionLower = action.toLowerCase();
  
  // Check for force push
  if (action === "push" && args.force === true) {
    return true;
  }
  
  // Check for delete actions
  if (action === "branch" && args.action === "delete") {
    return true;
  }
  
  if (action === "tag" && args.action === "delete") {
    return true;
  }
  
  // Check for clean with force
  if (action === "clean" && args.force === true) {
    return true;
  }
  
  // Check for worktree remove with force
  if (action === "worktree" && args.action === "remove" && args.force === true) {
    return true;
  }
  
  return false;
}

// ─── Get danger description ──────────────────────────────────────────────────
export function getDangerDescription(action: string, args: Record<string, unknown>): string {
  if (action === "push" && args.force === true) {
    return `git push --force 到 ${args.remote || "origin"}/${args.branch || "当前分支"}`;
  }
  
  if (action === "branch" && args.action === "delete") {
    return `删除分支: ${args.name}`;
  }
  
  if (action === "tag" && args.action === "delete") {
    return `删除标签: ${args.name}`;
  }
  
  if (action === "clean" && args.force === true) {
    return "删除所有未跟踪的文件";
  }
  
  if (action === "worktree" && args.action === "remove" && args.force === true) {
    return `强制删除 worktree: ${args.worktree_path}`;
  }
  
  return action;
}
