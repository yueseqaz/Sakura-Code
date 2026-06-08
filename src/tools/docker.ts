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

// ─── docker_build ─────────────────────────────────────────────────────────────
export const dockerBuildTool: ToolHandler = {
  name: "docker_build",
  schema: {
    type: "function",
    function: {
      name: "docker_build",
      description: "Build a Docker image from a Dockerfile.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Build context path (default: current directory)" },
          tag: { type: "string", description: "Image tag (e.g. 'myapp:latest')" },
          file: { type: "string", description: "Dockerfile path (default: Dockerfile)" },
          build_args: { type: "object", description: "Build arguments as key-value pairs" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { path = ".", tag, file, build_args } = args as {
      path?: string; tag?: string; file?: string; build_args?: Record<string, string>;
    };
    const cmd = ["docker", "build"];
    if (tag) cmd.push("-t", tag);
    if (file) cmd.push("-f", file);
    if (build_args) {
      for (const [key, value] of Object.entries(build_args)) {
        cmd.push("--build-arg", `${key}=${value}`);
      }
    }
    cmd.push(path);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 300_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr || result.stdout}`;
    return truncate(result.stdout || "Build completed.", 32_000);
  },
};

// ─── docker_run ───────────────────────────────────────────────────────────────
export const dockerRunTool: ToolHandler = {
  name: "docker_run",
  schema: {
    type: "function",
    function: {
      name: "docker_run",
      description: "Run a command in a new Docker container.",
      parameters: {
        type: "object",
        required: ["image"],
        properties: {
          image: { type: "string", description: "Image name" },
          command: { type: "string", description: "Command to run" },
          name: { type: "string", description: "Container name" },
          ports: { type: "array", items: { type: "string" }, description: "Port mappings (e.g. ['8080:80'])" },
          volumes: { type: "array", items: { type: "string" }, description: "Volume mappings" },
          env: { type: "object", description: "Environment variables" },
          detached: { type: "boolean", description: "Run in detached mode (default: true)" },
          rm: { type: "boolean", description: "Remove container when it exits" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { image, command, name, ports, volumes, env, detached = true, rm } = args as {
      image: string; command?: string; name?: string; ports?: string[]; volumes?: string[];
      env?: Record<string, string>; detached?: boolean; rm?: boolean;
    };
    const cmd = ["docker", "run"];
    if (detached) cmd.push("-d");
    if (rm) cmd.push("--rm");
    if (name) cmd.push("--name", name);
    if (ports) ports.forEach(p => cmd.push("-p", p));
    if (volumes) volumes.forEach(v => cmd.push("-v", v));
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        cmd.push("-e", `${key}=${value}`);
      }
    }
    cmd.push(image);
    if (command) cmd.push("sh", "-c", command);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 120_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr || result.stdout}`;
    return result.stdout || "Container started.";
  },
};

