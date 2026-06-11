import { spawnSync } from "node:child_process";

export function git(args: string[], cwd = process.cwd()): string {
  const r = spawnSync("git", args, { encoding: "utf8", cwd });
  const out = [r.stdout?.trim(), r.stderr?.trim()].filter(Boolean).join("\n");
  return out || `[exit ${r.status}]`;
}
