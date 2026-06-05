import { spawnSync } from "node:child_process";
import { truncate } from "../utils/security.js";
import type { ToolHandler, ToolDef } from "../types.js";

// ─── docker_ps ────────────────────────────────────────────────────────────────
export const dockerPsTool: ToolHandler = {
  name: "docker_ps",
  schema: {
    type: "function",
    function: {
      name: "docker_ps",
      description:
        "List Docker containers. Shows running containers by default. " +
        "Use 'all' to show all containers including stopped ones.",
      parameters: {
        type: "object",
        properties: {
          all: {
            type: "boolean",
            description: "Show all containers (default: false, only running)",
          },
          filter: {
            type: "string",
            description: "Filter containers (e.g. 'name=web', 'status=exited')",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { all = false, filter } = args as { all?: boolean; filter?: string };
    const cmd = ["docker", "ps"];
    if (all) cmd.push("-a");
    if (filter) cmd.push("--filter", filter);
    cmd.push("--format", "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}");

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 30_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return result.stdout || "No containers found.";
  },
};

// ─── docker_images ────────────────────────────────────────────────────────────
export const dockerImagesTool: ToolHandler = {
  name: "docker_images",
  schema: {
    type: "function",
    function: {
      name: "docker_images",
      description: "List Docker images.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "Filter images (e.g. 'dangling=true', 'name=node')",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { filter } = args as { filter?: string };
    const cmd = ["docker", "images", "--format", "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}"];
    if (filter) cmd.push("--filter", filter);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 30_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return result.stdout || "No images found.";
  },
};

// ─── docker_logs ──────────────────────────────────────────────────────────────
export const dockerLogsTool: ToolHandler = {
  name: "docker_logs",
  schema: {
    type: "function",
    function: {
      name: "docker_logs",
      description: "Get logs from a Docker container.",
      parameters: {
        type: "object",
        required: ["container"],
        properties: {
          container: { type: "string", description: "Container name or ID" },
          tail: { type: "number", description: "Number of lines to show (default: 100)" },
          since: { type: "string", description: "Show logs since timestamp (e.g. '10m', '1h')" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { container, tail = 100, since } = args as { container: string; tail?: number; since?: string };
    const cmd = ["docker", "logs", "--tail", String(tail)];
    if (since) cmd.push("--since", since);
    cmd.push(container);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 30_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return truncate(result.stdout || "No logs.", 32_000);
  },
};

// ─── docker_exec ──────────────────────────────────────────────────────────────
export const dockerExecTool: ToolHandler = {
  name: "docker_exec",
  schema: {
    type: "function",
    function: {
      name: "docker_exec",
      description: "Execute a command inside a running Docker container.",
      parameters: {
        type: "object",
        required: ["container", "command"],
        properties: {
          container: { type: "string", description: "Container name or ID" },
          command: { type: "string", description: "Command to execute" },
          workdir: { type: "string", description: "Working directory inside container" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { container, command, workdir } = args as { container: string; command: string; workdir?: string };
    const cmd = ["docker", "exec"];
    if (workdir) cmd.push("-w", workdir);
    cmd.push(container, "sh", "-c", command);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 60_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr || result.stdout}`;
    return truncate(result.stdout, 32_000);
  },
};

// ─── docker_compose ───────────────────────────────────────────────────────────
export const dockerComposeTool: ToolHandler = {
  name: "docker_compose",
  schema: {
    type: "function",
    function: {
      name: "docker_compose",
      description: "Run docker compose commands (up, down, ps, logs, etc.).",
      parameters: {
        type: "object",
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: ["up", "down", "ps", "logs", "build", "restart", "stop", "start"],
            description: "Docker compose action",
          },
          detached: { type: "boolean", description: "Run in detached mode (for 'up')" },
          service: { type: "string", description: "Specific service name" },
          file: { type: "string", description: "Path to docker-compose.yml" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { action, detached = true, service, file } = args as {
      action: string;
      detached?: boolean;
      service?: string;
      file?: string;
    };

    const cmd = ["docker", "compose"];
    if (file) cmd.push("-f", file);
    cmd.push(action);

    if (action === "up" && detached) cmd.push("-d");
    if (service) cmd.push(service);
    if (action === "logs") cmd.push("--tail", "50");

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 120_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr || result.stdout}`;
    return truncate(result.stdout || "Done.", 32_000);
  },
};
