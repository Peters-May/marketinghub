"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Award,
  CalendarDays,
  Check,
  CheckSquare,
  FileText,
  Inbox,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHubView } from "@/lib/hub-view";
import type {
  DashboardAction,
  DashboardModel,
  DashboardRow,
} from "@/lib/dashboard/build";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const DATE_LABEL = /^(\d{1,2})\s+([A-Za-z]{3})$/;

const KIND = {
  task: { label: "Task", icon: CheckSquare, mark: "bg-accent-soft text-brand" },
  content: { label: "Content", icon: FileText, mark: "bg-sky-50 text-sky-900" },
  event: { label: "Event", icon: CalendarDays, mark: "bg-[#e8eef6] text-brand" },
  award: { label: "Award", icon: Award, mark: "bg-amber-50 text-amber-900" },
  enquiry: { label: "Enquiry", icon: Inbox, mark: "bg-violet-50 text-violet-900" },
  email: { label: "Email", icon: Mail, mark: "bg-teal-50 text-teal-900" },
} as const;

const TONE = {
  overdue: {
    bar: "bg-danger",
    wash: "bg-rose-50",
    pill: "bg-rose-50 text-rose-800 ring-rose-200",
    label: "Overdue",
  },
  soon: {
    bar: "bg-amber-500",
    wash: "bg-amber-50",
    pill: "bg-amber-50 text-amber-900 ring-amber-200",
    label: "Due soon",
  },
  attention: {
    bar: "bg-accent",
    wash: "bg-accent-soft",
    pill: "bg-accent-soft text-brand ring-sky-200",
    label: "Needs a look",
  },
} as const;

type KindKey = keyof typeof KIND;

function kindOf(key: string) {
  const prefix = key.split(":")[0] as KindKey;
  return (
    KIND[prefix] ?? {
      label: "Item",
      icon: FileText,
      mark: "bg-sand text-muted",
    }
  );
}

function splitDetail(detail: string) {
  const bits = detail
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
  const dateIndex = bits.findIndex((bit) => DATE_LABEL.test(bit));
  if (dateIndex < 0) return { day: null, month: null, rest: bits };
  const match = bits[dateIndex].match(DATE_LABEL);
  return {
    day: match?.[1] ?? null,
    month: match?.[2] ?? null,
    rest: bits.filter((_, index) => index !== dateIndex),
  };
}

function KindMark({ itemKey }: { itemKey: string }) {
  const kind = kindOf(itemKey);
  const Icon = kind.icon;
  return (
    <span
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
        kind.mark
      )}
      aria-hidden
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

function DateMark({ day, month }: { day: string; month: string }) {
  return (
    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-accent-soft text-brand">
      <span className="font-display text-lg leading-none">{day}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide">
        {month}
      </span>
    </span>
  );
}

function Glance({ model }: { model: DashboardModel }) {
  const overdue = model.actions.filter((action) => action.tone === "overdue").length;
  const soon = model.actions.filter((action) => action.tone === "soon").length;
  const attention = model.actions.filter(
    (action) => action.tone === "attention"
  ).length;
  const tiles = [
    {
      label: "Overdue",
      value: overdue,
      href: "#needs-doing",
      className: "border-rose-200 bg-rose-50 text-rose-950",
      dot: "bg-danger",
    },
    {
      label: "Due soon",
      value: soon,
      href: "#needs-doing",
      className: "border-amber-200 bg-amber-50 text-amber-950",
      dot: "bg-amber-500",
    },
    {
      label: "Needs a look",
      value: attention,
      href: "#needs-doing",
      className: "border-sky-200 bg-accent-soft text-brand",
      dot: "bg-accent",
    },
    {
      label: "Coming up",
      value: model.upcomingEvents.length,
      href: "#coming-up",
      className: "border-border bg-white text-brand",
      dot: "bg-brand",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <a
          key={tile.label}
          href={tile.href}
          className={cn(
            "rounded-2xl border px-4 py-3.5 shadow-soft transition hover:-translate-y-0.5",
            tile.className
          )}
        >
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <span className={cn("h-2 w-2 rounded-full", tile.dot)} aria-hidden />
            {tile.label}
          </span>
          <span className="mt-1 block font-display text-3xl tabular-nums leading-none">
            {tile.value}
          </span>
        </a>
      ))}
    </div>
  );
}

