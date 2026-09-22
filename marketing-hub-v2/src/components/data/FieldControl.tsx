"use client";

import { useEffect, useState } from "react";
import type { FieldDef } from "@/lib/data/collections";
import { statusTone } from "@/lib/data/collections";
import { cn } from "@/lib/utils";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { plainTextFromHtml } from "@/lib/plain-text";

function toDateInput(value: unknown): string {
  if (value == null || value === "") return "";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDateTimeLocal(value: unknown): string {
  if (value == null || value === "") return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tagsToString(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value == null) return "";
  return String(value);
}

export function parseTypedValue(
  field: FieldDef,
  raw: string,
  previous?: unknown
): unknown {
  const trimmed = raw.trim();
  switch (field.type) {
    case "number": {
      if (trimmed === "") return null;
      const n = Number(trimmed);
      return Number.isNaN(n) ? null : n;
    }
    case "date":
      return trimmed || null;
    case "datetime":
      return trimmed ? new Date(trimmed).toISOString() : null;
    case "tags":
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        /* comma list */
      }
      return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    case "select":
      return trimmed;
    default:
      if (Array.isArray(previous)) {
        return trimmed
          ? trimmed.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
      }
      return raw;
  }
}

export function displayValue(field: FieldDef, value: unknown): string {
  if (value == null) return "";
  if (field.type === "tags") return tagsToString(value);
  if (field.type === "longtext") return plainTextFromHtml(String(value));
  if (field.type === "date") return toDateInput(value);
  if (field.type === "datetime") {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function LongTextFieldControl({
  fieldKey,
  value,
  onCommit,
  compact,
}: {
  fieldKey: string;
  value: unknown;
  onCommit: (next: unknown) => void;
  compact?: boolean;
}) {
  const remote = value == null ? "" : String(value);
  const [local, setLocal] = useState(remote);

  useEffect(() => {
    setLocal(remote);
  }, [fieldKey, remote]);

  return (
    <RichTextEditor
      value={local}
      onChange={setLocal}
      onBlur={() => {
        if (local !== remote) onCommit(local);
      }}
      minHeight={compact ? "64px" : "88px"}
      compact={compact}
      className="min-w-[220px]"
    />
  );
}

function optionLabel(field: FieldDef, value: string): string {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}

export function FieldControl({
  field,
  value,
  onCommit,
  compact,
}: {
  field: FieldDef;
  value: unknown;
  onCommit: (next: unknown) => void;
  compact?: boolean;
}) {
  const locked = field.locked || field.type === "readonly";
  const inputClass = cn(
    "field text-xs",
    compact ? "min-h-[34px] min-w-[140px] py-1.5" : "min-w-[160px]"
  );

  if (locked) {
    if (field.type === "select" && value) {
      return (
        <span
          className={cn(
            "inline-flex max-w-[200px] truncate rounded-full border px-2.5 py-0.5 text-xs font-medium",
            statusTone(String(value))
          )}
          title={String(value)}
        >
          {optionLabel(field, String(value))}
        </span>
      );
    }
    return (
      <span className="block max-w-[220px] truncate px-2 py-1.5 text-xs text-muted">
        {displayValue(field, value) || "—"}
      </span>
    );
  }

  if (field.type === "select" && field.options?.length) {
    const current = value == null ? "" : String(value);
    const known = field.options.some((o) => o.value === current);
    return (
      <div className="flex min-w-[150px] flex-col gap-1">
        {current ? (
          <span
            className={cn(
              "inline-flex w-fit max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] font-medium",
              statusTone(current)
            )}
          >
            {optionLabel(field, current)}
          </span>
        ) : null}
        <SearchSelect
          className={inputClass}
          value={current}
          allowEmpty
          emptyLabel="—"
          allowCreate={field.key === "category"}
          searchPlaceholder={
            field.key === "category" ? "Search or add a category…" : "Search…"
          }
          noResultsLabel={
            field.key === "category"
              ? "No matches — add it as a new category"
              : "No matches"
          }
          createLabel={(query) => `Add “${query}”`}
          options={[
            ...field.options,
            ...(current && !known
              ? [{ value: current, label: `${current} (custom)` }]
              : []),
          ]}
          onChange={(next) => onCommit(next || null)}
        />
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <input
        type="date"
        className={inputClass}
        value={toDateInput(value)}
        onChange={(e) => onCommit(e.target.value || null)}
      />
    );
  }

  if (field.type === "datetime") {
    return (
      <input
        type="datetime-local"
        className={inputClass}
        value={toDateTimeLocal(value)}
        onChange={(e) =>
          onCommit(e.target.value ? new Date(e.target.value).toISOString() : null)
        }
      />
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        className={cn(inputClass, "w-24")}
        value={value == null || value === "" ? "" : String(value)}
        onChange={(e) => {
          const v = e.target.value;
          onCommit(v === "" ? null : Number(v));
        }}
      />
    );
  }

  if (field.type === "url" || field.type === "email") {
    return (
      <input
        type={field.type}
        className={cn(inputClass, "min-w-[180px]")}
        defaultValue={value == null ? "" : String(value)}
        key={`${field.key}-${String(value)}`}
        onBlur={(e) => {
          const next = e.target.value;
          if (next === (value == null ? "" : String(value))) return;
          onCommit(next);
        }}
      />
    );
  }

  if (field.type === "tags") {
    if (field.options?.length) {
      const selected = Array.isArray(value)
        ? value.map(String)
        : tagsToString(value)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
      const selectedSet = new Set(selected);
      return (
        <div
          className={cn(
            "flex min-w-[200px] max-w-[320px] flex-wrap gap-1 py-0.5",
            compact && "max-w-[240px]"
          )}
        >
          {field.options.map((o) => {
            const checked = selectedSet.has(o.value);
            return (
              <label
                key={o.value}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]",
                  checked
                    ? "border-brand/40 bg-brand/10"
                    : "border-border bg-white text-muted"
                )}
              >
                <input
                  type="checkbox"
                  className="accent-[var(--brand)]"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((v) => v !== o.value)
                      : [...selected, o.value];
                    onCommit(next);
                  }}
                />
                {o.label}
              </label>
            );
          })}
        </div>
      );
    }
    return (
      <input
        type="text"
        className={cn(inputClass, "min-w-[160px]")}
        placeholder="tag1, tag2"
        defaultValue={tagsToString(value)}
        key={`${field.key}-${tagsToString(value)}`}
        onBlur={(e) => {
          const next = parseTypedValue(field, e.target.value, value);
          onCommit(next);
        }}
      />
    );
  }

  if (field.type === "longtext") {
    return (
      <LongTextFieldControl
        fieldKey={field.key}
        value={value}
        onCommit={onCommit}
        compact={compact}
      />
    );
  }

  return (
    <input
      type="text"
      className={cn(inputClass, "min-w-[160px]")}
      defaultValue={value == null ? "" : String(value)}
      key={`${field.key}-${String(value)}`}
      onBlur={(e) => {
        if (e.target.value === (value == null ? "" : String(value))) return;
        onCommit(e.target.value);
      }}
    />
  );
}

