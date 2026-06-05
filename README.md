# 🌸 Sakura Code (サクラコード)

A cute but obsessive AI coding agent — similar to Claude Code, but with a yandere personality! ✨

Built on OpenAI Chat Completions API with a modular, extensible tool architecture.

```
User → LLM → Tool Dispatch → Parallel Execution → Streaming Results → LLM → ...
```

## ✨ Features

- **Streaming Output** — Real-time token-by-token display, like typing!
- **Modular Tool System** — Filesystem, Git, Web, Code Intelligence, Task Management
- **MCP Extension** — Connect external tool servers
- **Session Persistence** — Continue conversations across sessions
- **Security First** — Path guards, command blocklist, file size limits

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

## 📁 Project Structure

```
Sakura-Code/
├── src/
│   ├── index.ts              # CLI entry point (Commander)
│   ├── types.ts              # All TypeScript interfaces & types
│   │
│   ├── agent/
│   │   ├── agent.ts          # Core agent loop (LLM ↔ tool dispatch, streaming)
│   │   └── context.ts        # Session memory (persisted to JSON)
│   │
│   ├── tools/
│   │   ├── registry.ts       # Tool registry — aggregates all tools
│   │   ├── bash.ts           # bash — shell command execution
│   │   ├── filesystem.ts     # read_file, write_file, edit_file,
│   │   │                     #   list_files, search_files
│   │   ├── git.ts            # git_status, git_diff, git_commit
│   │   ├── index.ts          # project_index, semantic_search
│   │   ├── web.ts            # web_search, fetch_url
│   │   └── todo.ts           # todo_write, todo_read
│   │
│   ├── utils/
│   │   ├── logger.ts         # Colored terminal output
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

Create a `.env` file:

```bash
# Required
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Optional: use a different base URL (e.g. DeepSeek, Anthropic, Ollama)
# OPENAI_BASE_URL=https://api.deepseek.com/v1
# OPENAI_BASE_URL=https://api.anthropic.com/v1
# OPENAI_BASE_URL=http://localhost:11434/v1

# Optional: disable color output
# NO_COLOR=1
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
- [ ] True semantic search with embeddings (OpenAI embeddings API)
- [ ] MCP server discovery & hot reload
- [ ] Multi-agent orchestration (subagents)
- [ ] VSCode extension
- [ ] Web UI

## 📄 License

MIT

---

Made with 💕 by Sakura Code
