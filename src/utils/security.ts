import { resolve, normalize } from "node:path";
import type { SecurityPolicy } from "../types.js";

// ─── Default Security Policy ──────────────────────────────────────────────────
export const DEFAULT_POLICY: SecurityPolicy = {
  blockedPaths: [
    "/etc/passwd", "/etc/shadow", "/etc/sudoers",
    "/etc/hosts", "/etc/crontab",
    "/sys", "/proc",
    "/boot", "/dev",
    "~/.ssh", "~/.gnupg",
    "/var/log",
  ],
  blockedCommands: [
    // destructive filesystem
    "rm -rf /", "rm -rf ~", "rm -rf /*",
    "mkfs", "dd if=", ":(){:|:&};:",   // fork bomb
    // privilege escalation
    "sudo su", "chmod 777", "chown root",
    // network exfil
    "curl.*|.*bash", "wget.*|.*bash", "curl.*|.*sh", "wget.*|.*sh",
    // shell injection sentinels
    "eval $(", "`rm", "$(rm",
  ],
  maxFileSize: 10 * 1024 * 1024,   // 10 MB
  maxOutputSize: 32_000,            // chars
};

// ─── Path Guard ───────────────────────────────────────────────────────────────
export function assertSafePath(
  inputPath: string,
  policy: SecurityPolicy = DEFAULT_POLICY
): string {
  const abs = resolve(inputPath.replace(/^~/, process.env.HOME ?? "~"));
  const blocked = policy.blockedPaths ?? [];

  for (const b of blocked) {
    const blockedAbs = resolve(b.replace(/^~/, process.env.HOME ?? "~"));
    if (abs === blockedAbs || abs.startsWith(blockedAbs + "/")) {
      throw new Error(`Access denied: path '${abs}' is protected by security policy`);
    }
  }

  if (policy.allowedPaths?.length) {
    const allowed = policy.allowedPaths.map((p) =>
      resolve(p.replace(/^~/, process.env.HOME ?? "~"))
    );
    if (!allowed.some((a) => abs === a || abs.startsWith(a + "/"))) {
      throw new Error(`Access denied: path '${abs}' is outside allowed directories`);
    }
  }

  return abs;
}

// ─── Command Guard ────────────────────────────────────────────────────────────
export function assertSafeCommand(
  command: string,
  policy: SecurityPolicy = DEFAULT_POLICY
): void {
  const lower = command.toLowerCase();
  // Normalize whitespace to prevent bypass via "rm  -rf  /"
  const normalized = lower.replace(/\s+/g, " ");
  const blocked = policy.blockedCommands ?? [];

  for (const pattern of blocked) {
    const patLower = pattern.toLowerCase();
    // Use regex matching for patterns containing .* (regex-style wildcards)
    if (patLower.includes(".*")) {
      if (new RegExp(patLower).test(normalized)) {
        throw new Error(
          `Blocked command detected: '${pattern}' is not permitted for safety reasons`
        );
      }
    } else {
      if (normalized.includes(patLower) || lower.includes(patLower)) {
        throw new Error(
          `Blocked command detected: '${pattern}' is not permitted for safety reasons`
        );
      }
    }
  }

  // Extra: block unquoted glob deletion
  if (/rm\s+(-[a-z]*\s+)*\//.test(command)) {
    throw new Error("Blocked command: rm on root paths is not permitted");
  }
}

// ─── Output Truncation ────────────────────────────────────────────────────────
export function truncate(output: string, max = DEFAULT_POLICY.maxOutputSize!): string {
  if (output.length <= max) return output;
  const half = Math.floor(max / 2);
  return (
    output.slice(0, half) +
    `\n\n... [TRUNCATED ${output.length - max} chars] ...\n\n` +
    output.slice(-half)
  );
}
