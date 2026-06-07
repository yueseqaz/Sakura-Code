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

// ─── 生成 Diff ───────────────────────────────────────────────────────────────
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
  
  // 简单的逐行比较（可以后续用 Myers 算法优化）
  const maxLen = Math.max(oldLines.length, newLines.length);
  
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    
    if (oldLine === undefined) {
      // 新增行
      diffLines.push({
        type: "add",
        content: newLine,
        newLine: i + 1,
      });
      additions++;
    } else if (newLine === undefined) {
      // 删除行
      diffLines.push({
        type: "remove",
        content: oldLine,
        oldLine: i + 1,
      });
      deletions++;
    } else if (oldLine !== newLine) {
      // 修改行（先删后加）
      diffLines.push({
        type: "remove",
        content: oldLine,
        oldLine: i + 1,
      });
      diffLines.push({
        type: "add",
        content: newLine,
        newLine: i + 1,
      });
      additions++;
      deletions++;
    } else {
      // 未变更行
      diffLines.push({
        type: "context",
        content: oldLine,
        oldLine: i + 1,
        newLine: i + 1,
      });
    }
  }
  
  return {
    file: filePath,
    lines: diffLines,
    stats: { additions, deletions },
  };
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
export function formatCompactDiff(result: DiffResult): string {
  const { file, lines, stats } = result;
  
  const output: string[] = [];
  
  // 文件头
  output.push(`\n📄 ${file} (${COLORS.green}+${stats.additions}${COLORS.reset} ${COLORS.red}-${stats.deletions}${COLORS.reset})`);
  output.push(`${COLORS.gray}${"─".repeat(40)}${COLORS.reset}`);
  
  // 只显示变更行
  lines.forEach((line) => {
    if (line.type === "add") {
      output.push(`${COLORS.green}+ ${line.content}${COLORS.reset}`);
    } else if (line.type === "remove") {
      output.push(`${COLORS.red}- ${line.content}${COLORS.reset}`);
    }
  });
  
  return output.join("\n");
}
