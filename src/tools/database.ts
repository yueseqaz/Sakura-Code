import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { truncate } from "../utils/security.js";
import type { ToolHandler, ToolDef } from "../types.js";

// ─── sqlite_query ─────────────────────────────────────────────────────────────
export const sqliteQueryTool: ToolHandler = {
  name: "sqlite_query",
  schema: {
    type: "function",
    function: {
      name: "sqlite_query",
      description:
        "Execute a SQL query on a SQLite database. " +
        "Use for SELECT queries to read data, or INSERT/UPDATE/DELETE to modify data. " +
        "Returns results as formatted text.",
      parameters: {
        type: "object",
        required: ["database", "query"],
        properties: {
          database: { type: "string", description: "Path to SQLite database file" },
          query: { type: "string", description: "SQL query to execute" },
          max_rows: { type: "number", description: "Maximum rows to return (default: 100)" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { database, query, max_rows = 100 } = args as {
      database: string;
      query: string;
      max_rows?: number;
    };

    if (!existsSync(database)) {
      return `Error: Database file not found: ${database}`;
    }

    // Use sqlite3 command line
    const cmd = [
      "sqlite3",
      "-header",
      "-column",
      "-cmd", `.limit rows ${max_rows}`,
      database,
      query,
    ];

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 30_000 });
    if (result.error) {
      if (result.error.message.includes("ENOENT")) {
        return "Error: sqlite3 command not found. Please install SQLite3 first.";
      }
      return `Error: ${result.error.message}`;
    }
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return truncate(result.stdout || "Query executed successfully (no output).", 32_000);
  },
};

// ─── sqlite_tables ────────────────────────────────────────────────────────────
export const sqliteTablesTool: ToolHandler = {
  name: "sqlite_tables",
  schema: {
    type: "function",
    function: {
      name: "sqlite_tables",
      description: "List all tables in a SQLite database with their schemas.",
      parameters: {
        type: "object",
        required: ["database"],
        properties: {
          database: { type: "string", description: "Path to SQLite database file" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { database } = args as { database: string };

    if (!existsSync(database)) {
      return `Error: Database file not found: ${database}`;
    }

    const query = "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;";
    const cmd = ["sqlite3", "-header", "-column", database, query];

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 30_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return result.stdout || "No tables found.";
  },
};

// ─── sqlite_schema ────────────────────────────────────────────────────────────
export const sqliteSchemaTool: ToolHandler = {
  name: "sqlite_schema",
  schema: {
    type: "function",
    function: {
      name: "sqlite_schema",
      description: "Get the schema (CREATE TABLE statement) for a specific table.",
      parameters: {
        type: "object",
        required: ["database", "table"],
        properties: {
          database: { type: "string", description: "Path to SQLite database file" },
          table: { type: "string", description: "Table name" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { database, table } = args as { database: string; table: string };

    if (!existsSync(database)) {
      return `Error: Database file not found: ${database}`;
    }

    const query = `SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}';`;
    const cmd = ["sqlite3", database, query];

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 30_000 });
    if (result.error) return `Error: ${result.error.message}`;
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return result.stdout || `Table '${table}' not found.`;
  },
};

// ─── mysql_query ──────────────────────────────────────────────────────────────
export const mysqlQueryTool: ToolHandler = {
  name: "mysql_query",
  schema: {
    type: "function",
    function: {
      name: "mysql_query",
      description:
        "Execute a SQL query on a MySQL database. " +
        "Requires connection details in environment or parameters.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "SQL query to execute" },
          host: { type: "string", description: "MySQL host (default: localhost)" },
          port: { type: "number", description: "MySQL port (default: 3306)" },
          user: { type: "string", description: "MySQL user (default: root)" },
          password: { type: "string", description: "MySQL password" },
          database: { type: "string", description: "Database name" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { query, host = "localhost", port = 3306, user = "root", password, database } = args as {
      query: string;
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      database?: string;
    };

    const cmd = ["mysql", `-h${host}`, `-P${port}`, `-u${user}`];
    if (password) cmd.push(`-p${password}`);
    if (database) cmd.push(database);
    cmd.push("-e", query);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 30_000 });
    if (result.error) {
      if (result.error.message.includes("ENOENT")) {
        return "Error: mysql command not found. Please install MySQL client first.";
      }
      return `Error: ${result.error.message}`;
    }
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return truncate(result.stdout || "Query executed successfully.", 32_000);
  },
};

// ─── postgres_query ───────────────────────────────────────────────────────────
export const postgresQueryTool: ToolHandler = {
  name: "postgres_query",
  schema: {
    type: "function",
    function: {
      name: "postgres_query",
      description:
        "Execute a SQL query on a PostgreSQL database. " +
        "Requires connection details in environment or parameters.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "SQL query to execute" },
          host: { type: "string", description: "PostgreSQL host (default: localhost)" },
          port: { type: "number", description: "PostgreSQL port (default: 5432)" },
          user: { type: "string", description: "PostgreSQL user (default: postgres)" },
          password: { type: "string", description: "PostgreSQL password" },
          database: { type: "string", description: "Database name" },
        },
      },
    },
  } satisfies ToolDef,

  async execute(args) {
    const { query, host = "localhost", port = 5432, user = "postgres", password, database } = args as {
      query: string;
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      database?: string;
    };

    const env: Record<string, string> = { ...process.env as Record<string, string> };
    if (password) env.PGPASSWORD = password;

    const cmd = ["psql", `-h`, host, `-p`, String(port), `-U`, user];
    if (database) cmd.push(database);
    cmd.push("-c", query);

    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: 30_000, env });
    if (result.error) {
      if (result.error.message.includes("ENOENT")) {
        return "Error: psql command not found. Please install PostgreSQL client first.";
      }
      return `Error: ${result.error.message}`;
    }
    if (result.status !== 0) return `Error: ${result.stderr}`;
    return truncate(result.stdout || "Query executed successfully.", 32_000);
  },
};
