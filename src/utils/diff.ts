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
  
  // 找出变更的行范围
  // 简单策略：找到第一个和最后一个不同的行
  let firstDiff = -1;
  let lastDiffOld = -1;
  let lastDiffNew = -1;
  
  const minLen = Math.min(oldLines.length, newLines.length);
  
  // 从前往后找第一个不同的行
  for (let i = 0; i < minLen; i++) {
    if (oldLines[i] !== newLines[i]) {
      firstDiff = i;
      break;
    }
  }
  
  // 如果没有差异，返回空结果
  if (firstDiff === -1 && oldLines.length === newLines.length) {
    return {
      file: filePath,
      lines: [],
      stats: { additions: 0, deletions: 0 },
    };
  }
  
  // 从后往前找最后一个不同的行
  for (let i = 1; i <= minLen; i++) {
    if (oldLines[oldLines.length - i] !== newLines[newLines.length - i]) {
      lastDiffOld = oldLines.length - i;
      lastDiffNew = newLines.length - i;
      break;
    }
  }
  
  // 如果只有一个差异点
  if (firstDiff === -1) {
    // 文件长度不同，差异在末尾
    firstDiff = minLen;
    lastDiffOld = oldLines.length - 1;
    lastDiffNew = newLines.length - 1;
  }
  
  // 生成 diff 行（只包含变更部分）
  const contextBefore = 2;
  const contextAfter = 2;
  
  // 变更前的上下文
  const startContext = Math.max(0, firstDiff - contextBefore);
  for (let i = startContext; i < firstDiff; i++) {
    diffLines.push({
      type: "context",
      content: oldLines[i],
      oldLine: i + 1,
      newLine: i + 1,
    });
  }
  
  // 删除的行
  for (let i = firstDiff; i <= lastDiffOld; i++) {
    diffLines.push({
      type: "remove",
      content: oldLines[i],
      oldLine: i + 1,
    });
    deletions++;
  }
  
  // 新增的行
  for (let i = firstDiff; i <= lastDiffNew; i++) {
    diffLines.push({
      type: "add",
      content: newLines[i],
      newLine: i + 1,
    });
    additions++;
  }
  
  // 变更后的上下文
  const endContext = Math.min(oldLines.length, lastDiffOld + contextAfter + 1);
  for (let i = lastDiffOld + 1; i < endContext; i++) {
    diffLines.push({
      type: "context",
      content: oldLines[i],
      oldLine: i + 1,
      newLine: i + 1,
    });
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
