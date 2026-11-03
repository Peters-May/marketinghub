"use client";

import { useMemo, useState } from "react";
import type { AssistantReview, AssistantReviewOutcome } from "@/lib/types";
import { EmptyState } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";

const OUTCOME_FILTERS: Array<{ id: "all" | AssistantReviewOutcome | "down"; label: string }> = [
  { id: "all", label: "All" },
  { id: "down", label: "Thumbs down" },
  { id: "failed", label: "Failed" },
  { id: "dismissed", label: "Dismissed" },
  { id: "confirmed", label: "Confirmed" },
  { id: "previewed", label: "Previewed" },
  { id: "none", label: "Reply only" },
];

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function outcomeLabel(outcome: AssistantReviewOutcome) {
  if (outcome === "none") return "Reply only";
  return outcome.charAt(0).toUpperCase() + outcome.slice(1);
}

export function AssistantReviewsClient({
  initial,
}: {
  initial: AssistantReview[];
}) {
  const [filter, setFilter] = useState<(typeof OUTCOME_FILTERS)[number]["id"]>(
    "all"
  );

  const rows = useMemo(() => {
    return initial.filter((row) => {
      if (filter === "all") return true;
      if (filter === "down") return row.rating === "down";
      return row.outcome === filter;
    });
  }, [filter, initial]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {OUTCOME_FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition",
              filter === option.id
                ? "bg-brand text-white"
                : "bg-sand/70 text-muted hover:text-foreground"
            )}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No assistant asks yet"
          description="When someone uses the hub assistant, their prompts and outcomes will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-border bg-white px-4 py-3 shadow-soft"
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span className="font-medium text-brand">
                  {row.user_name || "Staff"}
                </span>
                <span>·</span>
                <span>{formatWhen(row.created_at)}</span>
                <span>·</span>
                <span className="rounded-md bg-sand/80 px-1.5 py-0.5 text-brand">
                  {row.mode}
                </span>
                <span className="rounded-md bg-sand/80 px-1.5 py-0.5 text-brand">
                  {outcomeLabel(row.outcome)}
                </span>
                {row.rating === "up" ? (
                  <span className="rounded-md bg-accent-soft/60 px-1.5 py-0.5 text-brand">
                    Thumbs up
                  </span>
                ) : null}
                {row.rating === "down" ? (
                  <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-red-700">
                    Thumbs down
                  </span>
                ) : null}
              </div>
              {row.user_prompt ? (
                <div className="mt-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Asked
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                    {row.user_prompt}
                  </p>
                </div>
              ) : null}
              {row.assistant_reply ? (
                <div className="mt-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Reply
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                    {row.assistant_reply}
                  </p>
                </div>
              ) : null}
              {row.command_text ? (
                <div className="mt-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Command
                  </p>
                  <pre className="mt-0.5 whitespace-pre-wrap rounded-xl bg-sand/50 px-3 py-2 font-sans text-xs text-foreground">
                    {row.command_text}
                  </pre>
                </div>
              ) : null}
              {row.error_message ? (
                <p className="mt-2 text-xs text-red-700">{row.error_message}</p>
              ) : null}
              {row.note ? (
                <p className="mt-2 text-xs text-muted">
                  Feedback note: {row.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
