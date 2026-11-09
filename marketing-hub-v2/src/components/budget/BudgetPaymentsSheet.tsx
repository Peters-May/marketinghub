"use client";

import { useMemo, useRef, useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { removeById, rowFromResponse, upsertById } from "@/lib/data/list-patch";
import type { BudgetPayment, BudgetPaymentStatus } from "@/lib/types";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { cn } from "@/lib/utils";

export type BudgetPaymentLineOption = {
  value: string;
  label: string;
};

export type BudgetPaymentLinkOption = {
  id: string;
  title: string;
};

type Draft = BudgetPayment & { amountText: string };

const CELL =
  "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition hover:border-border focus:border-accent focus:bg-white";

const STATUS_OPTIONS: { value: BudgetPaymentStatus; label: string }[] = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "committed", label: "Committed" },
];

const YEAR_OPTIONS = [
  { value: "all", label: "All years" },
  { value: "2026", label: "2026" },
  { value: "2027", label: "2027" },
] as const;

function toDraft(payment: BudgetPayment): Draft {
  return {
    ...payment,
    amountText: String(payment.amount),
  };
}

function paymentYear(payment: BudgetPayment): string | null {
  if (!payment.paid_at) return null;
  const match = /^(\d{4})/.exec(payment.paid_at);
  return match?.[1] ?? null;
}