export function BulkValueControl({
  field,
  value,
  onChange,
}: {
  field: FieldDef | null;
  value: string;
  onChange: (next: string) => void;
}) {
  if (!field) {
    return (
      <input
        className="field"
        value={value}
        placeholder="Choose a field first"
        disabled
        onChange={() => undefined}
      />
    );
  }

  if (field.type === "select" && field.options?.length) {
    return (
      <SearchSelect
        value={value}
        allowEmpty
        emptyLabel="—"
        allowCreate={field.key === "category"}
        searchPlaceholder={
          field.key === "category" ? "Search or add a category…" : "Search…"
        }
        noResultsLabel={
          field.key === "category"
            ? "No matches — add it as a new category"
            : "No matches"
        }
        createLabel={(query) => `Add “${query}”`}
        options={field.options}
        onChange={onChange}
      />
    );
  }

  if (field.type === "date") {
    return (
      <input
        type="date"
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.type === "datetime") {
    return (
      <input
        type="datetime-local"
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.type === "longtext") {
    return (
      <RichTextEditor
        value={value}
        onChange={onChange}
        minHeight="72px"
        compact
      />
    );
  }

  return (
    <input
      type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
      className="field"
      value={value}
      placeholder={
        field.type === "tags" ? "tag1, tag2" : "Value for all selected rows"
      }
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
