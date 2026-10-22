"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  TASK_RELATED_TYPES,
  type FieldOption,
} from "@/lib/data/collections";
import type { TaskRelatedType } from "@/lib/types";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { cn } from "@/lib/utils";

export type TaskRelatedValue = {
  related_type: TaskRelatedType | "";
  related_id: string | null;
};

const HREF: Record<TaskRelatedType, string> = {
  content: "/app/content",
  theme: "/app/themes",
  sponsorship: "/app/partners",
  award: "/app/awards",
  event: "/app/events",
  asset: "/app/library",
};

const API: Record<
  TaskRelatedType,
  { url: string; listKey: string; labelKeys: string[] }
> = {
  content: {
    url: "/api/content",
    listKey: "content",
    labelKeys: ["title"],
  },
  theme: {
    url: "/api/themes",
    listKey: "themes",
    labelKeys: ["title"],
  },
  sponsorship: {
    url: "/api/sponsorships",
    listKey: "sponsorships",
    labelKeys: ["partner", "package_name", "title"],
  },
  award: {
    url: "/api/awards",
    listKey: "awards",
    labelKeys: ["title", "organisation"],
  },
  event: {
    url: "/api/events",
    listKey: "events",
    labelKeys: ["title"],
  },
  asset: {
    url: "/api/media/list?scope=all",
    listKey: "items",
    labelKeys: ["display_name", "name"],
  },
};

function labelFor(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return String(row.id ?? "Untitled");
}

export function relatedTypeLabel(type: TaskRelatedType | "" | null | undefined) {
  if (!type) return "";
  return TASK_RELATED_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function relatedHref(type: TaskRelatedType | "" | null | undefined) {
  if (!type) return null;
  return HREF[type] ?? null;
}

export function TaskRelatedFields({
  value,
  onChange,
  className,
}: {
  value: TaskRelatedValue;
  onChange: (next: TaskRelatedValue) => void;
  className?: string;
}) {
  const type = (value.related_type || "") as TaskRelatedType | "";
  const [options, setOptions] = useState<FieldOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!type) {
      setOptions([]);
      return;
    }
    const cfg = API[type];
    if (!cfg) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(cfg.url);
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, unknown>;
        const rows = Array.isArray(data[cfg.listKey])
          ? (data[cfg.listKey] as Record<string, unknown>[])
          : [];
        if (cancelled) return;
        const next = rows
          .map((row) => {
            const id = String(row.id ?? "").trim();
            if (!id) return null;
            let label = labelFor(row, cfg.labelKeys);
            if (type === "asset") {
              const category = String(row.category ?? "").trim();
              if (category && !label.includes(category)) {
                label = `${label} · ${category}`;
              }
            }
            return {
              value: id,
              label,
            };
          })
          .filter((o): o is FieldOption => Boolean(o))
          .sort((a, b) => a.label.localeCompare(b.label));
        setOptions(next);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type]);

  const selectedLabel = useMemo(() => {
    if (!value.related_id) return "";
    return (
      options.find((o) => o.value === value.related_id)?.label ??
      value.related_id
    );
  }, [options, value.related_id]);

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <div>
        <label className="label">Linked to</label>
        <SearchSelect
          value={type}
          allowEmpty
          emptyLabel="Nothing linked"
          options={TASK_RELATED_TYPES}
          onChange={(next) => {
            const relatedType = next as TaskRelatedType | "";
            onChange({
              related_type: relatedType,
              related_id: relatedType === type ? value.related_id : null,
            });
          }}
        />
      </div>
      <div>
        <label className="label">Record</label>
        <SearchSelect
          value={value.related_id ?? ""}
          disabled={!type || loading}
          allowEmpty
          emptyLabel={
            !type
              ? "Choose a type first"
              : loading
                ? "Loading…"
                : "Select record…"
          }
          placeholder={
            !type
              ? "Choose a type first"
              : loading
                ? "Loading…"
                : "Select record…"
          }
          options={[
            ...(value.related_id &&
            !options.some((o) => o.value === value.related_id)
              ? [{ value: value.related_id, label: `${selectedLabel} (missing)` }]
              : []),
            ...options,
          ]}
          onChange={(next) =>
            onChange({
              related_type: type,
              related_id: next || null,
            })
          }
        />
      </div>
    </div>
  );
}

export function TaskRelatedChip({
  related_type,
  related_id,
  className,
}: {
  related_type?: TaskRelatedType | "" | null;
  related_id?: string | null;
  className?: string;
}) {
  const type = related_type || "";
  const href = relatedHref(type);
  if (!type || !related_id || !href) return null;
  const label = relatedTypeLabel(type);
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full border border-border bg-white px-2 py-0.5 text-[11px] font-medium text-brand hover:border-brand/40",
        className
      )}
      title={`${label} record`}
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </Link>
  );
}
