"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { DashboardModel } from "@/lib/dashboard/build";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function ActionList({ model }: { model: DashboardModel }) {
  if (model.actions.length === 0) {
    return (
      <p className="px-5 py-8 text-sm text-muted md:px-6">
        Nothing assigned that needs doing right now.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {model.actions.map((action) => (
        <li key={action.key}>
          <Link
            href={action.href}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 transition hover:bg-sand/70 md:px-6"
          >
            <span className="min-w-0">
              <span className="block font-medium text-foreground">
                {action.title}
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {action.reason}
              </span>
            </span>
            {action.when ? (
              <span
                className={cn(
                  "shrink-0 text-xs font-medium",
                  action.tone === "overdue" ? "text-rose-700" : "text-muted"
                )}
              >
                {action.when}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RowList({
  title,
  rows,
  href,
  linkLabel,
}: {
  title: string;
  rows: DashboardModel["upcomingEvents"];
  href: string;
  linkLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="surface-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 md:px-6">
        <h2 className="font-display text-lg text-brand">{title}</h2>
        {linkLabel ? (
          <Link href={href} className="text-xs font-medium text-brand hover:underline">
            {linkLabel}
          </Link>
        ) : null}
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.key}>
            <Link
              href={row.href}
              className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm hover:bg-sand/70 md:px-6"
            >
              <span className="font-medium">{row.title}</span>
              <span className="text-xs text-muted">{row.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeDashboard({
  mine,
  everyone,
  canToggle,
}: {
  mine: DashboardModel;
  everyone: DashboardModel | null;
  canToggle: boolean;
}) {
  const [scope, setScope] = useState<"mine" | "everyone">("mine");
  const model = scope === "everyone" && everyone ? everyone : mine;

  return (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 md:px-6">
          <div>
            <h2 className="font-display text-xl text-brand">Needs doing</h2>
            <p className="mt-1 text-sm text-muted">
              Assigned tasks first, then deadlines and preparation still open.
            </p>
          </div>
          {canToggle && everyone ? (
            <div
              className="inline-flex rounded-2xl border border-border bg-white p-1"
              role="tablist"
              aria-label="Dashboard scope"
            >
              {(
                [
                  ["mine", "Mine"],
                  ["everyone", "Everyone"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={scope === id}
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-sm font-medium",
                    scope === id
                      ? "bg-brand text-white"
                      : "text-muted hover:bg-sand"
                  )}
                  onClick={() => setScope(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <ActionList model={model} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <RowList
          title="Coming up"
          rows={model.upcomingEvents}
          href="/app/events"
          linkLabel="Events"
        />
        <RowList
          title="Content deadlines"
          rows={model.contentDeadlines}
          href="/app/content"
          linkLabel="Content"
        />
      </div>

      {model.recentlyUpdated.length > 0 ? (
        <RowList
          title="Recently updated"
          rows={model.recentlyUpdated}
          href="/app"
          linkLabel=""
        />
      ) : null}

      {model.unowned.length > 0 ? (
        <RowList
          title="No owner yet"
          rows={model.unowned}
          href="/app/tasks"
          linkLabel="Tasks"
        />
      ) : null}

      {model.budget ? (
        <section className="surface-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg text-brand">Budget</h2>
            <Link href="/app/budget" className="text-xs font-medium text-brand hover:underline">
              Open budget
            </Link>
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-4">
            {(
              [
                ["Planned", model.budget.planned],
                ["Paid", model.budget.paid],
                ["Pending", model.budget.pending],
                ["Remaining", model.budget.remaining],
              ] as const
            ).map(([label, amount]) => (
              <div key={label}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {label}
                </dt>
                <dd className="mt-1 font-display text-2xl text-brand">
                  {money.format(amount)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
