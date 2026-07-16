export type DiffSegment = {
  type: "equal" | "insert" | "delete";
  text: string;
};

// 超过该 token 数则放弃逐 token LCS（O(n*m) 会过大），退化为整体替换。
const MAX_DIFF_TOKENS = 1500;

/**
 * 智能分词：西文按连续字母/数字成词，CJK（含假名）逐字，其余（空格、标点）逐字符。
 * 这样中文按字、英文按词对齐，中英混排都好看。
 */
export function tokenizeForDiff(text: string): string[] {
  return text.match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*|[\s\S]/gu) ?? [];
}

/** 计算 before → after 的逐 token 差异（LCS），相邻同类型合并。 */
export function diffTokens(before: string, after: string): DiffSegment[] {
  if (before === after) {
    return before ? [{ type: "equal", text: before }] : [];
  }
  const a = tokenizeForDiff(before);
  const b = tokenizeForDiff(after);

  if (a.length > MAX_DIFF_TOKENS || b.length > MAX_DIFF_TOKENS) {
    const segments: DiffSegment[] = [];
    if (before) segments.push({ type: "delete", text: before });
    if (after) segments.push({ type: "insert", text: after });
    return segments;
  }

  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS 长度（a[i:], b[j:]）
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const raw: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ type: "equal", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: "delete", text: a[i] });
      i += 1;
    } else {
      raw.push({ type: "insert", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    raw.push({ type: "delete", text: a[i] });
    i += 1;
  }
  while (j < m) {
    raw.push({ type: "insert", text: b[j] });
    j += 1;
  }

  const merged: DiffSegment[] = [];
  for (const segment of raw) {
    const last = merged.at(-1);
    if (last && last.type === segment.type) {
      last.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}
