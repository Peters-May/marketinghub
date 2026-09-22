"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { EmailCampaign } from "@/lib/types";
import { StatusPill } from "@/components/ui/StatusPill";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<EmailCampaign["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

function campaignDate(c: EmailCampaign): Date | null {
  const raw = c.scheduled_at || c.sent_at;
  if (!raw) return null;
  try {
    return parseISO(raw);
  } catch {
    return null;
  }
}

export function EmailCalendarPanel({
  campaigns,
  onOpenCampaign,
  onRefresh,
}: {
  campaigns: EmailCampaign[];
  onOpenCampaign: (id: string) => void;
  onRefresh: () => void;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, EmailCampaign[]>();
    for (const c of campaigns) {
      const d = campaignDate(c);
      if (!d) continue;
      const key = format(d, "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return map;
  }, [campaigns]);

  const unscheduled = campaigns.filter(
    (c) => c.status === "draft" && !c.scheduled_at && !c.sent_at
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary p-2"
            onClick={() => setCursor((d) => addMonths(d, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="font-display text-xl text-brand">
            {format(cursor, "MMMM yyyy")}
          </h2>
          <button
            type="button"
            className="btn-secondary p-2"
            onClick={() => setCursor((d) => addMonths(d, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button type="button" className="btn-secondary text-sm" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="bg-white px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted"
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const items = byDay.get(key) ?? [];
          const inMonth = isSameMonth(day, cursor);
          return (
            <div
              key={key}
              className={cn(
                "min-h-[88px] bg-white p-1.5",
                !inMonth && "bg-slate-50/80 text-muted",
                isSameDay(day, new Date()) && "ring-1 ring-inset ring-brand/30"
              )}
            >
              <div className="text-[11px] font-medium">{format(day, "d")}</div>
              <div className="mt-1 space-y-0.5">
                {items.slice(0, 3).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onOpenCampaign(c.id)}
                    className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] hover:bg-slate-100"
                    title={c.title}
                  >
                    <StatusPill
                      status={c.status}
                      label={STATUS_LABEL[c.status]}
                      className="mb-0.5"
                    />
                    <span className="block truncate text-brand">{c.title}</span>
                  </button>
                ))}
                {items.length > 3 ? (
                  <div className="text-[10px] text-muted">
                    +{items.length - 3} more
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {unscheduled.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium text-brand">Drafts (unscheduled)</h3>
          <ul className="space-y-1">
            {unscheduled.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="text-sm text-brand underline-offset-2 hover:underline"
                  onClick={() => onOpenCampaign(c.id)}
                >
                  {c.title}
                </button>
                {c.brief ? (
                  <span className="ml-2 text-xs text-muted line-clamp-1">
                    {c.brief}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
