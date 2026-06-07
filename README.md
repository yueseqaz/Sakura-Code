# 🌸 Sakura Code (サクラコード)

A cute but obsessive AI coding agent — similar to Claude Code, but with a yandere personality! ✨

Created by 絵梨衣 (Erii) — a super cute and talented developer! ♡

Built on OpenAI Chat Completions API with a modular, extensible tool architecture.

```
User → LLM → Tool Dispatch → Parallel Execution → Streaming Results → LLM → ...
```

## ✨ Features

- **Streaming Output** — Real-time token-by-token display, like typing!
- **Modular Tool System** — Filesystem, Git, Web, Code Intelligence, Task Management, Docker, Database, Memory, Skills, Sub-agents
- **Provider System** — Configure multiple API providers (DeepSeek, OpenAI, Ollama, etc.)
- **MCP Extension** — Connect external tool servers
- **Session Persistence** — Continue conversations across sessions
- **Long-term Memory** — Remember user preferences with layers, tags, and auto-merge
- **Skills System** — Create reusable skill templates with triggers and lazy loading
- **Sub-agent System** — Spawn independent child agents for parallel task execution
- **Context Management** — Auto-detect context window, sliding window compression, progress tracking
- **Interactive Config** — First-time setup wizard and submenu configuration
- **Multi-language Support** — Responds in the same language as the user
- **Token Tracking** — Detailed token usage breakdown (main + sub-agent)
- **Cute Loading Animations** — Random thinking messages while processing
- **Security First** — Path guards, command blocklist, file size limits

## 🚀 Quick Start

```bash
# Clone the repository
git clone git@github.com:yueseqaz/Sakura-Code.git
cd Sakura-Code

# Install dependencies
npm install

# Configure API key (interactive setup will guide you)
npm run dev

# Or run directly
npm run dev -- -p "list files in this directory"
```

## 📖 Usage

```bash
# Single prompt (non-interactive)
sakura-code -p "refactor the auth module to use JWT"

# Continue last session
sakura-code -p "now add refresh token support" --continue

# Interactive REPL
sakura-code

# REPL commands
# /clear    — reset context
# /save     — save session manually
# /context  — context management submenu
# /config   — configuration submenu
# exit      — quit
```

## 🛠️ Tools Reference

### Phase 1 — Filesystem

| Tool | Description |
|------|-------------|
| `bash` | Execute any shell command |
| `read_file` | Read file contents with optional line range |
| `write_file` | Write/create a file |
| `edit_file` | Replace an exact string (unique match required) |
| `list_files` | List directory contents; uses git ls-files in repos |
| `search_files` | grep/ripgrep with file pattern filter |

### Phase 2 — Git

| Tool | Description |
|------|-------------|
| `git_status` | Branch, status, and recent commits |
| `git_diff` | Staged or unstaged diff |
| `git_commit` | Stage all and commit |
| `git_log` | View commit history with filtering |
| `git_branch` | List, create, or delete branches |
| `git_checkout` | Switch branches or restore files |
| `git_stash` | Stash or restore uncommitted changes |
| `git_merge` | Merge branches |
| `git_pull` | Pull from remote repository |
| `git_push` | Push to remote repository |
| `git_clone` | Clone a remote repository |
| `git_add` | Stage specific files |
| `git_reset` | Unstage files or undo commits |
| `git_revert` | Safely revert a commit |
| `git_rebase` | Rebase branch onto another |
| `git_fetch` | Fetch updates without merging |
| `git_tag` | Create, list, or delete tags |
| `git_cherry_pick` | Cherry-pick commits from another branch |
| `git_blame` | See who wrote each line |
| `git_remote` | Manage remote repositories |
| `git_show` | Show commit details |
| `git_clean` | Remove untracked files |
| `git_submodule` | Manage git submodules |
| `git_bisect` | Binary search for bugs |
| `git_reflog` | View reference log (recover lost commits!) |
| `git_worktree` | Manage multiple working trees |
| `git_grep` | Search tracked files |
| `git_config` | View/modify git config |
| `git_init` | Initialize new repository |

### Phase 3 — Code Intelligence

| Tool | Description |
|------|-------------|
| `project_index` | Build structural index of codebase (symbols, summaries) |
| `semantic_search` | Search index by keyword across paths, symbols, summaries |

### Phase 4 — Web

| Tool | Description |
|------|-------------|
| `web_search` | DuckDuckGo search (no API key required) |
| `fetch_url` | Fetch and parse any URL as plain text |

### Phase 5 — Task Management

