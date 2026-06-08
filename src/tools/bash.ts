import { spawnSync } from "node:child_process";
import { assertSafeCommand, truncate } from "../utils/security.js";
import { isDangerousBashCommand, confirmAction } from "../utils/confirm.js";
import type { ToolHandler, ToolDef, BashArgs } from "../types.js";

export const bashTool: ToolHandler = {
  name: "bash",
  schema: {
    type: "function",
    function: {
      name: "bash",
      description:
        "Run a bash command. Returns stdout, stderr, and exit code. " +
        "Use for building, testing, installing packages, and system operations. " +
        "Prefer file-specific tools (read_file, edit_file) for file operations.",
      parameters: {
        type: "object",
        required: ["command"],
        properties: {
          command: {
            type: "string",
            description: "Bash command to execute. Supports pipes, redirects, multi-line.",
          },
          timeout_ms: {
            type: "number",
            description: "Timeout in milliseconds (default: 60000)",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { command, timeout_ms = 60_000 } = args as unknown as BashArgs;
    assertSafeCommand(command);

    // Check for dangerous commands
    if (isDangerousBashCommand(command)) {
      const confirmed = await confirmAction("执行危险命令", command);
      if (!confirmed) {
        return "❌ 操作已取消";
      }
    }

    const result = spawnSync("bash", ["-lc", command], {
      encoding: "utf8",
      timeout: timeout_ms,
      cwd: process.cwd(),
      env: { ...process.env },
    });

    const parts: string[] = [];
    if (result.stdout?.trim()) parts.push(result.stdout.trim());
    if (result.stderr?.trim()) parts.push(`[stderr]\n${result.stderr.trim()}`);

    const status =
      result.status !== null ? result.status : `signal:${result.signal}`;
    parts.push(`[exit ${status}]`);

    return truncate(parts.join("\n"));
  },
};
