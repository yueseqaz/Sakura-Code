# 🌸 Sakura Code (サクラコード)

A cute but obsessive AI coding agent — similar to Claude Code, but with a yandere personality! ✨

Built on OpenAI Chat Completions API with a modular, extensible tool architecture.

```
User → LLM → Tool Dispatch → Parallel Execution → Streaming Results → LLM → ...
```

## ✨ Features

- **Streaming Output** — Real-time token-by-token display, like typing!
- **Modular Tool System** — Filesystem, Git, Web, Code Intelligence, Task Management, Docker, Database, Memory
- **Provider System** — Configure multiple API providers (DeepSeek, OpenAI, Ollama, etc.)
- **MCP Extension** — Connect external tool servers
- **Session Persistence** — Continue conversations across sessions
- **Long-term Memory** — Remember user preferences across sessions
- **Security First** — Path guards, command blocklist, file size limits
- **Sub-agent System** — Spawn independent child agents for parallel task execution

## 🚀 Quick Start

```bash
# Clone the repository
git clone git@github.com:yueseqaz/Sakura-Code.git
cd Sakura-Code

# Install dependencies
npm install

# Configure API key
cp .env.example .env
# Edit .env with your API key

# Run Sakura Code
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
# /clear  — reset context
# /save   — save session manually
# exit    — quit
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
| `memory_save` | Save user information to memory |
| `memory_recall` | Search through memories |
| `memory_list` | List all memories |
| `memory_delete` | Delete a memory |

### Phase 9 — Sub-agent

| Tool | Description |
|------|-------------|
| `subagent_spawn` | Create an independent child agent for parallel task execution |
| `subagent_status` | Check the status and progress of a sub-agent |
| `subagent_list` | List all sub-agents and their status |
| `subagent_result` | Get the result of a completed sub-agent |
| `subagent_cancel` | Cancel a running sub-agent |

**Sub-agent Features:**
- Independent context window — sub-agent internal tool calls won't bloat main agent's context
- Parallel execution — spawn multiple sub-agents for concurrent tasks
- Isolated token consumption — only final results are returned to main agent
- Status monitoring — track progress of running sub-agents

## 📁 Project Structure

```
Sakura-Code/
├── src/
│   ├── index.ts              # CLI entry point (Commander)
│   ├── types.ts              # All TypeScript interfaces & types
│   ├── config.ts             # Configuration management
│   │
│   ├── agent/
│   │   ├── agent.ts          # Core agent loop (LLM ↔ tool dispatch, streaming)
│   │   ├── context.ts        # Session memory (persisted to JSON)
│   │   └── subagent-manager.ts # Sub-agent lifecycle management
│   │
│   ├── tools/
│   │   ├── registry.ts       # Tool registry — aggregates all tools
│   │   ├── bash.ts           # bash — shell command execution
│   │   ├── filesystem.ts     # read_file, write_file, edit_file,
│   │   │                     #   list_files, search_files
│   │   ├── git.ts            # git_status, git_diff, git_commit
│   │   ├── index.ts          # project_index, semantic_search
│   │   ├── web.ts            # web_search, fetch_url
│   │   ├── todo.ts           # todo_write, todo_read
│   │   ├── docker.ts         # Docker management tools
│   │   ├── database.ts       # SQLite, MySQL, PostgreSQL queries
│   │   ├── memory.ts         # Long-term memory system
│   │   └── subagent.ts       # Sub-agent tools (spawn, status, result, etc.)
│   │
│   ├── utils/
│   │   ├── logger.ts         # Colored terminal output with loading animations
│   │   └── security.ts       # Path guards, command blocklist, truncation
│   │
│   └── mcp/
│       └── adapter.ts        # MCP server interface + HTTP adapter
│
├── .env.example
├── package.json
└── tsconfig.json
```

## ⚙️ Configuration

Sakura Code supports multiple configuration methods (in priority order):

### 1️⃣ Config Commands (Recommended)

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

### 2️⃣ Config File

Config is stored in `~/.sakura-code/config.json` (global) or `.sakura-code.json` (project):

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

### 3️⃣ Environment Variables

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://api.deepseek.com/v1
export OPENAI_MODEL=deepseek-chat
```

### 4️⃣ .env File

Create a `.env` file in your project directory:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=deepseek-chat
```

## 🔒 Security

The agent enforces these controls:

- **Blocked paths**: `/etc/passwd`, `/sys`, `/proc`, `~/.ssh`, etc.
- **Blocked commands**: `rm -rf /`, fork bombs, pipe-to-shell downloads
- **File size limit**: 10 MB per file
- **Output truncation**: 32,000 chars max per tool result
- **edit_file uniqueness**: refuses ambiguous replacements

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
- [x] Long-term memory system
- [x] Cute loading animations
- [x] Multi-agent orchestration (subagents)
- [ ] True semantic search with embeddings (OpenAI embeddings API)
- [ ] MCP server discovery & hot reload
- [ ] Multi-agent orchestration (subagents)
- [ ] VSCode extension
- [ ] Web UI

## 📄 License

MIT

---

Made with 💕 by Sakura Code