function ActionList({ model }: { model: DashboardModel }) {
  if (model.actions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-success">
          <Check className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-sm text-muted">Nothing waiting right now.</p>
      </div>
    );
  }

  const groups = (["overdue", "soon", "attention"] as const)
    .map((tone) => ({
      tone,
      items: model.actions.filter((action) => action.tone === tone),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-5 p-3 sm:p-4">
      {groups.map((group) => {
        const tone = TONE[group.tone];
        return (
          <div key={group.tone}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className={cn("h-2 w-2 rounded-full", tone.bar)} aria-hidden />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {tone.label}
              </h3>
              <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">
                {group.items.length}
              </span>
            </div>
            <ul className="grid gap-2 lg:grid-cols-2">
              {group.items.map((action) => (
                <ActionCard key={action.key} action={action} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ActionCard({ action }: { action: DashboardAction }) {
  const kind = kindOf(action.key);
  const tone = TONE[action.tone];
  const Icon = kind.icon;
  return (
    <li>
      <Link
        href={action.href}
        className="flex h-full items-start gap-3 rounded-xl border border-border bg-white p-3 transition hover:border-accent/50 hover:shadow-soft"
      >
        <span
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            tone.wash,
            action.tone === "overdue"
              ? "text-danger"
              : action.tone === "soon"
                ? "text-amber-800"
                : "text-brand"
          )}
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium leading-snug text-foreground">
              {action.title}
            </span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-sand px-2 py-0.5 text-[11px] font-medium text-muted">
              {kind.label}
            </span>
            {action.when ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                  tone.pill
                )}
              >
                {action.when}
              </span>
            ) : null}
            <span className="text-xs text-muted">{action.reason}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

function Board({
  id,
  title,
  rows,
  href,
  linkLabel,
  empty,
}: {
  id: string;
  title: string;
  rows: DashboardRow[];
  href: string;
  linkLabel: string;
  empty: string;
}) {
  return (
    <section id={id} className="surface-card scroll-mt-6">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 md:px-6">
        <h2 className="font-display text-lg text-brand">{title}</h2>
        <Link href={href} className="text-xs font-medium text-accent hover:underline">
          {linkLabel}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted md:px-6">{empty}</p>
      ) : (
        <ul className="grid gap-2 p-3 sm:p-4">
          {rows.map((row) => {
            const { day, month, rest } = splitDetail(row.detail);
            return (
              <li key={row.key}>
                <Link
                  href={row.href}
                  className="flex items-center gap-3 rounded-xl bg-background px-3 py-2.5 transition hover:bg-accent-soft/60"
                >
                  {day && month ? (
                    <DateMark day={day} month={month} />
                  ) : (
                    <KindMark itemKey={row.key} />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {row.title}
                    </span>
                    {rest.length > 0 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {rest.map((bit) => (
                          <span
                            key={bit}
                            className="rounded-full bg-white px-2 py-0.5 text-[11px] text-muted ring-1 ring-border"
                          >
                            {bit}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BudgetPanel({ budget }: { budget: NonNullable<DashboardModel["budget"]> }) {
  const used = Math.max(0, budget.paid) + Math.max(0, budget.pending);
  const scale = Math.max(budget.planned, used, 1);
  const paidPct = (Math.max(0, budget.paid) / scale) * 100;
  const pendingPct = (Math.max(0, budget.pending) / scale) * 100;
  const over = budget.remaining < 0;
  const figures = [
    { label: "Planned", amount: budget.planned, swatch: "bg-brand" },
    { label: "Paid", amount: budget.paid, swatch: "bg-success" },
    { label: "Pending", amount: budget.pending, swatch: "bg-amber-500" },
    {
      label: over ? "Over plan" : "Remaining",
      amount: Math.abs(budget.remaining),
      swatch: over ? "bg-danger" : "bg-sand",
    },
  ];

  return (
    <section className="surface-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg text-brand">Budget</h2>
        <Link href="/app/budget" className="text-xs font-medium text-accent hover:underline">
          Open budget
        </Link>
      </div>
      <div
        className="mt-4 flex h-3 overflow-hidden rounded-full bg-sand"
        role="img"
        aria-label={`Paid ${money.format(budget.paid)}, pending ${money.format(budget.pending)}, ${over ? "over plan" : "remaining"} ${money.format(Math.abs(budget.remaining))}`}
      >
        <span className="h-full bg-success" style={{ width: `${paidPct}%` }} />
        <span className="h-full bg-amber-400" style={{ width: `${pendingPct}%` }} />
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label} className="rounded-xl bg-background px-3 py-3">
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <span className={cn("h-2 w-2 rounded-full", figure.swatch)} aria-hidden />
              {figure.label}
            </dt>
            <dd className="mt-1 font-display text-2xl text-brand">
              {money.format(figure.amount)}
            </dd>
          </div>
        ))}
      </dl>
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
  const { view } = useHubView();
  const allowEveryone = canToggle && view === "admin";
  const [scope, setScope] = useState<"mine" | "everyone">("mine");
  useEffect(() => {
    if (!allowEveryone && scope === "everyone") setScope("mine");
  }, [allowEveryone, scope]);
  const model = scope === "everyone" && allowEveryone && everyone ? everyone : mine;

  return (
    <div className="space-y-6">
      <Glance model={model} />

      <section id="needs-doing" className="surface-card scroll-mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 md:px-6">
          <h2 className="font-display text-xl text-brand">Needs doing</h2>
          {allowEveryone && everyone ? (
            <div
              className="inline-flex rounded-2xl border border-border bg-background p-1"
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
        <Board
          id="coming-up"
          title="Coming up"
          rows={model.upcomingEvents}
          href="/app/events"
          linkLabel="Events"
          empty="No events in the next few months."
        />
        <Board
          id="content-deadlines"
          title="Content deadlines"
          rows={model.contentDeadlines}
          href="/app/content"
          linkLabel="Content"
          empty="No deadlines in the next month."
        />
      </div>

      {model.recentlyUpdated.length > 0 ? (
        <section className="surface-card">
          <div className="border-b border-border px-5 py-3 md:px-6">
            <h2 className="font-display text-lg text-brand">Recently updated</h2>
          </div>
          <ul className="flex flex-wrap gap-2 p-4 md:p-5">
            {model.recentlyUpdated.map((row) => {
              const kind = kindOf(row.key);
              return (
                <li key={row.key}>
                  <Link
                    href={row.href}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-sm transition hover:border-accent hover:bg-accent-soft/40"
                  >
                    <span
                      className={cn("h-2 w-2 shrink-0 rounded-full", kindDot(row.key))}
                      aria-hidden
                    />
                    <span className="truncate font-medium">{row.title}</span>
                    <span className="text-xs text-muted">{kind.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {model.unowned.length > 0 ? (
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 md:px-6">
            <h2 className="font-display text-lg text-amber-950">No owner yet</h2>
            <Link
              href="/app/tasks"
              className="text-xs font-medium text-amber-900 hover:underline"
            >
              Tasks
            </Link>
          </div>
          <ul className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4">
            {model.unowned.map((row) => {
              const kind = kindOf(row.key);
              return (
                <li key={row.key}>
                  <Link
                    href={row.href}
                    className="flex items-center gap-3 rounded-xl border border-amber-100 bg-white px-3 py-2.5 transition hover:border-amber-300"
                  >
                    <KindMark itemKey={row.key} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.title}</span>
                      <span className="text-xs text-amber-900">{kind.label}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {model.budget ? <BudgetPanel budget={model.budget} /> : null}
    </div>
  );
}

function kindDot(key: string) {
  const prefix = key.split(":")[0];
  if (prefix === "task") return "bg-accent";
  if (prefix === "content") return "bg-sky-500";
  if (prefix === "event") return "bg-brand";
  if (prefix === "award") return "bg-amber-500";
  if (prefix === "enquiry") return "bg-violet-500";
  if (prefix === "email") return "bg-teal-600";
  return "bg-sand";
}