function parseAmountText(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export function BudgetPaymentsSheet({
  payments: initialPayments,
  lineOptions,
  events,
  themes,
  defaultLineId,
  onPaymentsChange,
}: {
  payments: BudgetPayment[];
  lineOptions: BudgetPaymentLineOption[];
  events: BudgetPaymentLinkOption[];
  themes: BudgetPaymentLinkOption[];
  defaultLineId?: string;
  onPaymentsChange?: (payments: BudgetPayment[]) => void;
}) {
  const [rows, setRows] = useState<Draft[]>(() => initialPayments.map(toDraft));
  const rowsRef = useRef(rows);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | BudgetPaymentStatus>(
    "all"
  );
  const [lineFilter, setLineFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState<"all" | "2026" | "2027">("all");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  function publish(next: Draft[]) {
    rowsRef.current = next;
    setRows(next);
    onPaymentsChange?.(
      next.map((row) => {
        const { amountText, ...payment } = row;
        void amountText;
        return payment;
      })
    );
  }

  function setRowError(id: string, message: string) {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  function applyRow(id: string, patch: Partial<Draft>) {
    const next = rowsRef.current.map((row) =>
      row.id === id ? { ...row, ...patch } : row
    );
    publish(next);
    return next.find((row) => row.id === id) ?? null;
  }

  async function persist(id: string, patch: Record<string, unknown>) {
    const res = await fetch("/api/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_payment", id, patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRowError(
        id,
        typeof data.error === "string" ? data.error : "Could not save"
      );
      return null;
    }
    const item = rowFromResponse<BudgetPayment>(data);
    if (!item) {
      setRowError(id, "Could not save");
      return null;
    }
    setRowError(id, "");
    const current = rowsRef.current.find((row) => row.id === id);
    const draft = toDraft(item);
    if (current && current.amountText !== String(item.amount)) {
      draft.amountText = current.amountText;
      draft.amount = current.amount;
    }
    if (current && current.supplier !== item.supplier) {
      draft.supplier = current.supplier;
    }
    if (current && current.description !== item.description) {
      draft.description = current.description;
    }
    if (current && current.invoice_url !== item.invoice_url) {
      draft.invoice_url = current.invoice_url;
    }
    publish(upsertById(rowsRef.current, draft));
    return item;
  }

  function commit(id: string, patch: Partial<Draft>) {
    const before = rowsRef.current.find((row) => row.id === id);
    if (!before) return;
    const next = applyRow(id, patch);
    if (!next) return;

    const apiPatch: Record<string, unknown> = {};
    if (patch.budget_line_id !== undefined) {
      apiPatch.budget_line_id = next.budget_line_id;
    }
    if (patch.paid_at !== undefined) apiPatch.paid_at = next.paid_at || null;
    if (patch.supplier !== undefined) apiPatch.supplier = next.supplier;
    if (patch.description !== undefined) apiPatch.description = next.description;
    if (patch.status !== undefined) apiPatch.status = next.status;
    if (patch.invoice_url !== undefined) apiPatch.invoice_url = next.invoice_url;
    if (patch.event_id !== undefined) apiPatch.event_id = next.event_id || null;
    if (patch.theme_id !== undefined) apiPatch.theme_id = next.theme_id || null;
    if (patch.amountText !== undefined) {
      const amount = parseAmountText(next.amountText);
      if (amount == null) {
        setRowError(id, "Amount must be greater than 0");
        applyRow(id, { amountText: String(before.amount), amount: before.amount });
        return;
      }
      if (amount === before.amount && next.amountText === String(before.amount)) {
        setRowError(id, "");
        return;
      }
      apiPatch.amount = amount;
      applyRow(id, { amount });
    }

    if (Object.keys(apiPatch).length === 0) return;

    const unchanged =
      (apiPatch.budget_line_id === undefined ||
        apiPatch.budget_line_id === before.budget_line_id) &&
      (apiPatch.paid_at === undefined ||
        (apiPatch.paid_at ?? null) === (before.paid_at ?? null)) &&
      (apiPatch.supplier === undefined || apiPatch.supplier === before.supplier) &&
      (apiPatch.description === undefined ||
        apiPatch.description === before.description) &&
      (apiPatch.status === undefined || apiPatch.status === before.status) &&
      (apiPatch.invoice_url === undefined ||
        apiPatch.invoice_url === before.invoice_url) &&
      (apiPatch.event_id === undefined ||
        (apiPatch.event_id ?? null) === (before.event_id ?? null)) &&
      (apiPatch.theme_id === undefined ||
        (apiPatch.theme_id ?? null) === (before.theme_id ?? null)) &&
      (apiPatch.amount === undefined || apiPatch.amount === before.amount);

    if (unchanged && apiPatch.amount === undefined) {
      setRowError(id, "");
      return;
    }

    void persist(id, apiPatch);
  }

  async function addPayment(preferredLineId?: string) {
    const lineId =
      preferredLineId ||
      defaultLineId ||
      lineOptions[0]?.value ||
      "";
    if (!lineId) {
      setError("Add a budget line first");
      return;
    }
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not add");
        return;
      }
      const item = rowFromResponse<BudgetPayment>(data);
      if (!item) {
        setError("Could not add");
        return;
      }
      publish([toDraft(item), ...rowsRef.current]);
    } catch {
      setError("Could not add");
    } finally {
      setAdding(false);
    }
  }

  async function removePayment(id: string) {
    if (!window.confirm("Delete this payment?")) return;
    const res = await fetch("/api/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_payment", id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setRowError(
        id,
        typeof data.error === "string" ? data.error : "Could not delete"
      );
      return;
    }
    setRowError(id, "");
    publish(removeById(rowsRef.current, id));
  }

  const filtered = useMemo(() => {
    return rows.filter((payment) => {
      if (statusFilter !== "all" && payment.status !== statusFilter) return false;
      if (lineFilter !== "all" && payment.budget_line_id !== lineFilter) {
        return false;
      }
      if (yearFilter !== "all") {
        const year = paymentYear(payment);
        if (year !== yearFilter) return false;
      }
      const lineLabel =
        lineOptions.find((option) => option.value === payment.budget_line_id)
          ?.label ?? "";
      return matchesSearch(search, [
        payment.supplier,
        payment.description,
        payment.invoice_url,
        lineLabel,
      ]);
    });
  }, [rows, statusFilter, lineFilter, yearFilter, search, lineOptions]);

  const eventOptions = useMemo(
    () =>
      [...events].sort((a, b) => a.title.localeCompare(b.title)),
    [events]
  );
  const themeOptions = useMemo(
    () =>
      [...themes].sort((a, b) => a.title.localeCompare(b.title)),
    [themes]
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Edit cells directly — changes save when you leave a field. Use the year
        filter for 2026 or 2027 payments by date.
      </p>

      <div className="surface-card overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <FilterBar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search supplier, description, line…"
                resultCount={filtered.length}
                totalCount={rows.length}
                selects={[
                  {
                    id: "year",
                    label: "Year",
                    value: yearFilter,
                    onChange: (value) =>
                      setYearFilter(value as "all" | "2026" | "2027"),
                    options: [...YEAR_OPTIONS],
                  },
                  {
                    id: "status",
                    label: "Status",
                    value: statusFilter,
                    onChange: (value) =>
                      setStatusFilter(value as "all" | BudgetPaymentStatus),
                    options: [
                      { value: "all", label: "All" },
                      ...STATUS_OPTIONS,
                    ],
                  },
                  {
                    id: "line",
                    label: "Line",
                    value: lineFilter,
                    onChange: setLineFilter,
                    options: [
                      { value: "all", label: "All lines" },
                      ...lineOptions,
                    ],
                  },
                ]}
              />
            </div>
            <button
              type="button"
              className="btn-secondary !py-1.5"
              disabled={adding || lineOptions.length === 0}
              onClick={() => void addPayment()}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {adding ? "Adding…" : "Add row"}
            </button>
          </div>
        </div>

        {error ? (
          <p className="border-b border-border px-5 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted">
            {rows.length
              ? "No payments match these filters."
              : "No payments yet. Add a row to start tracking spend."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-sand/50 text-left text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Line</th>
                  <th className="px-2 py-2 font-medium">Supplier</th>
                  <th className="px-2 py-2 font-medium">Description</th>
                  <th className="px-2 py-2 font-medium">Amount £</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Invoice URL</th>
                  <th className="px-2 py-2 font-medium">Event</th>
                  <th className="px-2 py-2 font-medium">Theme</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="group border-t border-border align-middle"
                  >
                    <td className="px-3 py-1">
                      <input
                        aria-label="Date"
                        className={CELL}
                        type="date"
                        value={row.paid_at ?? ""}
                        onChange={(event) =>
                          commit(row.id, {
                            paid_at: event.target.value || null,
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1 min-w-[180px]">
                      <select
                        aria-label="Budget line"
                        className={CELL}
                        value={row.budget_line_id}
                        onChange={(event) =>
                          commit(row.id, {
                            budget_line_id: event.target.value,
                          })
                        }
                      >
                        {lineOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                        {!lineOptions.some(
                          (option) => option.value === row.budget_line_id
                        ) ? (
                          <option value={row.budget_line_id}>
                            Unknown line
                          </option>
                        ) : null}
                      </select>
                    </td>
                    <td className="px-2 py-1 min-w-[140px]">
                      <input
                        aria-label="Supplier"
                        className={CELL}
                        placeholder="Supplier"
                        value={row.supplier}
                        onChange={(event) =>
                          applyRow(row.id, { supplier: event.target.value })
                        }
                        onBlur={(event) =>
                          commit(row.id, { supplier: event.target.value })
                        }
                      />
                    </td>
                    <td className="px-2 py-1 min-w-[180px]">
                      <input
                        aria-label="Description"
                        className={CELL}
                        placeholder="What is it?"
                        value={row.description}
                        onChange={(event) =>
                          applyRow(row.id, { description: event.target.value })
                        }
                        onBlur={(event) =>
                          commit(row.id, { description: event.target.value })
                        }
                      />
                    </td>
                    <td className="px-2 py-1 min-w-[100px]">
                      <input
                        aria-label="Amount"
                        className={cn(
                          CELL,
                          "text-right tabular-nums",
                          rowErrors[row.id] ? "!border-danger" : ""
                        )}
                        inputMode="decimal"
                        value={row.amountText}
                        onChange={(event) =>
                          applyRow(row.id, { amountText: event.target.value })
                        }
                        onBlur={(event) =>
                          commit(row.id, { amountText: event.target.value })
                        }
                      />
                    </td>
                    <td className="px-2 py-1 min-w-[110px]">
                      <select
                        aria-label="Status"
                        className={CELL}
                        value={row.status}
                        onChange={(event) =>
                          commit(row.id, {
                            status: event.target.value as BudgetPaymentStatus,
                          })
                        }
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1 min-w-[180px]">
                      <span className="flex items-center gap-1">
                        <input
                          aria-label="Invoice URL"
                          className={CELL}
                          type="url"
                          placeholder="https://"
                          value={row.invoice_url}
                          onChange={(event) =>
                            applyRow(row.id, {
                              invoice_url: event.target.value,
                            })
                          }
                          onBlur={(event) =>
                            commit(row.id, {
                              invoice_url: event.target.value,
                            })
                          }
                        />
                        {row.invoice_url ? (
                          <a
                            href={row.invoice_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:text-accent"
                            aria-label="Open invoice"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </a>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-2 py-1 min-w-[150px]">
                      <select
                        aria-label="Event"
                        className={CELL}
                        value={row.event_id ?? ""}
                        onChange={(event) =>
                          commit(row.id, {
                            event_id: event.target.value || null,
                          })
                        }
                      >
                        <option value="">None</option>
                        {eventOptions.map((event) => (
                          <option key={event.id} value={event.id}>
                            {event.title}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1 min-w-[150px]">
                      <select
                        aria-label="Theme"
                        className={CELL}
                        value={row.theme_id ?? ""}
                        onChange={(event) =>
                          commit(row.id, {
                            theme_id: event.target.value || null,
                          })
                        }
                      >
                        <option value="">None</option>
                        {themeOptions.map((theme) => (
                          <option key={theme.id} value={theme.id}>
                            {theme.title}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        aria-label="Delete payment"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"
                        onClick={() => void removePayment(row.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {Object.keys(rowErrors).length > 0 ? (
          <div className="space-y-1 border-t border-border px-5 py-2">
            {Object.entries(rowErrors).map(([id, message]) =>
              message ? (
                <p key={id} className="text-xs text-danger">
                  {message}
                </p>
              ) : null
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
