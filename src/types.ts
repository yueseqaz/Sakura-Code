import type OpenAI from "openai";

// ─── Core Message Types ───────────────────────────────────────────────────────
export type ChatMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;
export type ToolDef = OpenAI.Chat.Completions.ChatCompletionTool;

// ─── Tool Result ──────────────────────────────────────────────────────────────
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

// ─── Tool Handler Interface ───────────────────────────────────────────────────
export interface ToolHandler {
  name: string;
  schema: ToolDef;
  execute(args: Record<string, unknown>): Promise<string>;
}

// ─── Tool Registry ────────────────────────────────────────────────────────────
export type ToolRegistry = Map<string, ToolHandler>;

// ─── MCP Interface (future extensibility) ────────────────────────────────────
export interface MCPServer {
  name: string;
  version: string;
  tools(): Promise<ToolDef[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
}

export interface MCPAdapter {
  server: MCPServer;
  prefix?: string; // e.g. "github__" to namespace tool names
}

// ─── Agent Config ─────────────────────────────────────────────────────────────
export interface AgentConfig {
  model?: string;
  baseURL?: string;
  apiKey?: string;
  maxIterations?: number;
  workdir?: string;
  mcpServers?: MCPAdapter[];
}

// ─── Security ─────────────────────────────────────────────────────────────────
export interface SecurityPolicy {
  allowedPaths?: string[];       // whitelist (overrides blocklist if set)
  blockedPaths?: string[];       // system paths to protect
  blockedCommands?: string[];    // dangerous shell patterns
  maxFileSize?: number;          // bytes
  maxOutputSize?: number;        // chars truncation limit
}

// ─── Tool Arg Schemas ─────────────────────────────────────────────────────────
export interface BashArgs {
  command: string;
  timeout_ms?: number;
}

export interface ReadFileArgs {
  path: string;
  start_line?: number;
  end_line?: number;
}

export interface WriteFileArgs {
  path: string;
  content: string;
  create_dirs?: boolean;
}

export interface EditFileArgs {
  path: string;
  old_str: string;
  new_str: string;
}

export interface ListFilesArgs {
  path?: string;
  pattern?: string;
  recursive?: boolean;
}

export interface SearchFilesArgs {
  pattern: string;
  path?: string;
  file_pattern?: string;
  case_sensitive?: boolean;
}

export interface GitArgs {
  path?: string;
}

export interface GitCommitArgs {
  message: string;
  path?: string;
}

export interface ProjectIndexArgs {
  path?: string;
  extensions?: string[];
}

export interface SemanticSearchArgs {
  query: string;
  path?: string;
  top_k?: number;
}

export interface WebSearchArgs {
  query: string;
  num_results?: number;
}

export interface FetchUrlArgs {
  url: string;
  timeout_ms?: number;
}

export interface TodoWriteArgs {
  todos: TodoItem[];
}

export interface TodoReadArgs {
  filter?: "all" | "open" | "done";
}

export interface TodoItem {
  id: string;
  content: string;
  done: boolean;
  priority?: "high" | "medium" | "low";
  created_at: string;
}

export interface MemoryEntry {
  id: string;
  category: "preference" | "project" | "personal" | "workflow" | "other";
  content: string;
  importance: "low" | "medium" | "high";
  created_at: string;
}
