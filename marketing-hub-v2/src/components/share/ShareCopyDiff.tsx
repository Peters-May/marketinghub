"use client";

import { diffWords } from "@/lib/share/text-diff";

export function ShareCopyDiff({
  original,
  amended,
  label = "Copy changes",
}: {
  original: string;
  amended: string;
  label?: string;
}) {
  if (original.trim() === amended.trim()) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </p>
        <p className="mt-1 text-sm text-muted">Unchanged</p>
      </div>
    );
  }

  const ops = diffWords(original, amended);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
        {ops.map((op, i) => {
          if (op.type === "equal") {
            return <span key={i}>{op.text}</span>;
          }
          if (op.type === "delete") {
            return (
              <span
                key={i}
                className="bg-red-100 text-red-800 line-through decoration-red-700/80"
              >
                {op.text}
              </span>
            );
          }
          return (
            <span key={i} className="bg-emerald-100 text-emerald-900">
              {op.text}
            </span>
          );
        })}
      </p>
    </div>
  );
}
