import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolHandler, ToolDef, TodoWriteArgs, TodoReadArgs, TodoItem } from "../types.js";

const TODO_FILE = join(process.cwd(), ".sakura-code-todos.json");

function loadTodos(): TodoItem[] {
  if (!existsSync(TODO_FILE)) return [];
  try {
    return JSON.parse(readFileSync(TODO_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveTodos(todos: TodoItem[]) {
  writeFileSync(TODO_FILE, JSON.stringify(todos, null, 2));
}

// ─── todo_write ───────────────────────────────────────────────────────────────
export const todoWriteTool: ToolHandler = {
  name: "todo_write",
  schema: {
    type: "function",
    function: {
      name: "todo_write",
      description:
        "Create or update the TODO list for the current task. " +
        "Use to track subtasks on complex, multi-step work. " +
        "Pass the COMPLETE list each time (it replaces the existing list). " +
        "Mark items done by setting done: true.",
      parameters: {
        type: "object",
        required: ["todos"],
        properties: {
          todos: {
            type: "array",
            description: "Complete list of TODO items",
            items: {
              type: "object",
              required: ["id", "content", "done"],
              properties: {
                id: { type: "string", description: "Unique identifier (e.g. '1', 'setup-db')" },
                content: { type: "string", description: "Task description" },
                done: { type: "boolean", description: "Whether the task is complete" },
                priority: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                  description: "Task priority (default: medium)",
                },
              },
            },
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { todos } = args as unknown as TodoWriteArgs;

    const stamped: TodoItem[] = todos.map((t) => ({
      ...t,
      priority: t.priority ?? "medium",
      created_at: t.created_at ?? new Date().toISOString(),
    }));

    saveTodos(stamped);

    const done = stamped.filter((t) => t.done).length;
    const open = stamped.filter((t) => !t.done).length;

    const lines = stamped.map(
      (t) =>
        `${t.done ? "✓" : "○"} [${t.priority ?? "medium"}] ${t.content}`
    );

    return `TODO list updated (${done} done, ${open} open):\n${lines.join("\n")}`;
  },
};

// ─── todo_read ────────────────────────────────────────────────────────────────
export const todoReadTool: ToolHandler = {
  name: "todo_read",
  schema: {
    type: "function",
    function: {
      name: "todo_read",
      description:
        "Read the current TODO list. Call this at the start of a session or " +
        "when resuming work to understand pending tasks.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["all", "open", "done"],
            description: "Filter by status (default: all)",
          },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { filter = "all" } = args as unknown as TodoReadArgs;
    const todos = loadTodos();

    if (!todos.length) return "No TODOs found. Use todo_write to create tasks.";

    const filtered =
      filter === "open"
        ? todos.filter((t) => !t.done)
        : filter === "done"
        ? todos.filter((t) => t.done)
        : todos;

    if (!filtered.length) return `No ${filter} TODOs.`;

    const byPriority = ["high", "medium", "low"];
    const sorted = [...filtered].sort(
      (a, b) =>
        byPriority.indexOf(a.priority ?? "medium") -
        byPriority.indexOf(b.priority ?? "medium")
    );

    const lines = sorted.map(
      (t) =>
        `${t.done ? "✓" : "○"} [${t.priority ?? "medium"}] ${t.id}: ${t.content}`
    );

    const done = todos.filter((t) => t.done).length;
    return (
      `TODOs (${done}/${todos.length} complete):\n\n` +
      lines.join("\n")
    );
  },
};
