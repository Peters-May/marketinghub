"use client";

import { EMAIL_MERGE_FIELDS } from "@/lib/email/merge";
import { cn } from "@/lib/utils";

export function EmailVariableSelect({
  disabled,
  includeLinks = false,
  label,
  className,
  onInsert,
}: {
  disabled?: boolean;
  includeLinks?: boolean;
  label?: string;
  className?: string;
  onInsert: (token: string) => void;
}) {
  const fields = EMAIL_MERGE_FIELDS.filter(
    (field) => includeLinks || field.kind === "contact"
  );
  const select = (
    <select
      className={cn(
        "input text-xs",
        label ? "mt-1 w-full" : "w-[9.5rem] shrink-0 py-1.5",
        className
      )}
      aria-label={label ? undefined : "Insert variable"}
      value=""
      disabled={disabled}
      onChange={(event) => {
        const token = event.target.value;
        if (token) onInsert(token);
      }}
    >
      <option value="">Variable…</option>
      {fields.map((field) => (
        <option key={field.token} value={field.token}>
          {field.label}
        </option>
      ))}
    </select>
  );

  if (!label) return select;
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      {select}
    </label>
  );
}

export function insertTokenAtSelection(
  value: string,
  token: string,
  start: number | null | undefined,
  end: number | null | undefined
): { next: string; caret: number } {
  const from = start ?? value.length;
  const to = end ?? from;
  return {
    next: `${value.slice(0, from)}${token}${value.slice(to)}`,
    caret: from + token.length,
  };
}
