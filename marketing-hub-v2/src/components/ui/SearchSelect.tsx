"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  allowEmpty = false,
  disabled = false,
  className,
  id,
  "aria-label": ariaLabel,
  searchPlaceholder = "Search…",
  noResultsLabel = "No matches",
  allowCreate = false,
  onCreate,
  createLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  /** Shown on the trigger when no value is selected. */
  placeholder?: string;
  /** Label for the empty / clear option when allowEmpty is true. */
  emptyLabel?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  /** Offer adding the current search text when it is not already an option. */
  allowCreate?: boolean;
  /** Called when the typed value is added. If omitted, the query is selected as the value. */
  onCreate?: (query: string) => void | Promise<void>;
  createLabel?: (query: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const searchId = useId();

  const allOptions = useMemo(() => {
    const seen = new Set<string>();
    const merged: SearchSelectOption[] = [];
    for (const opt of options) {
      if (seen.has(opt.value)) continue;
      seen.add(opt.value);
      merged.push(opt);
    }
    if (value && !seen.has(value)) {
      merged.unshift({ value, label: value });
    }
    return merged;
  }, [options, value]);

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    return allOptions.find((o) => o.value === value)?.label ?? value;
  }, [allOptions, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q)
    );
  }, [allOptions, query]);

  const createQuery = query.trim();
  const createQueryKey = createQuery.toLowerCase();

  function optionEqualsQuery(opt: SearchSelectOption, q: string) {
    if (!q) return false;
    const label = opt.label.toLowerCase();
    const val = opt.value.toLowerCase();
    return val === q || label === q || label.startsWith(`${q} ·`);
  }

  const canCreate = Boolean(
    allowCreate &&
      createQuery &&
      !allOptions.some((o) => optionEqualsQuery(o, createQueryKey))
  );

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCreateError("");
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  function select(next: string) {
    onChange(next);
    setOpen(false);
  }

  function exactMatch() {
    if (!createQueryKey) return undefined;
    return filtered.find(
      (o) => !o.disabled && optionEqualsQuery(o, createQueryKey)
    );
  }

  async function handleCreate() {
    if (!canCreate || creating) return;
    if (!onCreate) {
      select(createQuery);
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      await onCreate(createQuery);
      setOpen(false);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Could not add this option"
      );
    } finally {
      setCreating(false);
    }
  }

  const triggerLabel =
    value ? selectedLabel : (placeholder ?? emptyLabel ?? "Select…");

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        className={cn(
          "field flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60",
          open && "border-[var(--accent)] shadow-[0_0_0_3px_rgba(42,143,158,0.15)]",
          className
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span
          className={cn(
            "truncate",
            value ? "text-foreground" : "text-muted"
          )}
        >
          {triggerLabel}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                id={searchId}
                type="search"
                className="field py-2 pl-8 text-sm"
                value={query}
                placeholder={searchPlaceholder}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCreateError("");
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const exact = exactMatch();
                  if (exact) {
                    select(exact.value);
                    return;
                  }
                  if (canCreate) {
                    void handleCreate();
                    return;
                  }
                  const first = filtered.find((o) => !o.disabled);
                  if (first) select(first.value);
                }}
              />
            </div>
          </div>
          <div
            id={listId}
            role="listbox"
            className="max-h-56 overflow-y-auto p-1"
          >
            {allowEmpty ? (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                  !value
                    ? "bg-brand/10 text-foreground"
                    : "text-muted hover:bg-sand hover:text-foreground"
                )}
                onClick={() => select("")}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center",
                    !value ? "text-brand" : "text-transparent"
                  )}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                {emptyLabel ?? "—"}
              </button>
            ) : null}
            {filtered.length === 0 && !canCreate ? (
              <p className="px-2.5 py-2 text-sm text-muted">{noResultsLabel}</p>
            ) : (
              filtered.map((opt) => {
                const selected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={opt.disabled}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                      opt.disabled
                        ? "cursor-not-allowed opacity-40"
                        : selected
                          ? "bg-brand/10 text-foreground"
                          : "text-muted hover:bg-sand hover:text-foreground"
                    )}
                    onClick={() => {
                      if (opt.disabled) return;
                      select(opt.value);
                    }}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center",
                        selected ? "text-brand" : "text-transparent"
                      )}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })
            )}
            {canCreate ? (
              <button
                type="button"
                role="option"
                className="mt-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-brand transition hover:bg-accent-soft disabled:opacity-60"
                disabled={creating}
                onClick={() => void handleCreate()}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                <span className="truncate">
                  {creating
                    ? "Adding…"
                    : (createLabel?.(createQuery) ??
                      `Add “${createQuery}”`)}
                </span>
              </button>
            ) : null}
            {createError ? (
              <p className="px-2.5 py-1.5 text-xs text-red-600">{createError}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
