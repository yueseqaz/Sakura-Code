import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { ToolHandler, ToolDef } from "../types.js";

const SKILLS_DIR = join(homedir(), ".sakura-code", "skills");

// ─── Skill 类型 ──────────────────────────────────────────────────────────────
export interface SkillMeta {
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  triggers: string[];
  enabled: boolean;
}

export interface Skill extends SkillMeta {
  path: string;
  content?: string; // SKILL.md 内容，延迟加载
}

// ─── 缓存 ────────────────────────────────────────────────────────────────────
let skillsCache: Skill[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5秒缓存

function invalidateCache() {
  skillsCache = null;
  cacheTimestamp = 0;
}

// ─── 路径安全校验 ─────────────────────────────────────────────────────────────
function validateSkillName(name: string): boolean {
  // 只允许小写字母、数字、连字符，不允许路径分隔符
  return /^[a-z0-9-]+$/.test(name);
}

function getSafeSkillDir(name: string): string | null {
  if (!validateSkillName(name)) return null;
  const skillDir = resolve(SKILLS_DIR, name);
  // 确保解析后的路径仍在 SKILLS_DIR 下
  if (!skillDir.startsWith(resolve(SKILLS_DIR))) return null;
  return skillDir;
}

// ─── 确保目录存在 ────────────────────────────────────────────────────────────
function ensureSkillsDir() {
  if (!existsSync(SKILLS_DIR)) {
    mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

// ─── 加载所有 Skills（带缓存）────────────────────────────────────────────────
export function loadSkills(): Skill[] {
  const now = Date.now();
  if (skillsCache && now - cacheTimestamp < CACHE_TTL) {
    return skillsCache;
  }

  ensureSkillsDir();
  
  const skills: Skill[] = [];
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const skillDir = join(SKILLS_DIR, entry.name);
    const jsonPath = join(skillDir, "skill.json");
    const mdPath = join(skillDir, "SKILL.md");
    
    if (!existsSync(jsonPath) || !existsSync(mdPath)) continue;
    
    try {
      const meta = JSON.parse(readFileSync(jsonPath, "utf8"));
      skills.push({
        ...meta,
        path: skillDir,
      });
    } catch {
      // 跳过无效的 skill
    }
  }
  
  skillsCache = skills;
  cacheTimestamp = now;
  return skills;
}

// ─── 读取 Skill 内容（延迟加载）──────────────────────────────────────────────
export function readSkillContent(name: string): string | null {
  const mdPath = join(SKILLS_DIR, name, "SKILL.md");
  if (!existsSync(mdPath)) return null;
  return readFileSync(mdPath, "utf8");
}

// ─── 匹配 Skill ─────────────────────────────────────────────────────────────
// ─── 智能技能匹配 ────────────────────────────────────────────────────────────
export function matchSkill(input: string): Skill | null {
  const skills = loadSkills();
  const lower = input.toLowerCase();
  
  // 1. 先检查是否包含工具调用（更精确的匹配）
  const toolPatterns = [
    { pattern: /git[_\s]?(branch|push|pull|merge|rebase|commit|stash|checkout|clone|add|reset|revert|tag|cherry.?pick|blame|remote|show|clean|submodule|bisect|reflog|worktree|grep|config|init|fetch|diff|status|log)/i, skillName: "git-workflow" },
    { pattern: /docker[_\s]?(build|run|compose|ps|images|exec|logs|stop|start|restart|rm|rmi|volume|network|pull|push|save|load|export|import|inspect|top|port|wait|attach|cp|events|system|context|scan|trust|manifest|hub|login|logout|search)/i, skillName: "docker-deploy" },
    { pattern: /code[_\s]?review|审查|代码检查|检查代码|代码质量/i, skillName: "code-review" },
  ];
  
  for (const { pattern, skillName } of toolPatterns) {
    if (pattern.test(input)) {
      const skill = skills.find(s => s.name === skillName && s.enabled);
      if (skill) return skill;
    }
  }
  
  // 2. 检查 triggers 关键词
  for (const skill of skills) {
    if (!skill.enabled) continue;
    
    for (const trigger of skill.triggers) {
      if (lower.includes(trigger.toLowerCase())) {
        return skill;
      }
    }
  }
  
  return null;
}

// ─── 工具调用时匹配技能 ──────────────────────────────────────────────────────
export function matchSkillByTool(toolName: string): Skill | null {
  const skills = loadSkills();
  
  // 1. 硬编码映射（向后兼容）
  const toolToSkill: Record<string, string> = {
    "git_status": "git-workflow",
    "git_diff": "git-workflow",
    "git_commit": "git-workflow",
    "git_log": "git-workflow",
    "git_branch": "git-workflow",
    "git_checkout": "git-workflow",
    "git_stash": "git-workflow",
    "git_merge": "git-workflow",
    "git_pull": "git-workflow",
    "git_push": "git-workflow",
    "git_clone": "git-workflow",
    "git_add": "git-workflow",
    "git_reset": "git-workflow",
    "git_revert": "git-workflow",
    "git_rebase": "git-workflow",
    "git_fetch": "git-workflow",
    "git_tag": "git-workflow",
    "git_cherry_pick": "git-workflow",
    "git_blame": "git-workflow",
    "git_remote": "git-workflow",
    "git_show": "git-workflow",
    "git_clean": "git-workflow",
    "git_submodule": "git-workflow",
    "git_bisect": "git-workflow",
    "git_reflog": "git-workflow",
    "git_worktree": "git-workflow",
    "git_grep": "git-workflow",
    "git_config": "git-workflow",
    "git_init": "git-workflow",
    "docker_build": "docker-deploy",
    "docker_run": "docker-deploy",
    "docker_compose": "docker-deploy",
    "docker_ps": "docker-deploy",
    "docker_images": "docker-deploy",
    "docker_exec": "docker-deploy",
    "docker_logs": "docker-deploy",
    "docker_stop": "docker-deploy",
    "docker_start": "docker-deploy",
    "docker_restart": "docker-deploy",
    "docker_rm": "docker-deploy",
    "docker_rmi": "docker-deploy",
    "docker_volume": "docker-deploy",
    "docker_network": "docker-deploy",
  };
  
  // 先检查硬编码映射
  const skillName = toolToSkill[toolName];
  if (skillName) {
    return skills.find(s => s.name === skillName && s.enabled) || null;
  }
  
  // 2. 动态匹配：检查工具名前缀是否匹配技能的 tags
  const toolPrefix = toolName.split("_")[0].toLowerCase();
  for (const skill of skills) {
    if (!skill.enabled) continue;
    
    // 检查技能的 tags 是否包含工具前缀
    if (skill.tags.some(tag => tag.toLowerCase() === toolPrefix)) {
      return skill;
    }
    
    // 检查技能的 triggers 是否包含工具前缀
    if (skill.triggers.some(trigger => trigger.toLowerCase().includes(toolPrefix))) {
      return skill;
    }
  }
  
  return null;
}

// ─── skill_list 工具 ─────────────────────────────────────────────────────────
export const skillListTool: ToolHandler = {
  name: "skill_list",
  schema: {
    type: "function",
    function: {
      name: "skill_list",
      description: "List all installed skills.",
      parameters: {
        type: "object",
        properties: {
          enabled_only: {
            type: "boolean",
            description: "Show only enabled skills (default: false)",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { enabled_only = false } = args as { enabled_only?: boolean };
    
    let skills = loadSkills();
    if (enabled_only) {
      skills = skills.filter(s => s.enabled);
    }
    
    if (!skills.length) {
      return "No skills installed. Add skills to ~/.sakura-code/skills/";
    }
    
    const output = skills.map(s => {
      const status = s.enabled ? "✅" : "❌";
      const tags = s.tags.length > 0 ? ` [${s.tags.join(",")}]` : "";
      return `${status} ${s.name} v${s.version} — ${s.description}${tags}`;
    }).join("\n");
    
    return `Installed Skills (${skills.length}):\n\n${output}`;
  },
};

// ─── skill_enable 工具 ───────────────────────────────────────────────────────
export const skillEnableTool: ToolHandler = {
  name: "skill_enable",
  schema: {
    type: "function",
    function: {
      name: "skill_enable",
      description: "Enable a skill.",
      parameters: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "Skill name to enable" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { name } = args as { name: string };
    const jsonPath = join(SKILLS_DIR, name, "skill.json");
    
    if (!existsSync(jsonPath)) {
      return `Skill '${name}' not found~`;
    }
    
    try {
      const meta = JSON.parse(readFileSync(jsonPath, "utf8"));
      meta.enabled = true;
      writeFileSync(jsonPath, JSON.stringify(meta, null, 2));
      return `Skill '${name}' enabled~ ♡`;
    } catch (err) {
      return `Error: ${(err as Error).message}`;
    }
  },
};

// ─── skill_disable 工具 ──────────────────────────────────────────────────────
export const skillDisableTool: ToolHandler = {
  name: "skill_disable",
  schema: {
    type: "function",
    function: {
      name: "skill_disable",
      description: "Disable a skill.",
      parameters: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "Skill name to disable" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { name } = args as { name: string };
    const jsonPath = join(SKILLS_DIR, name, "skill.json");
    
    if (!existsSync(jsonPath)) {
      return `Skill '${name}' not found~`;
    }
    
    try {
      const meta = JSON.parse(readFileSync(jsonPath, "utf8"));
      meta.enabled = false;
      writeFileSync(jsonPath, JSON.stringify(meta, null, 2));
      return `Skill '${name}' disabled~ ♡`;
    } catch (err) {
      return `Error: ${(err as Error).message}`;
    }
  },
};

// ─── skill_info 工具 ─────────────────────────────────────────────────────────
export const skillInfoTool: ToolHandler = {
  name: "skill_info",
  schema: {
    type: "function",
    function: {
      name: "skill_info",
      description: "Show detailed information about a skill.",
      parameters: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "Skill name" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { name } = args as { name: string };
    const skills = loadSkills();
    const skill = skills.find(s => s.name === name);
    
    if (!skill) {
      return `Skill '${name}' not found~`;
    }
    
    const content = readSkillContent(name);
    const status = skill.enabled ? "✅ Enabled" : "❌ Disabled";
    
    return [
      `# ${skill.name} v${skill.version}`,
      `Status: ${status}`,
      `Author: ${skill.author}`,
      `Description: ${skill.description}`,
      `Tags: ${skill.tags.join(", ") || "none"}`,
      `Triggers: ${skill.triggers.join(", ")}`,
      "",
      "## SKILL.md Preview",
      content ? content.slice(0, 500) + (content.length > 500 ? "..." : "") : "(empty)",
    ].join("\n");
  },
};

// ─── skill_create 工具 ────────────────────────────────────────────────────────
export const skillCreateTool: ToolHandler = {
  name: "skill_create",
  schema: {
    type: "function",
    function: {
      name: "skill_create",
      description: "Create a new skill with metadata and instructions.",
      parameters: {
        type: "object",
        required: ["name", "description", "content"],
        properties: {
          name: { type: "string", description: "Skill name (lowercase, hyphens allowed)" },
          description: { type: "string", description: "Short description of the skill" },
          content: { type: "string", description: "SKILL.md content (instructions for the AI)" },
          author: { type: "string", description: "Author name (default: user)" },
          tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
          triggers: { type: "array", items: { type: "string" }, description: "Trigger keywords" },
          enabled: { type: "boolean", description: "Enable immediately (default: true)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { name, description, content, author = "user", tags = [], triggers = [], enabled = true } = args as {
      name: string; description: string; content: string; author?: string; tags?: string[]; triggers?: string[]; enabled?: boolean;
    };

    // 验证名称格式
    if (!validateSkillName(name)) {
      return "Error: Skill name must be lowercase with hyphens only (e.g., 'my-skill')";
    }

    const skillDir = getSafeSkillDir(name);
    if (!skillDir) return "Error: Invalid skill name.";
    const jsonPath = join(skillDir, "skill.json");
    const mdPath = join(skillDir, "SKILL.md");

    // 检查是否已存在
    if (existsSync(jsonPath)) {
      return `Skill '${name}' already exists. Use skill_update to modify it.`;
    }

    // 创建目录
    mkdirSync(skillDir, { recursive: true });

    // 生成默认 triggers（如果未提供）
    const finalTriggers = triggers.length > 0 ? triggers : [name, name.replace(/-/g, " ")];

    // 写入 skill.json
    const meta = {
      name,
      version: "1.0.0",
      description,
      author,
      tags,
      triggers: finalTriggers,
      enabled,
    };
    writeFileSync(jsonPath, JSON.stringify(meta, null, 2));

    // 写入 SKILL.md
    writeFileSync(mdPath, content);

    invalidateCache();
    return `Skill '${name}' created successfully~ ♡\nLocation: ${skillDir}`;
  },
};

// ─── skill_update 工具 ────────────────────────────────────────────────────────
export const skillUpdateTool: ToolHandler = {
  name: "skill_update",
  schema: {
    type: "function",
    function: {
      name: "skill_update",
      description: "Update an existing skill's metadata or content.",
      parameters: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "Skill name to update" },
          description: { type: "string", description: "New description" },
          version: { type: "string", description: "New version (e.g., '1.1.0')" },
          content: { type: "string", description: "New SKILL.md content" },
          tags: { type: "array", items: { type: "string" }, description: "New tags" },
          triggers: { type: "array", items: { type: "string" }, description: "New triggers" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { name, description, version, content, tags, triggers } = args as {
      name: string; description?: string; version?: string; content?: string; tags?: string[]; triggers?: string[];
    };

    const skillDir = getSafeSkillDir(name);
    if (!skillDir) return "Error: Invalid skill name. Use lowercase letters, numbers, and hyphens only.";

    const jsonPath = join(skillDir, "skill.json");
    const mdPath = join(skillDir, "SKILL.md");

    if (!existsSync(jsonPath)) {
      return `Skill '${name}' not found~`;
    }

    // 更新 skill.json
    const meta = JSON.parse(readFileSync(jsonPath, "utf8"));
    if (description !== undefined) meta.description = description;
    if (version !== undefined) meta.version = version;
    if (tags !== undefined) meta.tags = tags;
    if (triggers !== undefined) meta.triggers = triggers;
    writeFileSync(jsonPath, JSON.stringify(meta, null, 2));

    // 更新 SKILL.md
    if (content !== undefined) {
      writeFileSync(mdPath, content);
    }

    invalidateCache();
    return `Skill '${name}' updated~ ♡`;
  },
};

// ─── skill_delete 工具 ────────────────────────────────────────────────────────
export const skillDeleteTool: ToolHandler = {
  name: "skill_delete",
  schema: {
    type: "function",
    function: {
      name: "skill_delete",
      description: "Delete a skill permanently.",
      parameters: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "Skill name to delete" },
          confirm: { type: "boolean", description: "Confirm deletion (required)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { name, confirm } = args as { name: string; confirm?: boolean };

    if (!confirm) {
      return `Are you sure you want to delete '${name}'? Set confirm=true to proceed.`;
    }

    const skillDir = getSafeSkillDir(name);
    if (!skillDir || !existsSync(skillDir)) {
      return `Skill '${name}' not found~`;
    }

    rmSync(skillDir, { recursive: true, force: true });
    invalidateCache();
    return `Skill '${name}' deleted~ ♡`;
  },
};
