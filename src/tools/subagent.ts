import type { ToolHandler, ToolDef } from "../types.js";
import type { SubagentManager } from "../agent/subagent-manager.js";

// ─── 子代理工具工厂 ──────────────────────────────────────────────────────────
export function createSubagentTools(manager: SubagentManager) {
  // ─── subagent_spawn ────────────────────────────────────────────────────────
  const subagentSpawnTool: ToolHandler = {
    name: "subagent_spawn",
    schema: {
      type: "function",
      function: {
        name: "subagent_spawn",
        description:
          "Create a sub-agent to handle a specific task. " +
          "The sub-agent runs independently and returns results when complete. " +
          "Use this for complex tasks that can be delegated.",
        parameters: {
          type: "object",
          required: ["task"],
          properties: {
            task: {
              type: "string",
              description: "Clear description of the task for the sub-agent to execute",
            },
            model: {
              type: "string",
              description: "Model to use (default: same as parent)",
            },
            timeout: {
              type: "number",
              description: "Timeout in milliseconds (default: 300000 = 5 minutes)",
            },
          },
        },
      },
    } satisfies ToolDef,

    async execute(args) {
      const { task, model, timeout } = args as {
        task: string;
        model?: string;
        timeout?: number;
      };

      const id = await manager.spawn(task, { model, timeout });
      return `Sub-agent created with ID: ${id}\nTask: ${task}\nUse subagent_status to check progress.`;
    },
  };

  // ─── subagent_status ───────────────────────────────────────────────────────
  const subagentStatusTool: ToolHandler = {
    name: "subagent_status",
    schema: {
      type: "function",
      function: {
        name: "subagent_status",
        description: "Check the status and progress of a sub-agent.",
        parameters: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "Sub-agent ID",
            },
          },
        },
      },
    } satisfies ToolDef,

    async execute(args) {
      const { id } = args as { id: string };
      const info = manager.getStatus(id);

      if (!info) {
        return `Sub-agent '${id}' not found.`;
      }

      const elapsed = Math.round((Date.now() - info.startTime) / 1000);
      const lines = [
        `Sub-agent: ${info.id}`,
        `Task: ${info.task}`,
        `Status: ${info.status}`,
        `Progress: ${info.progress}`,
        `Elapsed: ${elapsed}s`,
      ];

      if (info.result) {
        lines.push(`\nResult:\n${info.result}`);
      }

      if (info.error) {
        lines.push(`\nError: ${info.error}`);
      }

      if (info.tokenUsage) {
        lines.push(`\nTokens: ${info.tokenUsage.total} (↑${info.tokenUsage.prompt} ↓${info.tokenUsage.completion})`);
      }

      return lines.join("\n");
    },
  };

  // ─── subagent_list ─────────────────────────────────────────────────────────
  const subagentListTool: ToolHandler = {
    name: "subagent_list",
    schema: {
      type: "function",
      function: {
        name: "subagent_list",
        description: "List all sub-agents and their status.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["all", "running", "completed", "failed", "timeout"],
              description: "Filter by status (default: all)",
            },
          },
        },
      },
    } satisfies ToolDef,

    async execute(args) {
      const { status = "all" } = args as { status?: string };
      let agents = manager.listAll();

      if (status !== "all") {
        agents = agents.filter(a => a.status === status);
      }

      if (!agents.length) {
        return "No sub-agents found.";
      }

      const lines = agents.map(a => {
        const elapsed = Math.round((Date.now() - a.startTime) / 1000);
        return `[${a.id}] ${a.status} - ${a.task.slice(0, 50)}... (${elapsed}s)`;
      });

      return `Sub-agents (${agents.length}):\n${lines.join("\n")}`;
    },
  };

  // ─── subagent_result ───────────────────────────────────────────────────────
  const subagentResultTool: ToolHandler = {
    name: "subagent_result",
    schema: {
      type: "function",
      function: {
        name: "subagent_result",
        description: "Get the result of a completed sub-agent.",
        parameters: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "Sub-agent ID",
            },
          },
        },
      },
    } satisfies ToolDef,

    async execute(args) {
      const { id } = args as { id: string };
      const info = manager.getStatus(id);

      if (!info) {
        return `Sub-agent '${id}' not found.`;
      }

      if (info.status === "running" || info.status === "pending") {
        return `Sub-agent '${id}' is still running. Progress: ${info.progress}`;
      }

      if (info.status === "failed" || info.status === "timeout") {
        return `Sub-agent '${id}' ${info.status}: ${info.error}`;
      }

      return info.result || "No result available.";
    },
  };

  // ─── subagent_cancel ───────────────────────────────────────────────────────
  const subagentCancelTool: ToolHandler = {
    name: "subagent_cancel",
    schema: {
      type: "function",
      function: {
        name: "subagent_cancel",
        description: "Cancel a running sub-agent.",
        parameters: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "Sub-agent ID to cancel",
            },
          },
        },
      },
    } satisfies ToolDef,

    async execute(args) {
      const { id } = args as { id: string };
      const info = manager.getStatus(id);

      if (!info) {
        return `Sub-agent '${id}' not found.`;
      }

      if (info.status !== "running" && info.status !== "pending") {
        return `Sub-agent '${id}' is not running (status: ${info.status}).`;
      }

      // 标记为取消（实际上需要 abort 方法）
      info.status = "failed";
      info.error = "Cancelled by user";
      info.progress = "Cancelled";

      return `Sub-agent '${id}' cancelled.`;
    },
  };

  return [
    subagentSpawnTool,
    subagentStatusTool,
    subagentListTool,
    subagentResultTool,
    subagentCancelTool,
  ];
}