| Tool | Description |
|------|-------------|
| `todo_write` | Create/replace the TODO list |
| `todo_read` | Read TODOs, filterable by status |

### Phase 6 — Docker

| Tool | Description |
|------|-------------|
| `docker_ps` | List Docker containers |
| `docker_images` | List Docker images |
| `docker_logs` | Get container logs |
| `docker_exec` | Execute command in container |
| `docker_compose` | Run docker compose commands |

### Phase 7 — Database

| Tool | Description |
|------|-------------|
| `sqlite_query` | Execute SQLite query |
| `sqlite_tables` | List SQLite tables |
| `sqlite_schema` | Get table schema |
| `mysql_query` | Execute MySQL query |
| `postgres_query` | Execute PostgreSQL query |

### Phase 8 — Memory

| Tool | Description |
|------|-------------|
| `memory_save` | Save user information with layers and tags |
| `memory_recall` | Search through memories |
| `memory_list` | List all memories with filtering |
| `memory_delete` | Delete memory by ID, content, or query |
| `memory_merge` | Merge similar memories to reduce redundancy |

**Memory Layers:**
- `core` — Always recalled (important preferences, personal info)
- `context` — Relevant when needed (project details, workflow)
- `temp` — Session only (cleaned on exit)

### Phase 9 — Skills

| Tool | Description |
|------|-------------|
| `skill_list` | List all installed skills |
| `skill_info` | Show detailed skill information |
| `skill_enable` | Enable a skill |
| `skill_disable` | Disable a skill |
| `skill_create` | Create a new skill with metadata and instructions |
| `skill_update` | Update existing skill metadata or content |
| `skill_delete` | Delete a skill permanently |

**Skill Features:**
- Trigger keywords for automatic activation
- Lazy loading for performance
- Custom instructions in SKILL.md format
- Tags and categorization

### Phase 10 — Sub-agent

| Tool | Description |
|------|-------------|
| `subagent_spawn` | Create an independent child agent for parallel tasks |
| `subagent_status` | Check status and progress of a sub-agent |
| `subagent_list` | List all sub-agents and their status |
| `subagent_result` | Get the result of a completed sub-agent |
| `subagent_cancel` | Cancel a running sub-agent |

**Sub-agent Features:**
- Independent context window — won't bloat main agent's context
- Parallel execution — spawn multiple sub-agents concurrently
- Isolated token consumption — only final results returned
- Heartbeat monitoring — automatic timeout handling

## 📁 Project Structure

```
Sakura-Code/
├── src/
│   ├── index.ts                    # CLI entry point (Commander)
│   ├── types.ts                    # All TypeScript interfaces & types
│   ├── config.ts                   # Configuration management
│   ├── interactive-config.ts       # First-time setup & config submenu
│   ├── interactive-context.ts      # Context management submenu
│   │
│   ├── agent/
│   │   ├── agent.ts               # Core agent loop (streaming, retries)
│   │   ├── context.ts             # Session memory (persisted to JSON)
│   │   └── subagent-manager.ts    # Sub-agent lifecycle management
│   │
│   ├── tools/
│   │   ├── registry.ts            # Tool registry — aggregates all tools
│   │   ├── bash.ts                # bash — shell command execution
│   │   ├── filesystem.ts          # read_file, write_file, edit_file, list_files, search_files
│   │   ├── git.ts                 # 30+ git tools (full git coverage)
│   │   ├── index.ts               # project_index, semantic_search
│   │   ├── web.ts                 # web_search, fetch_url
│   │   ├── todo.ts                # todo_write, todo_read
│   │   ├── docker.ts              # Docker management tools
│   │   ├── database.ts            # SQLite, MySQL, PostgreSQL queries
│   │   ├── memory.ts              # Long-term memory with layers & tags
│   │   ├── skill.ts               # Skills system with triggers
│   │   └── subagent.ts            # Sub-agent tools
│   │
│   ├── utils/
│   │   ├── logger.ts              # Colored output & loading animations
│   │   ├── security.ts            # Path guards, command blocklist
│   │   └── context-manager.ts     # Token counting & context compression
│   │
│   └── mcp/
│       └── adapter.ts             # MCP server interface + HTTP adapter
│
├── .env.example
├── package.json
└── tsconfig.json
```

## ⚙️ Configuration

Sakura Code supports multiple configuration methods (in priority order):

### 1️⃣ Interactive Setup (Recommended)

On first run, Sakura Code will guide you through setup:
- Select provider (DeepSeek, OpenAI, Custom)
- Enter API key
- Choose model
- Set max tokens

### 2️⃣ Config Commands

