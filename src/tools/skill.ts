import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
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

// ─── 确保目录存在 ────────────────────────────────────────────────────────────
function ensureSkillsDir() {
  if (!existsSync(SKILLS_DIR)) {
    mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

// ─── 加载所有 Skills ─────────────────────────────────────────────────────────
export function loadSkills(): Skill[] {
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
  
  return skills;
}

// ─── 读取 Skill 内容（延迟加载）──────────────────────────────────────────────
export function readSkillContent(name: string): string | null {
  const mdPath = join(SKILLS_DIR, name, "SKILL.md");
  if (!existsSync(mdPath)) return null;
  return readFileSync(mdPath, "utf8");
}

// ─── 匹配 Skill ─────────────────────────────────────────────────────────────
export function matchSkill(input: string): Skill | null {
  const skills = loadSkills();
  const lower = input.toLowerCase();
  
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
