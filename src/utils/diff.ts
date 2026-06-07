// ─── Diff 可视化工具 ─────────────────────────────────────────────────────────

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
};

export interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffResult {
  file: string;
  lines: DiffLine[];
  stats: {
    additions: number;
    deletions: number;
  };
}

// ─── 生成 Diff（只显示变更部分）───────────────────────────────────────────────
export function generateDiff(
  filePath: string,
  oldContent: string,
  newContent: string
): DiffResult {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  
  const diffLines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  
  // 使用简单的 LCS 算法找出公共行
  const lcs = findLCS(oldLines, newLines);
  
  let oldIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;
  
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    // 如果当前行是 LCS 的一部分，标记为 context
    if (lcsIdx < lcs.length && oldIdx < oldLines.length && newIdx < newLines.length &&
        oldLines[oldIdx] === lcs[lcsIdx] && newLines[newIdx] === lcs[lcsIdx]) {
      diffLines.push({
        type: "context",
        content: oldLines[oldIdx],
        oldLine: oldIdx + 1,
        newLine: newIdx + 1,
      });
      oldIdx++;
      newIdx++;
      lcsIdx++;
    } else {
      // 删除的行
      if (oldIdx < oldLines.length && (lcsIdx >= lcs.length || oldLines[oldIdx] !== lcs[lcsIdx])) {
        diffLines.push({
          type: "remove",
          content: oldLines[oldIdx],
          oldLine: oldIdx + 1,
        });
        deletions++;
        oldIdx++;
      }
      // 新增的行
      if (newIdx < newLines.length && (lcsIdx >= lcs.length || newLines[newIdx] !== lcs[lcsIdx])) {
        diffLines.push({
          type: "add",
          content: newLines[newIdx],
          newLine: newIdx + 1,
        });
        additions++;
        newIdx++;
      }
    }
  }
  
  return {
    file: filePath,
    lines: diffLines,
    stats: { additions, deletions },
  };
}

// ─── 最长公共子序列 ────────────────────────────────────────────────────────────
function findLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // 回溯找出 LCS
  const result: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return result;
}

// ─── 格式化 Diff 输出 ────────────────────────────────────────────────────────
export function formatDiff(result: DiffResult, contextLines: number = 3): string {
  const { file, lines, stats } = result;
  
  // 找出变更位置
  const changedIndices = new Set<number>();
  lines.forEach((line, i) => {
    if (line.type === "add" || line.type === "remove") {
      // 添加周围的上下文行
      for (let j = Math.max(0, i - contextLines); j <= Math.min(lines.length - 1, i + contextLines); j++) {
        changedIndices.add(j);
      }
    }
  });
  
  // 生成输出
  const output: string[] = [];
  
  // 文件头
  output.push(`${COLORS.bold}${COLORS.cyan}┌─ ${file}${COLORS.reset}`);
  output.push(`${COLORS.bold}${COLORS.cyan}│${COLORS.reset} ${COLORS.green}+${stats.additions}${COLORS.reset} ${COLORS.red}-${stats.deletions}${COLORS.reset}`);
  output.push(`${COLORS.bold}${COLORS.cyan}├─────────────────────────────────────${COLORS.reset}`);
  
  // 内容
  let lastShownIndex = -1;
  let skipShown = false;
  
  lines.forEach((line, i) => {
    if (!changedIndices.has(i)) {
      if (!skipShown) {
        output.push(`${COLORS.gray}│ ...${COLORS.reset}`);
        skipShown = true;
      }
      return;
    }
    
    skipShown = false;
    
    // 显示行号
    const lineNum = line.type === "add" 
      ? `  +${line.newLine}`.slice(-4)
      : line.type === "remove"
        ? `  -${line.oldLine}`.slice(-4)
        : `  ${line.oldLine}`.slice(-4);
    
    const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
    
    let coloredLine: string;
    switch (line.type) {
      case "add":
        coloredLine = `${COLORS.green}${prefix} ${line.content}${COLORS.reset}`;
        break;
      case "remove":
        coloredLine = `${COLORS.red}${prefix} ${line.content}${COLORS.reset}`;
        break;
      default:
        coloredLine = `${COLORS.gray}${prefix} ${line.content}${COLORS.reset}`;
    }
    
    output.push(`${COLORS.cyan}│${COLORS.reset} ${COLORS.dim}${lineNum}${COLORS.reset} ${coloredLine}`);
  });
  
  output.push(`${COLORS.bold}${COLORS.cyan}└─────────────────────────────────────${COLORS.reset}`);
  
  return output.join("\n");
}

// ─── 简化的 Diff 显示（只显示变更部分）────────────────────────────────────────
export function formatCompactDiff(result: DiffResult, maxLines: number = 20): string {
  const { file, lines, stats } = result;
  
  const output: string[] = [];
  
  // 文件头
  output.push(`📄 ${file} (+${stats.additions} -${stats.deletions})`);
  output.push("─".repeat(40));
  
  // 找出变更行的位置
  const changedIndices: number[] = [];
  lines.forEach((line, i) => {
    if (line.type === "add" || line.type === "remove") {
      changedIndices.push(i);
    }
  });
  
  if (changedIndices.length === 0) {
    output.push("(no changes)");
    return output.join("\n");
  }
  
  // 只显示变更行及其上下文（前后1行）
  const contextSize = 1;
  const shownIndices = new Set<number>();
  
  for (const idx of changedIndices) {
    for (let i = Math.max(0, idx - contextSize); i <= Math.min(lines.length - 1, idx + contextSize); i++) {
      shownIndices.add(i);
    }
  }
  
  // 按顺序显示
  let lastShown = -1;
  let truncated = false;
  let lineCount = 0;
  
  const sortedIndices = Array.from(shownIndices).sort((a, b) => a - b);
  
  for (const i of sortedIndices) {
    // 检查是否需要截断
    if (lineCount >= maxLines) {
      truncated = true;
      break;
    }
    
    // 显示省略号
    if (lastShown !== -1 && i > lastShown + 1) {
      output.push("...");
      lineCount++;
    }
    
    lastShown = i;
    const line = lines[i];
    const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
    output.push(`${prefix} ${line.content}`);
    lineCount++;
  }
  
  if (truncated) {
    output.push(`... (${changedIndices.length} changes total)`);
  }
  
  return output.join("\n");
}
