"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  budgetThresholds,
  computeBudgetTotals,
  type LineSpend,
} from "@/lib/budget/totals";
import { removeById, rowFromResponse, upsertById } from "@/lib/data/list-patch";
import type {
  BudgetGroup,
  BudgetLine,
  BudgetMeta,
  BudgetPayment,
  BudgetPaymentStatus,
} from "@/lib/types";
import {
  BudgetEventCosts,
  type BudgetCostEvent,
  type BudgetEventCostLine,
} from "@/components/budget/BudgetEventCosts";
import { BudgetPaymentsSheet } from "@/components/budget/BudgetPaymentsSheet";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";

function gbp(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "payments", label: "Payments" },
  { id: "event_costs", label: "Event costs" },
  { id: "breakdowns", label: "Breakdowns" },
  { id: "notes", label: "Notes" },
  { id: "quarters", label: "Quarters" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const STATUS_OPTIONS: { value: BudgetPaymentStatus; label: string }[] = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "committed", label: "Committed" },
];

function statusLabel(status: BudgetPaymentStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function groupLabel(group: BudgetGroup) {
  return group === "committed" ? "Committed" : "Uncommitted";
}

function isHistoricBudgetLine(line: BudgetLine) {
  if (line.planned === 0 && (line.prior_year ?? 0) > 0) return true;
  return /not continued|remove for 20\d{2}/i.test(line.notes);
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn" | "ok" | "muted";
}) {
  return (
    <div className="surface-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-display text-2xl",
          tone === "warn"
            ? "text-amber-800"
            : tone === "ok"
              ? "text-emerald-800"
              : "text-brand"
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function SpendBar({ planned, used }: { planned: number; used: number }) {
  const over = planned > 0 ? used > planned : used > 0;
  const pct =
    planned > 0 ? Math.min(100, (used / planned) * 100) : used > 0 ? 100 : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-sand">
      <div
        className={cn(
          "h-full rounded-full",
          over ? "bg-amber-600" : "bg-brand"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BudgetLineTableRows({
  line,
  spend,
  open,
  payments,
  onToggle,
  onEdit,
  onDelete,
  onAddPayment,
}: {
  line: BudgetLine;
  spend?: LineSpend;
  open: boolean;
  payments: BudgetPayment[];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddPayment: () => void;
}) {
  const historic = isHistoricBudgetLine(line);
  return (
    <Fragment>
      <tr className="align-top">
        <td className="px-5 py-3">
          <button
            type="button"
            className="flex min-w-0 items-start gap-2 text-left"
            onClick={onToggle}
          >
            {open ? (
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0">
              <span className="font-medium">{line.name}</span>
              <span className="ml-2 text-xs text-muted">
                {line.code || groupLabel(line.group)}
              </span>
              {historic && (line.prior_year ?? 0) > 0 ? (
                <span className="mt-1 block text-xs text-muted">
                  2025 {gbp(line.prior_year)} · {line.notes || "Not continued"}
                </span>
              ) : (
                <span className="mt-2 block max-w-xs">
                  <SpendBar
                    planned={spend?.planned ?? line.planned}
                    used={spend?.used ?? 0}
                  />
                </span>
              )}
            </span>
          </button>
        </td>
        <td className="px-3 py-3 text-right tabular-nums">
          {gbp(line.planned)}
        </td>
        <td className="px-3 py-3 text-right tabular-nums">
          {gbp(spend?.paid ?? 0)}
        </td>
        <td className="px-3 py-3 text-right tabular-nums">
          {gbp(spend?.pending ?? 0)}
        </td>
        <td
          className={cn(
            "px-3 py-3 text-right font-medium tabular-nums",
            (spend?.remaining ?? 0) < 0 ? "text-amber-800" : ""
          )}
        >
          {gbp(spend?.remaining ?? line.planned)}
        </td>
        <td className="px-5 py-3">
          <div className="flex justify-end gap-1">
            <button
              type="button"
              className="btn-ghost px-2 py-1"
              aria-label="Edit line"
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-danger"
              aria-label="Delete line"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
      {open ? (
        <tr>
          <td className="bg-sand/30 px-5 pb-4 pt-0" colSpan={6}>
            <div className="ml-6 rounded-xl border border-border bg-white p-3">
              {line.notes ? (
                <p className="mb-2 text-xs text-muted">{line.notes}</p>
              ) : null}
              {payments.length === 0 ? (
                <p className="text-xs text-muted">No payments yet.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {payments.map((payment) => (
                    <li
                      key={payment.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>
                        {payment.paid_at || "No date"} ·{" "}
                        {payment.supplier || "No supplier"} ·{" "}
                        {payment.description || "Payment"}
                      </span>
                      <span className="tabular-nums">
                        {gbp(payment.amount)} · {statusLabel(payment.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="btn-secondary mt-3 text-xs"
                onClick={onAddPayment}
              >
                Add payment
              </button>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

type LineForm = {
  name: string;
  code: string;
  group: BudgetGroup;
  planned: string;
  notes: string;
};

const emptyLineForm: LineForm = {
  name: "",
  code: "",
  group: "uncommitted",
  planned: "",
  notes: "",
};

export type BudgetLinkOption = { id: string; title: string };

function toLineForm(line: BudgetLine): LineForm {
  return {
    name: line.name,
    code: line.code,
    group: line.group,
    planned: String(line.planned),
    notes: line.notes,
  };
}

export function BudgetClient({
  lines: initialLines,
  payments: initialPayments,
  meta,
  events = [],
  themes = [],
  eventCosts = [],
  costEvents = [],
  costStaff = [],
}: {
  lines: BudgetLine[];
  payments: BudgetPayment[];
  meta: BudgetMeta;
  events?: BudgetLinkOption[];
  themes?: BudgetLinkOption[];
  eventCosts?: BudgetEventCostLine[];
  costEvents?: BudgetCostEvent[];
  costStaff?: { id: string; name: string }[];
}) {
  const [lines, setLines] = useState(initialLines);
  const [payments, setPayments] = useState(initialPayments);
  const [tab, setTab] = useState<TabId>("overview");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<"all" | BudgetGroup>("all");
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [showHistoric, setShowHistoric] = useState(false);
  const [showLineForm, setShowLineForm] = useState(false);
  const [lineForm, setLineForm] = useState(emptyLineForm);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [quarterId, setQuarterId] = useState<BudgetMeta["quarters"][number]["id"]>(
    "Q1"
  );
  const [paymentsSheetKey, setPaymentsSheetKey] = useState(0);

  const totals = useMemo(
    () => computeBudgetTotals(lines, payments),
    [lines, payments]
  );
  const thresholdLines = useMemo(() => budgetThresholds(totals), [totals]);

  const lineOptions = useMemo(
    () => {
      const toOption = (line: BudgetLine, historic = false) => ({
        value: line.id,
        label: `${line.code ? `${line.name} (${line.code})` : line.name}${
          historic ? " — historic" : ""
        }`,
      });
      return [
        ...lines
          .filter((line) => !isHistoricBudgetLine(line))
          .map((line) => toOption(line)),
        ...lines.filter(isHistoricBudgetLine).map((line) => toOption(line, true)),
      ];
    },
    [lines]
  );

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save");
        return false;
      }
      const action = String(body.action ?? "");
      const id = typeof body.id === "string" ? body.id : "";
      if (action === "delete_line" && id) {
        setLines((prev) => removeById(prev, id));
        setPayments((prev) =>
          prev.filter((payment) => payment.budget_line_id !== id)
        );
      } else if (action === "delete_payment" && id) {
        setPayments((prev) => removeById(prev, id));
      } else if (action === "create_line" || action === "update_line") {
        const item = rowFromResponse<BudgetLine>(data);
        if (item) setLines((prev) => upsertById(prev, item));
      } else if (action === "create_payment" || action === "update_payment") {
        const item = rowFromResponse<BudgetPayment>(data);
        if (item) setPayments((prev) => upsertById(prev, item));
      }
      return true;
    } catch {
      setError("Could not save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const filteredLines = useMemo(() => {
    return lines.filter((line) => {
      if (groupFilter !== "all" && line.group !== groupFilter) return false;
      return matchesSearch(search, [line.name, line.code, line.notes]);
    });
  }, [lines, groupFilter, search]);

  const currentLines = useMemo(
    () => filteredLines.filter((line) => !isHistoricBudgetLine(line)),
    [filteredLines]
  );
  const historicLines = useMemo(
    () => filteredLines.filter(isHistoricBudgetLine),
    [filteredLines]
  );
  const historicPriorYear = useMemo(
    () =>
      historicLines.reduce((total, line) => total + (line.prior_year ?? 0), 0),
    [historicLines]
  );
  const historicOpen =
    showHistoric || (search.trim().length > 0 && historicLines.length > 0);

  function renderBudgetLine(line: BudgetLine) {
    const spend = totals.byLine[line.id];
    const open = openLineId === line.id;
    return (
      <BudgetLineTableRows
        key={line.id}
        line={line}
        spend={spend}
        open={open}
        payments={payments.filter(
          (payment) => payment.budget_line_id === line.id
        )}
        onToggle={() => setOpenLineId(open ? null : line.id)}
        onEdit={() => {
          setEditingLineId(line.id);
          setLineForm(toLineForm(line));
          setShowLineForm(true);
        }}
        onDelete={() => {
          if (!window.confirm(`Delete ${line.name} and its payments?`)) {
            return;
          }
          void post({ action: "delete_line", id: line.id });
        }}
        onAddPayment={() => {
          void addPaymentRow(line.id);
        }}
      />
    );
  }

  const quarter =
    meta.quarters.find((item) => item.id === quarterId) ?? meta.quarters[0];

  async function saveLine() {
    const payload = {
      name: lineForm.name,
      code: lineForm.code,
      group: lineForm.group,
      planned: Number(lineForm.planned),
      notes: lineForm.notes,
    };
    const ok = editingLineId
      ? await post({ action: "update_line", id: editingLineId, patch: payload })
      : await post({ action: "create_line", ...payload });
    if (!ok) return;
    setShowLineForm(false);
    setEditingLineId(null);
    setLineForm(emptyLineForm);
  }

  async function addPaymentRow(budgetLineId?: string) {
    const lineId =
      budgetLineId ||
      lines.find((line) => !isHistoricBudgetLine(line))?.id ||
      lines[0]?.id ||
      "";
    if (!lineId) {
      setError("Add a budget line first");
      return;
    }
    const ok = await post({
      action: "create_payment",
      budget_line_id: lineId,
      amount: 1,
      status: "pending",
      supplier: "",
      description: "",
      paid_at: null,
      invoice_url: "",
      event_id: null,
      theme_id: null,
    });
    if (!ok) return;
    setTab("payments");
    setPaymentsSheetKey((key) => key + 1);
  }

  return (
    <div>
      <PageHeader
        title={meta.title}
        description={`${meta.source} · amounts in ${meta.currency}. Add payments to track spend against each line.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setTab("overview");
                setEditingLineId(null);
                setLineForm(emptyLineForm);
                setShowLineForm(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add line
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={() => void addPaymentRow()}
            >
              <Plus className="h-4 w-4" />
              Add payment
            </button>
          </div>
        }
      />

      <p className="mb-6 inline-flex items-center gap-2 rounded-xl border border-border bg-sand/70 px-3 py-2 text-xs text-muted">
        <Lock className="h-3.5 w-3.5" />
        Restricted to Hub admins, plus Simon, Tom, and Michael. All of you can
        edit budgets and log spend.
      </p>

      {error ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total budget" value={gbp(totals.planned)} />
        <SummaryCard
          label="Paid"
          value={gbp(totals.paid)}
          hint="Recorded as paid"
        />
        <SummaryCard
          label="Committed / pending"
          value={gbp(totals.pending)}
          hint="Not paid yet"
        />
        <SummaryCard
          label="Remaining"
          value={gbp(totals.remaining)}
          tone={totals.remaining < 0 ? "warn" : "ok"}
        />
        <SummaryCard
          label="Over budget"
          value={String(totals.overBudgetCount)}
          hint="Lines past planned spend"
          tone={totals.overBudgetCount > 0 ? "warn" : "muted"}
        />
      </div>

      {thresholdLines.length > 0 ? (
        <ul className="mb-6 space-y-2">
          {thresholdLines.map((line) => {
            const name =
              lines.find((item) => item.id === line.lineId)?.name ??
              "Budget line";
            const detail =
              line.remaining < 0
                ? `${name} is past the planned amount by ${gbp(Math.abs(line.remaining))}.`
                : `${name} has ${gbp(line.remaining)} left of ${gbp(line.planned)}.`;
            return (
              <li
                key={line.lineId}
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              >
                {detail} Paid {gbp(line.paid)}. Committed or pending{" "}
                {gbp(line.pending)}.
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mb-6 inline-flex flex-wrap rounded-xl border border-border bg-sand/60 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              tab === item.id
                ? "bg-white text-brand shadow-sm"
                : "text-muted hover:text-foreground"
            )}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ["committed", "Committed"],
                ["uncommitted", "Uncommitted"],
              ] as const
            ).map(([key, label]) => {
              const group = totals.byGroup[key];
              const used = group.paid + group.pending;
              return (
                <div key={key} className="surface-card p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg text-brand">{label}</h2>
                      <p className="text-xs text-muted">
                        {gbp(used)} of {gbp(group.planned)} used
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-medium tabular-nums",
                        group.remaining < 0 ? "text-amber-800" : "text-muted"
                      )}
                    >
                      {gbp(group.remaining)} left
                    </span>
                  </div>
                  <SpendBar planned={group.planned} used={used} />
                </div>
              );
            })}
          </div>

          {showLineForm ? (
            <div className="surface-card p-5">
              <h2 className="mb-4 font-display text-lg text-brand">
                {editingLineId ? "Edit budget line" : "Add budget line"}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="label">Name</span>
                  <input
                    className="field mt-1 w-full"
                    value={lineForm.name}
                    onChange={(e) =>
                      setLineForm((form) => ({ ...form, name: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="label">Code</span>
                  <input
                    className="field mt-1 w-full"
                    value={lineForm.code}
                    onChange={(e) =>
                      setLineForm((form) => ({ ...form, code: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="label">Group</span>
                  <select
                    className="field mt-1 w-full"
                    value={lineForm.group}
                    onChange={(e) =>
                      setLineForm((form) => ({
                        ...form,
                        group: e.target.value as BudgetGroup,
                      }))
                    }
                  >
                    <option value="committed">Committed</option>
                    <option value="uncommitted">Uncommitted</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="label">Planned £</span>
                  <input
                    className="field mt-1 w-full"
                    type="number"
                    min="0"
                    step="0.01"
                    value={lineForm.planned}
                    onChange={(e) =>
                      setLineForm((form) => ({
                        ...form,
                        planned: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="label">Notes</span>
                  <textarea
                    className="field mt-1 w-full"
                    rows={2}
                    value={lineForm.notes}
                    onChange={(e) =>
                      setLineForm((form) => ({ ...form, notes: e.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving}
                  onClick={() => void saveLine()}
                >
                  Save line
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowLineForm(false);
                    setEditingLineId(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="surface-card overflow-hidden">
            <div className="border-b border-border px-5 py-3">
              <FilterBar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search lines…"
                resultCount={currentLines.length}
                totalCount={lines.length}
                selects={[
                  {
                    id: "group",
                    label: "Group",
                    value: groupFilter,
                    onChange: (value) =>
                      setGroupFilter(value as "all" | BudgetGroup),
                    options: [
                      { value: "all", label: "All" },
                      { value: "committed", label: "Committed" },
                      { value: "uncommitted", label: "Uncommitted" },
                    ],
                  },
                ]}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-sand/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Line</th>
                    <th className="px-3 py-2.5 text-right font-medium">Planned</th>
                    <th className="px-3 py-2.5 text-right font-medium">Paid</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Pending
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Remaining
                    </th>
                    <th className="px-5 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {currentLines.map(renderBudgetLine)}
                  {historicLines.length > 0 ? (
                    <>
                      <tr>
                        <td className="px-5 py-3" colSpan={6}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 text-left"
                            onClick={() => setShowHistoric((open) => !open)}
                            aria-expanded={historicOpen}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {historicOpen ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                              )}
                              <span>
                                <span className="font-medium text-muted">
                                  Historic / not continued in 2026
                                </span>
                                <span className="ml-2 text-xs text-muted">
                                  {historicLines.length} lines
                                </span>
                              </span>
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted">
                              2025 {gbp(historicPriorYear)}
                            </span>
                          </button>
                        </td>
                      </tr>
                      {historicOpen ? historicLines.map(renderBudgetLine) : null}
                    </>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "payments" ? (
        <BudgetPaymentsSheet
          key={paymentsSheetKey}
          payments={payments}
          lineOptions={lineOptions}
          events={events}
          themes={themes}
          defaultLineId={
            lines.find((line) => !isHistoricBudgetLine(line))?.id ??
            lines[0]?.id
          }
          onPaymentsChange={setPayments}
        />
      ) : null}

      {tab === "event_costs" ? (
        <BudgetEventCosts lines={eventCosts} events={costEvents} staff={costStaff} />
      ) : null}

      {tab === "breakdowns" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {lines
            .filter((line) => line.children.length > 0)
            .map((line) => (
              <div key={line.id} className="surface-card overflow-hidden">
                <div className="border-b border-border bg-accent-soft/40 px-5 py-3">
                  <h2 className="font-display text-lg text-brand">{line.name}</h2>
                  <p className="text-xs text-muted">
                    {line.code ? `${line.code} · ` : ""}
                    {gbp(line.planned)} planned
                  </p>
                </div>
                <ul className="divide-y divide-border">
                  {line.children.map((child) => (
                    <li
                      key={child.name}
                      className="flex items-start justify-between gap-4 px-5 py-3 text-sm"
                    >
                      <span>
                        {child.name}
                        {child.note ? (
                          <span className="mt-1 block text-xs text-muted">
                            {child.note}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {gbp(child.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      ) : null}

      {tab === "notes" ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {meta.notes.map((note) => (
              <div key={note.title} className="surface-card p-5">
                <h2 className="font-display text-lg text-brand">{note.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {note.body}
                </p>
              </div>
            ))}
          </div>
          <div className="surface-card overflow-hidden">
            <div className="border-b border-border bg-accent-soft/40 px-5 py-3">
              <h2 className="font-display text-lg text-brand">
                Additional events
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {meta.extra_events.map((event) => (
                <li key={event.name} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-medium">{event.name}</h3>
                    <span className="text-xs text-muted">{event.when}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{event.detail}</p>
                  {event.people ? (
                    <p className="mt-1 text-xs text-muted">{event.people}</p>
                  ) : null}
                  {event.cap ? (
                    <p className="mt-1 text-xs text-muted">{event.cap}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "quarters" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Quarterly sheets in the original draft are mostly still empty,
            except the £6,000 event reserve in each quarter.
          </p>
          <div className="inline-flex rounded-xl border border-border bg-sand/60 p-1">
            {meta.quarters.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  quarterId === item.id
                    ? "bg-white text-brand shadow-sm"
                    : "text-muted hover:text-foreground"
                )}
                onClick={() => setQuarterId(item.id)}
              >
                {item.id}
              </button>
            ))}
          </div>
          {quarter ? (
            <div className="surface-card overflow-hidden">
              <div className="border-b border-border bg-accent-soft/40 px-5 py-3">
                <h2 className="font-display text-lg text-brand">
                  {quarter.title}
                </h2>
              </div>
              <ul className="divide-y divide-border">
                {quarter.lines.map((line, index) =>
                  line.section ? (
                    <li
                      key={`${line.name}-${index}`}
                      className="bg-sand/50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
                    >
                      {line.name}
                    </li>
                  ) : (
                    <li
                      key={`${line.name}-${index}`}
                      className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                    >
                      <span>
                        {line.name}
                        {line.code ? (
                          <span className="ml-2 text-xs text-muted">
                            {line.code}
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular-nums text-muted">
                        {line.total != null ? gbp(line.total) : "—"}
                      </span>
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
