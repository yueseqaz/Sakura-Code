import { spawnSync } from "node:child_process";
import { truncate } from "../utils/security.js";
import type { ToolHandler, ToolDef } from "../types.js";

// ─── ssh_exec ────────────────────────────────────────────────────────────────
export const sshExecTool: ToolHandler = {
  name: "ssh_exec",
  schema: {
    type: "function",
    function: {
      name: "ssh_exec",
      description: "Execute a command on a remote server via SSH.",
      parameters: {
        type: "object",
        required: ["host", "command"],
        properties: {
          host: { type: "string", description: "SSH host (user@hostname or alias from ~/.ssh/config)" },
          command: { type: "string", description: "Command to execute on remote server" },
          port: { type: "number", description: "SSH port (default: 22)" },
          key: { type: "string", description: "Path to SSH private key" },
          timeout: { type: "number", description: "Timeout in seconds (default: 30)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { host, command, port, key, timeout = 30 } = args as {
      host: string; command: string; port?: number; key?: string; timeout?: number;
    };
    
    const cmd = ["ssh"];
    if (port) cmd.push("-p", String(port));
    if (key) cmd.push("-i", key);
    cmd.push("-o", `ConnectTimeout=${timeout}`);
    cmd.push("-o", "StrictHostKeyChecking=no");
    cmd.push(host, command);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: (timeout + 5) * 1000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr || result.stdout}`;
    return truncate(result.stdout || "Command executed.", 32_000);
  },
};

// ─── ssh_upload ──────────────────────────────────────────────────────────────
export const sshUploadTool: ToolHandler = {
  name: "ssh_upload",
  schema: {
    type: "function",
    function: {
      name: "ssh_upload",
      description: "Upload a file to a remote server via SCP.",
      parameters: {
        type: "object",
        required: ["local_path", "remote_path", "host"],
        properties: {
          local_path: { type: "string", description: "Local file path" },
          remote_path: { type: "string", description: "Remote destination path" },
          host: { type: "string", description: "SSH host (user@hostname or alias)" },
          port: { type: "number", description: "SSH port (default: 22)" },
          key: { type: "string", description: "Path to SSH private key" },
          recursive: { type: "boolean", description: "Upload directory recursively" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { local_path, remote_path, host, port, key, recursive } = args as {
      local_path: string; remote_path: string; host: string; port?: number; key?: string; recursive?: boolean;
    };
    
    const cmd = ["scp"];
    if (port) cmd.push("-P", String(port));
    if (key) cmd.push("-i", key);
    if (recursive) cmd.push("-r");
    cmd.push("-o", "StrictHostKeyChecking=no");
    cmd.push(local_path, `${host}:${remote_path}`);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 120_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return `Uploaded ${local_path} to ${host}:${remote_path}`;
  },
};

// ─── ssh_download ────────────────────────────────────────────────────────────
export const sshDownloadTool: ToolHandler = {
  name: "ssh_download",
  schema: {
    type: "function",
    function: {
      name: "ssh_download",
      description: "Download a file from a remote server via SCP.",
      parameters: {
        type: "object",
        required: ["remote_path", "local_path", "host"],
        properties: {
          remote_path: { type: "string", description: "Remote file path" },
          local_path: { type: "string", description: "Local destination path" },
          host: { type: "string", description: "SSH host (user@hostname or alias)" },
          port: { type: "number", description: "SSH port (default: 22)" },
          key: { type: "string", description: "Path to SSH private key" },
          recursive: { type: "boolean", description: "Download directory recursively" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { remote_path, local_path, host, port, key, recursive } = args as {
      remote_path: string; local_path: string; host: string; port?: number; key?: string; recursive?: boolean;
    };
    
    const cmd = ["scp"];
    if (port) cmd.push("-P", String(port));
    if (key) cmd.push("-i", key);
    if (recursive) cmd.push("-r");
    cmd.push("-o", "StrictHostKeyChecking=no");
    cmd.push(`${host}:${remote_path}`, local_path);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 120_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return `Downloaded ${host}:${remote_path} to ${local_path}`;
  },
};

// ─── ssh_list ────────────────────────────────────────────────────────────────
export const sshListTool: ToolHandler = {
  name: "ssh_list",
  schema: {
    type: "function",
    function: {
      name: "ssh_list",
      description: "List SSH hosts from ~/.ssh/config.",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", description: "Filter hosts by name pattern" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { filter } = args as { filter?: string };
    
    const result = spawnSync("ssh", ["-G", filter || "*"], { encoding: "utf8", timeout: 5000 });
    
    // Parse ssh config
    const { readFileSync } = await import("node:fs");
    const configPath = `${process.env.HOME}/.ssh/config`;

    try {
      const config = readFileSync(configPath, "utf8");
      const hosts = config.split("\n")
        .filter((line: string) => line.trim().toLowerCase().startsWith("host "))
        .map((line: string) => line.trim().split(/\s+/).slice(1).join(" "))
        .filter((host: string) => host !== "*");
      
      if (filter) {
        const filtered = hosts.filter((h: string) => h.toLowerCase().includes(filter.toLowerCase()));
        return filtered.length > 0 ? filtered.join("\n") : `No hosts matching "${filter}"`;
      }
      
      return hosts.length > 0 ? hosts.join("\n") : "No SSH hosts configured";
    } catch {
      return "No SSH config file found at ~/.ssh/config";
    }
  },
};

// ─── sshpass_exec ────────────────────────────────────────────────────────────
export const sshpassExecTool: ToolHandler = {
  name: "sshpass_exec",
  schema: {
    type: "function",
    function: {
      name: "sshpass_exec",
      description: "Execute a command on a remote server via SSH with password authentication (using sshpass).",
      parameters: {
        type: "object",
        required: ["host", "command", "password"],
        properties: {
          host: { type: "string", description: "SSH host (user@hostname)" },
          command: { type: "string", description: "Command to execute on remote server" },
          password: { type: "string", description: "SSH password" },
          port: { type: "number", description: "SSH port (default: 22)" },
          user: { type: "string", description: "SSH username (default: root)" },
          timeout: { type: "number", description: "Timeout in seconds (default: 30)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { host, command, password, port, user, timeout = 30 } = args as {
      host: string; command: string; password: string; port?: number; user?: string; timeout?: number;
    };
    
    const username = user || "root";
    const sshHost = `${username}@${host}`;
    
    const cmd = ["sshpass", "-e", "ssh"];
    if (port) cmd.push("-p", String(port));
    cmd.push("-o", `ConnectTimeout=${timeout}`);
    cmd.push("-o", "StrictHostKeyChecking=no");
    cmd.push(sshHost, command);

    const result = spawnSync(cmd[0], cmd.slice(1), {
      encoding: "utf8",
      timeout: (timeout + 5) * 1000,
      env: { ...process.env, SSHPASS: password },
    });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr || result.stdout}`;
    return truncate(result.stdout || "Command executed.", 32_000);
  },
};

// ─── sshpass_upload ──────────────────────────────────────────────────────────
export const sshpassUploadTool: ToolHandler = {
  name: "sshpass_upload",
  schema: {
    type: "function",
    function: {
      name: "sshpass_upload",
      description: "Upload a file to a remote server via SCP with password authentication (using sshpass).",
      parameters: {
        type: "object",
        required: ["local_path", "remote_path", "host", "password"],
        properties: {
          local_path: { type: "string", description: "Local file path" },
          remote_path: { type: "string", description: "Remote destination path" },
          host: { type: "string", description: "SSH host (user@hostname)" },
          password: { type: "string", description: "SSH password" },
          port: { type: "number", description: "SSH port (default: 22)" },
          user: { type: "string", description: "SSH username (default: root)" },
          recursive: { type: "boolean", description: "Upload directory recursively" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { local_path, remote_path, host, password, port, user, recursive } = args as {
      local_path: string; remote_path: string; host: string; password: string; port?: number; user?: string; recursive?: boolean;
    };
    
    const username = user || "root";
    const sshHost = `${username}@${host}`;
    
    const cmd = ["sshpass", "-e", "scp"];
    if (port) cmd.push("-P", String(port));
    if (recursive) cmd.push("-r");
    cmd.push("-o", "StrictHostKeyChecking=no");
    cmd.push(local_path, `${sshHost}:${remote_path}`);

    const result = spawnSync(cmd[0], cmd.slice(1), {
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, SSHPASS: password },
    });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return `Uploaded ${local_path} to ${sshHost}:${remote_path}`;
  },
};
