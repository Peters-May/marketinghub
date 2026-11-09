export type DiffOp = {
  type: "equal" | "insert" | "delete";
  text: string;
};

/** Split on whitespace while keeping the separators. */
function tokenize(text: string): string[] {
  if (!text) return [];
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

/**
 * Word-level Myers-lite LCS diff for short marketing copy.
 * Good enough for captions/subjects without a heavy dependency.
 */
export function diffWords(original: string, amended: string): DiffOp[] {
  const a = tokenize(original);
  const b = tokenize(amended);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pushOp(ops, "equal", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushOp(ops, "delete", a[i]);
      i++;
    } else {
      pushOp(ops, "insert", b[j]);
      j++;
    }
  }
  while (i < n) {
    pushOp(ops, "delete", a[i++]);
  }
  while (j < m) {
    pushOp(ops, "insert", b[j++]);
  }
  return ops;
}

function pushOp(ops: DiffOp[], type: DiffOp["type"], text: string) {
  const last = ops[ops.length - 1];
  if (last && last.type === type) {
    last.text += text;
    return;
  }
  ops.push({ type, text });
}

export function escapeDiffHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline HTML suitable for Hub UI and marketing email. */
export function diffWordsToHtml(original: string, amended: string): string {
  if (original === amended) {
    return `<span>${escapeDiffHtml(amended || "(unchanged)")}</span>`;
  }
  return diffWords(original, amended)
    .map((op) => {
      const text = escapeDiffHtml(op.text);
      if (op.type === "equal") return `<span>${text}</span>`;
      if (op.type === "delete") {
        return `<span style="color:#9B1C1C;text-decoration:line-through;background:#FEE2E2;">${text}</span>`;
      }
      return `<span style="color:#065F46;background:#D1FAE5;">${text}</span>`;
    })
    .join("");
}

export function hasCopyChanges(original: string, amended: string): boolean {
  return original.trim() !== amended.trim();
}