// ─── docker_stop ──────────────────────────────────────────────────────────────
export const dockerStopTool: ToolHandler = {
  name: "docker_stop",
  schema: {
    type: "function",
    function: {
      name: "docker_stop",
      description: "Stop one or more running containers.",
      parameters: {
        type: "object",
        required: ["containers"],
        properties: {
          containers: { type: "array", items: { type: "string" }, description: "Container names or IDs" },
          time: { type: "number", description: "Seconds to wait before killing (default: 10)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { containers, time } = args as { containers: string[]; time?: number };
    const cmd = ["docker", "stop"];
    if (time !== undefined) cmd.push("-t", String(time));
    cmd.push(...containers);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 60_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return `Stopped: ${containers.join(", ")}`;
  },
};

// ─── docker_start ─────────────────────────────────────────────────────────────
export const dockerStartTool: ToolHandler = {
  name: "docker_start",
  schema: {
    type: "function",
    function: {
      name: "docker_start",
      description: "Start one or more stopped containers.",
      parameters: {
        type: "object",
        required: ["containers"],
        properties: {
          containers: { type: "array", items: { type: "string" }, description: "Container names or IDs" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { containers } = args as { containers: string[] };
    const cmd = ["docker", "start", ...containers];

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 60_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return `Started: ${containers.join(", ")}`;
  },
};

// ─── docker_restart ───────────────────────────────────────────────────────────
export const dockerRestartTool: ToolHandler = {
  name: "docker_restart",
  schema: {
    type: "function",
    function: {
      name: "docker_restart",
      description: "Restart one or more containers.",
      parameters: {
        type: "object",
        required: ["containers"],
        properties: {
          containers: { type: "array", items: { type: "string" }, description: "Container names or IDs" },
          time: { type: "number", description: "Seconds to wait before killing (default: 10)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { containers, time } = args as { containers: string[]; time?: number };
    const cmd = ["docker", "restart"];
    if (time !== undefined) cmd.push("-t", String(time));
    cmd.push(...containers);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 60_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return `Restarted: ${containers.join(", ")}`;
  },
};

// ─── docker_rm ────────────────────────────────────────────────────────────────
export const dockerRmTool: ToolHandler = {
  name: "docker_rm",
  schema: {
    type: "function",
    function: {
      name: "docker_rm",
      description: "Remove one or more containers.",
      parameters: {
        type: "object",
        required: ["containers"],
        properties: {
          containers: { type: "array", items: { type: "string" }, description: "Container names or IDs" },
          force: { type: "boolean", description: "Force remove running containers" },
          volumes: { type: "boolean", description: "Remove anonymous volumes" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { containers, force, volumes } = args as { containers: string[]; force?: boolean; volumes?: boolean };
    const cmd = ["docker", "rm"];
    if (force) cmd.push("-f");
    if (volumes) cmd.push("-v");
    cmd.push(...containers);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 30_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return `Removed: ${containers.join(", ")}`;
  },
};

// ─── docker_rmi ───────────────────────────────────────────────────────────────
export const dockerRmiTool: ToolHandler = {
  name: "docker_rmi",
  schema: {
    type: "function",
    function: {
      name: "docker_rmi",
      description: "Remove one or more images.",
      parameters: {
        type: "object",
        required: ["images"],
        properties: {
          images: { type: "array", items: { type: "string" }, description: "Image names or IDs" },
          force: { type: "boolean", description: "Force remove" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { images, force } = args as { images: string[]; force?: boolean };
    const cmd = ["docker", "rmi"];
    if (force) cmd.push("-f");
    cmd.push(...images);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 30_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return `Removed images: ${images.join(", ")}`;
  },
};

// ─── docker_volume ────────────────────────────────────────────────────────────
export const dockerVolumeTool: ToolHandler = {
  name: "docker_volume",
  schema: {
    type: "function",
    function: {
      name: "docker_volume",
      description: "Manage Docker volumes (list, create, remove, inspect).",
      parameters: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["list", "create", "remove", "inspect", "prune"], description: "Volume action" },
          name: { type: "string", description: "Volume name (for create/remove/inspect)" },
          driver: { type: "string", description: "Volume driver (for create, default: local)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { action, name, driver } = args as { action: string; name?: string; driver?: string };
    const cmd = ["docker", "volume", action];
    
    if (action === "create" && name) {
      cmd.push(name);
      if (driver) cmd.push("--driver", driver);
    } else if ((action === "remove" || action === "inspect") && name) {
      cmd.push(name);
    }

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 30_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return result.stdout || "Done.";
  },
};

// ─── docker_network ───────────────────────────────────────────────────────────
export const dockerNetworkTool: ToolHandler = {
  name: "docker_network",
  schema: {
    type: "function",
    function: {
      name: "docker_network",
      description: "Manage Docker networks (list, create, remove, inspect, connect, disconnect).",
      parameters: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["list", "create", "remove", "inspect", "connect", "disconnect"], description: "Network action" },
          name: { type: "string", description: "Network name" },
          driver: { type: "string", description: "Network driver (for create, default: bridge)" },
          container: { type: "string", description: "Container name (for connect/disconnect)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { action, name, driver, container } = args as {
      action: string; name?: string; driver?: string; container?: string;
    };
    const cmd = ["docker", "network", action];
    
    if (action === "create" && name) {
      cmd.push(name);
      if (driver) cmd.push("--driver", driver);
    } else if ((action === "remove" || action === "inspect") && name) {
      cmd.push(name);
    } else if ((action === "connect" || action === "disconnect") && name && container) {
      cmd.push(name, container);
    }

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 30_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return result.stdout || "Done.";
  },
};
