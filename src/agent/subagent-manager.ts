import { v4 as uuidv4 } from "uuid";
import { Agent } from "./agent.js";
import { Context } from "./context.js";
import type { AgentConfig } from "../types.js";

// ─── 子代理状态 ──────────────────────────────────────────────────────────────
export type SubagentStatus = "pending" | "running" | "completed" | "failed" | "timeout";

export interface SubagentInfo {
  id: string;
  task: string;
  status: SubagentStatus;
  progress: string;
  startTime: number;
  lastHeartbeat: number;
  result?: string;
  error?: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

// ─── 子代理配置 ──────────────────────────────────────────────────────────────
export interface SubagentConfig {
  timeout?: number;           // 超时时间 (ms), 默认 300000 (5分钟)
  heartbeatTimeout?: number;  // 心跳超时 (ms), 默认 30000 (30秒)
  model?: string;             // 使用的模型
  maxIterations?: number;     // 最大迭代次数
}

// ─── 子代理管理器 ────────────────────────────────────────────────────────────
export class SubagentManager {
  private agents: Map<string, SubagentInfo> = new Map();
  private agentInstances: Map<string, Agent> = new Map();
  private parentConfig: AgentConfig;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(parentConfig: AgentConfig) {
    this.parentConfig = parentConfig;
    // 启动定时检查
    this.startChecker();
  }

  // ─── 启动定时检查 ──────────────────────────────────────────────────────────
  private startChecker() {
    this.checkInterval = setInterval(() => {
      this.checkTimeouts();
    }, 5000); // 每5秒检查一次
  }

  // ─── 停止定时检查 ──────────────────────────────────────────────────────────
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // ─── 创建子代理 ────────────────────────────────────────────────────────────
  async spawn(task: string, config: SubagentConfig = {}): Promise<string> {
    const id = uuidv4().slice(0, 8);
    const now = Date.now();

    // 创建子代理信息
    const info: SubagentInfo = {
      id,
      task,
      status: "pending",
      progress: "Waiting to start...",
      startTime: now,
      lastHeartbeat: now,
    };
    this.agents.set(id, info);

    // 创建子代理实例
    const agentConfig: AgentConfig = {
      ...this.parentConfig,
      model: config.model || this.parentConfig.model,
      maxIterations: config.maxIterations || 20,
    };
    const agent = new Agent(agentConfig);
    this.agentInstances.set(id, agent);

    // 异步执行（不阻塞主 Agent）
    this.executeAgent(id, agent, task, config);

    return id;
  }

  // ─── 执行子代理 ────────────────────────────────────────────────────────────
  private async executeAgent(
    id: string,
    agent: Agent,
    task: string,
    config: SubagentConfig
  ) {
    const info = this.agents.get(id)!;
    info.status = "running";
    info.progress = "Starting...";

    try {
      const ctx = new Context();

      // 设置进度回调
      agent.setProgressCallback((progress: string) => {
        info.progress = progress;
        info.lastHeartbeat = Date.now();
      });

      // 执行任务
      await agent.run(ctx, task);

      // 完成
      info.status = "completed";
      info.progress = "Completed";
      const lastMsg = ctx.messages[ctx.messages.length - 1];
      info.result = typeof lastMsg?.content === "string" ? lastMsg.content : "No result";

      // 获取 token 使用情况
      const usage = agent.getTokenUsage();
      info.tokenUsage = {
        prompt: usage.promptTokens,
        completion: usage.completionTokens,
        total: usage.totalTokens,
      };
    } catch (err: any) {
      info.status = "failed";
      info.error = err.message;
      info.progress = "Failed";
    } finally {
      this.agentInstances.delete(id);
    }
  }

  // ─── 检查超时 ──────────────────────────────────────────────────────────────
  private checkTimeouts() {
    const now = Date.now();

    for (const [id, info] of this.agents) {
      if (info.status !== "running") continue;

      const heartbeatTimeout = 30000; // 30秒心跳超时
      const totalTimeout = 300000;    // 5分钟总超时

      // 心跳超时
      if (now - info.lastHeartbeat > heartbeatTimeout) {
        info.status = "timeout";
        info.error = "No heartbeat for 30s";
        info.progress = "Timeout (no heartbeat)";
        this.abortAgent(id);
        continue;
      }

      // 总超时
      if (now - info.startTime > totalTimeout) {
        info.status = "timeout";
        info.error = "Execution timeout (5 minutes)";
        info.progress = "Timeout";
        this.abortAgent(id);
      }
    }
  }

  // ─── 终止子代理 ────────────────────────────────────────────────────────────
  private abortAgent(id: string) {
    const agent = this.agentInstances.get(id);
    if (agent) {
      // agent.abort(); // 需要在 Agent 中添加 abort 方法
      this.agentInstances.delete(id);
    }
  }

  // ─── 获取子代理状态 ────────────────────────────────────────────────────────
  getStatus(id: string): SubagentInfo | null {
    return this.agents.get(id) || null;
  }

  // ─── 列出所有子代理 ────────────────────────────────────────────────────────
  listAll(): SubagentInfo[] {
    return Array.from(this.agents.values());
  }

  // ─── 获取运行中的子代理数量 ────────────────────────────────────────────────
  getRunningCount(): number {
    let count = 0;
    for (const info of this.agents.values()) {
      if (info.status === "running" || info.status === "pending") {
        count++;
      }
    }
    return count;
  }

  // ─── 清理已完成的子代理 ────────────────────────────────────────────────────
  cleanup() {
    for (const [id, info] of this.agents) {
      if (info.status === "completed" || info.status === "failed" || info.status === "timeout") {
        this.agents.delete(id);
      }
    }
  }

  // ─── 获取摘要 ──────────────────────────────────────────────────────────────
  getSummary(): string {
    const all = this.listAll();
    const running = all.filter(a => a.status === "running").length;
    const completed = all.filter(a => a.status === "completed").length;
    const failed = all.filter(a => a.status === "failed").length;

    return `Subagents: ${all.length} total (${running} running, ${completed} completed, ${failed} failed)`;
  }
}
