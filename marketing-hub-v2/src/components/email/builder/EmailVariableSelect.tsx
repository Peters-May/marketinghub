"use client";

import { useState } from "react";
import { EMAIL_MERGE_FIELDS, withMergeFallback } from "@/lib/email/merge";
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
  const [fallback, setFallback] = useState("");
  const fields = EMAIL_MERGE_FIELDS.filter(
    (field) => includeLinks || field.kind === "contact"
  );
  const controls = (
    <span className={cn("flex flex-wrap items-center gap-1", label && "mt-1")}>
      <select
        className={cn(
          "input text-xs",
          label ? "min-w-0 flex-1" : "w-[9.5rem] shrink-0 py-1.5",
          className
        )}
        aria-label={label ? undefined : "Insert variable"}
        value=""
        disabled={disabled}
        onChange={(event) => {
          const token = event.target.value;
          if (token) onInsert(withMergeFallback(token, fallback));
        }}
      >
        <option value="">Variable…</option>
        {fields.map((field) => (
          <option key={field.token} value={field.token}>
            {field.label}
          </option>
        ))}
      </select>
      <input
        className={cn(
          "input text-xs",
          label ? "min-w-[7rem] flex-1" : "w-[6.5rem] shrink-0 py-1.5"
        )}
        aria-label="If blank, use"
        placeholder="If blank"
        title="Used when this contact has no value. A greeting then reads Dear subscriber."
        value={fallback}
        disabled={disabled}
        onChange={(event) => setFallback(event.target.value)}
      />
    </span>
  );

  if (!label) return controls;
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      {controls}
      <span className="mt-1 block text-xs text-muted">
        If blank is the stand-in. Greeting with subscriber sends Dear subscriber when there is no first name.
      </span>
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
