/**
 * MCP (Model Context Protocol) Extension Interface
 *
 * This module defines the interfaces and base classes for integrating
 * external MCP servers into the Sakura Code agent.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────────
 *
 *   import { MCPHttpAdapter } from "./mcp/adapter.js";
 *   import { Agent } from "./agent/agent.js";
 *
 *   const agent = new Agent({
 *     mcpServers: [
 *       {
 *         server: new MCPHttpAdapter({
 *           name: "github",
 *           url: "http://localhost:3001",
 *         }),
 *         prefix: "github__",  // tools become: github__list_repos, etc.
 *       },
 *     ],
 *   });
 *
 * ─── Protocol ─────────────────────────────────────────────────────────────────
 *
 *   MCP servers expose:
 *     GET  /tools          → list of ToolDef[]
 *     POST /tools/:name    → { args } → { result: string }
 *
 *   The agent calls these automatically during tool dispatch.
 */

import type { MCPServer, ToolDef } from "../types.js";

// ─── HTTP MCP Adapter ─────────────────────────────────────────────────────────
export interface MCPHttpConfig {
  name: string;
  version?: string;
  url: string;           // base URL of the MCP server
  headers?: Record<string, string>;
  timeout_ms?: number;
}

export class MCPHttpAdapter implements MCPServer {
  name: string;
  version: string;
  private url: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor(config: MCPHttpConfig) {
    this.name = config.name;
    this.version = config.version ?? "1.0.0";
    this.url = config.url.replace(/\/$/, "");
    this.headers = { "Content-Type": "application/json", ...config.headers };
    this.timeout = config.timeout_ms ?? 30_000;
  }

  async tools(): Promise<ToolDef[]> {
    const res = await fetch(`${this.url}/tools`, {
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) throw new Error(`MCP ${this.name}: GET /tools failed (${res.status})`);
    return res.json();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${this.url}/tools/${name}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ args }),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MCP ${this.name}: ${name} failed (${res.status}): ${text}`);
    }
    const data: { result: string } = await res.json();
    return data.result;
  }
}

// ─── Local (in-process) MCP Adapter ──────────────────────────────────────────
// Useful for testing or embedding tools from a library.
export abstract class LocalMCPServer implements MCPServer {
  abstract name: string;
  abstract version: string;
  abstract tools(): Promise<ToolDef[]>;
  abstract callTool(name: string, args: Record<string, unknown>): Promise<string>;
}

// ─── Example: FileSystem MCP (mirrors filesystem tools as an MCP server) ──────
export class ExampleFileSystemMCP extends LocalMCPServer {
  name = "filesystem";
  version = "1.0.0";

  async tools(): Promise<ToolDef[]> {
    return [
      {
        type: "function",
        function: {
          name: "list_directory",
          description: "List the contents of a directory",
          parameters: {
            type: "object",
            required: ["path"],
            properties: {
              path: { type: "string" },
            },
          },
        },
      },
    ];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (name === "list_directory") {
      const { readdirSync } = await import("node:fs");
      const entries = readdirSync(args.path as string);
      return entries.join("\n");
    }
    return `Unknown tool: ${name}`;
  }
}