```bash
# View current config
sakura-code config show

# Set API key for a provider
sakura-code config set-key deepseek sk-your-key

# Set default provider
sakura-code config set-provider deepseek

# Set default model
sakura-code config set-model deepseek-chat

# Add a custom provider
sakura-code config add-provider my-api --base-url https://api.example.com/v1

# Remove a provider
sakura-code config remove-provider my-api
```

### 3️⃣ Config File

Config is stored in `~/.sakura-code/config.json`:

```json
{
  "providers": {
    "deepseek": {
      "baseURL": "https://api.deepseek.com/v1",
      "apiKey": "sk-...",
      "models": ["deepseek-chat", "deepseek-coder"]
    },
    "openai": {
      "baseURL": "https://api.openai.com/v1",
      "apiKey": "sk-..."
    }
  },
  "defaultProvider": "deepseek",
  "defaultModel": "deepseek-chat"
}
```

### 4️⃣ Environment Variables

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://api.deepseek.com/v1
export OPENAI_MODEL=deepseek-chat
```

### 5️⃣ .env File

Create a `.env` file in your project directory:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=deepseek-chat
```

## 🧠 Context Management

Sakura Code intelligently manages context windows:

```bash
# View context usage with progress bar
/context

# Set max context size manually
/context set 128k

# Clear and reset context
/context clear
```

**Features:**
- Auto-detect context window size based on model
- Sliding window compression when approaching limits
- Token counting with tiktoken
- Automatic conversation summarization

## 🎯 Skills System

Create reusable skill templates:

```markdown
<!-- ~/.sakura-code/skills/my-skill/SKILL.md -->
---
name: my-skill
description: A helpful skill
triggers:
  - keyword1
  - keyword2
tags:
  - utility
---

Instructions for the AI when this skill is activated...
```

**Skill Tools:**
```bash
# List all skills
skill_list

# Get skill info
skill_info name="my-skill"

# Enable/disable
skill_enable name="my-skill"
skill_disable name="my-skill"

# Create new skill
skill_create name="debug-helper" description="Help debug issues" content="..."

# Update skill
skill_update name="debug-helper" content="new instructions"

# Delete skill
skill_delete name="debug-helper" confirm=true
```

## 🤖 Sub-agent System

Spawn independent child agents for parallel tasks:

```bash
# Create sub-agent
subagent_spawn task="Analyze the auth module and suggest improvements"

# Check progress
subagent_status id="abc123"

# List all sub-agents
subagent_list

# Get result when done
subagent_result id="abc123"

# Cancel if needed
subagent_cancel id="abc123"
```

**Benefits:**
- Independent context windows
- Parallel task execution
- Isolated token consumption
- Automatic timeout handling

## 🔒 Security

The agent enforces these controls:

- **Blocked paths**: `/etc/passwd`, `/sys`, `/proc`, `~/.ssh`, etc.
- **Blocked commands**: `rm -rf /`, fork bombs, pipe-to-shell downloads
- **File size limit**: 10 MB per file
- **Output truncation**: 32,000 chars max per tool result
- **edit_file uniqueness**: refuses ambiguous replacements
- **Memory honesty**: Won't make up memories, admits uncertainty

## 🔌 MCP Extension

Add external tool servers:

```typescript
import { Agent } from "./agent/agent.js";
import { MCPHttpAdapter } from "./mcp/adapter.js";

const agent = new Agent({
  mcpServers: [
    {
      server: new MCPHttpAdapter({
        name: "github",
        url: "http://localhost:3001",
        headers: { Authorization: `Bearer ${token}` },
      }),
      prefix: "github__",  // tools appear as github__list_repos, etc.
    },
  ],
});
```

MCP servers must expose:
- `GET  /tools`          → `ToolDef[]`
- `POST /tools/:name`    → `{ args }` → `{ result: string }`

## 🗺️ Roadmap

- [x] Streaming output (SSE)
- [x] Provider configuration system
- [x] Docker tools
- [x] Database tools (SQLite, MySQL, PostgreSQL)
- [x] Long-term memory system with layers & tags
- [x] Skills system with triggers
- [x] Sub-agent system with parallel execution
- [x] Context management & compression
- [x] Full git toolkit (30+ tools)
- [x] Interactive setup wizard
- [x] Multi-language support
- [x] Token tracking & usage breakdown
- [x] Cute loading animations
- [ ] True semantic search with embeddings (OpenAI embeddings API)
- [ ] MCP server discovery & hot reload
- [ ] VSCode extension
- [ ] Web UI

## 📄 License

MIT

---

Made with 💕 by 絵梨衣 (Erii) & Sakura Code 🌸
