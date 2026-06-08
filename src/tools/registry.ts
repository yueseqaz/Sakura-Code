import type { ToolHandler, ToolRegistry, ToolDef, MCPAdapter } from "../types.js";
import { logger } from "../utils/logger.js";

// Phase 1 — Core
import { bashTool } from "./bash.js";
import { readFileTool, writeFileTool, editFileTool, listFilesTool, searchFilesTool } from "./filesystem.js";
// Phase 2 — Git
import { 
  gitStatusTool, gitDiffTool, gitCommitTool, gitLogTool, gitBranchTool, gitCheckoutTool, 
  gitStashTool, gitMergeTool, gitPullTool, gitPushTool, gitCloneTool, gitAddTool, 
  gitResetTool, gitRevertTool, gitRebaseTool, gitFetchTool, gitTagTool, gitCherryPickTool,
  gitBlameTool, gitRemoteTool, gitShowTool, gitCleanTool, gitSubmoduleTool, gitBisectTool,
  gitReflogTool, gitWorktreeTool, gitGrepTool, gitConfigTool, gitInitTool
} from "./git.js";
// Phase 3 — Index & Semantic
import { projectIndexTool, semanticSearchTool } from "./index.js";
// Phase 4 — Web
import { webSearchTool, fetchUrlTool } from "./web.js";
// Phase 5 — TODOs
import { todoWriteTool, todoReadTool } from "./todo.js";
// Phase 6 — Docker
import { 
  dockerPsTool, dockerImagesTool, dockerLogsTool, dockerExecTool, dockerComposeTool,
  dockerBuildTool, dockerRunTool, dockerStopTool, dockerStartTool, dockerRestartTool,
  dockerRmTool, dockerRmiTool, dockerVolumeTool, dockerNetworkTool
} from "./docker.js";
// Phase 7 — Database
import { sqliteQueryTool, sqliteTablesTool, sqliteSchemaTool, mysqlQueryTool, postgresQueryTool } from "./database.js";
// Phase 8 — Memory
import { memorySaveTool, memoryRecallTool, memoryListTool, memoryDeleteTool, memoryMergeTool } from "./memory.js";
// Phase 9 — Skills
import { skillListTool, skillEnableTool, skillDisableTool, skillInfoTool, skillCreateTool, skillUpdateTool, skillDeleteTool } from "./skill.js";
// Phase 10 — Subagents
import { createSubagentTools } from "./subagent.js";
import type { SubagentManager } from "../agent/subagent-manager.js";

// ─── All built-in tools ───────────────────────────────────────────────────────
const BUILTIN_TOOLS: ToolHandler[] = [
  // Phase 1
  bashTool,
  readFileTool,
  writeFileTool,
  editFileTool,
  listFilesTool,
  searchFilesTool,
  // Phase 2
  gitStatusTool,
  gitDiffTool,
  gitCommitTool,
  gitLogTool,
  gitBranchTool,
  gitCheckoutTool,
  gitStashTool,
  gitMergeTool,
  gitPullTool,
  gitPushTool,
  gitCloneTool,
  gitAddTool,
  gitResetTool,
  gitRevertTool,
  gitRebaseTool,
  gitFetchTool,
  gitTagTool,
  gitCherryPickTool,
  gitBlameTool,
  gitRemoteTool,
  gitShowTool,
  gitCleanTool,
  gitSubmoduleTool,
  gitBisectTool,
  gitReflogTool,
  gitWorktreeTool,
  gitGrepTool,
  gitConfigTool,
  gitInitTool,
  // Phase 3
  projectIndexTool,
  semanticSearchTool,
  // Phase 4
  webSearchTool,
  fetchUrlTool,
  // Phase 5
  todoWriteTool,
  todoReadTool,
  // Phase 6 — Docker
  dockerPsTool,
  dockerImagesTool,
  dockerLogsTool,
  dockerExecTool,
  dockerComposeTool,
  dockerBuildTool,
  dockerRunTool,
  dockerStopTool,
  dockerStartTool,
  dockerRestartTool,
  dockerRmTool,
  dockerRmiTool,
  dockerVolumeTool,
  dockerNetworkTool,
  // Phase 7 — Database
  sqliteQueryTool,
  sqliteTablesTool,
  sqliteSchemaTool,
  mysqlQueryTool,
  postgresQueryTool,
  // Phase 8 — Memory
  memorySaveTool,
  memoryRecallTool,
  memoryListTool,
  memoryDeleteTool,
  memoryMergeTool,
  // Phase 9 — Skills
  skillListTool,
  skillEnableTool,
  skillDisableTool,
  skillInfoTool,
  skillCreateTool,
  skillUpdateTool,
  skillDeleteTool,
];

// ─── Registry ─────────────────────────────────────────────────────────────────
export class Registry {
  private handlers: ToolRegistry = new Map();
  private mcpAdapters: MCPAdapter[] = [];

  constructor() {
    for (const tool of BUILTIN_TOOLS) {
      this.register(tool);
    }
  }

  // ─── 加载子代理工具 ──────────────────────────────────────────────────────
  loadSubagentTools(manager: SubagentManager) {
    const tools = createSubagentTools(manager);
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: ToolHandler) {
    this.handlers.set(tool.name, tool);
  }

  async loadMCP(adapter: MCPAdapter) {
    try {
      const tools = await adapter.server.tools();
      for (const schema of tools) {
        const name = schema.function.name;
        const prefixed = adapter.prefix ? `${adapter.prefix}${name}` : name;
        this.handlers.set(prefixed, {
          name: prefixed,
          schema: {
            ...schema,
            function: { ...schema.function, name: prefixed },
          },
          execute: (args) => adapter.server.callTool(name, args),
        });
      }
      this.mcpAdapters.push(adapter);
      logger.info(`MCP server '${adapter.server.name}' loaded (${tools.length} tools)`);
    } catch (err) {
      logger.error(`Failed to load MCP server '${adapter.server.name}': ${(err as Error).message}`);
    }
  }

  schemas(): ToolDef[] {
    return [...this.handlers.values()].map((h) => h.schema);
  }

  async call(name: string, args: Record<string, unknown>): Promise<string> {
    const handler = this.handlers.get(name);
    if (!handler) return `Unknown tool: ${name}`;
    return handler.execute(args);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  list(): string[] {
    return [...this.handlers.keys()];
  }
}
