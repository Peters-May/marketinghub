"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import {
  COST_CATEGORIES,
  COST_CURRENCIES,
  costTotalsByCurrency,
  costsSheetPath,
  formatCostAmount,
  isCostCurrency,
  parseCostAmount,
} from "@/lib/events/costs";
import type { EventCostCategory, EventCostCurrency, EventCostLine } from "@/lib/types";

export type BudgetEventCostLine = {
  id: string;
  eventId: string;
  eventTitle: string;
  startsAt: string | null;
  location: string;
  category: EventCostCategory;
  description: string;
  amount: number | null;
  currency: EventCostCurrency;
  staffUserId: string | null;
  staffName: string;
  notes: string;
};

export type BudgetCostEvent = {
  id: string;
  title: string;
  startsAt: string | null;
  location: string;
};

type Staff = { id: string; name: string };
type Draft = BudgetEventCostLine & { amountText: string };

const CELL =
  "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition hover:border-border focus:border-accent focus:bg-white";

function eventWhen(value: string | null) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function toDraft(line: BudgetEventCostLine): Draft {
  return {
    ...line,
    currency: isCostCurrency(line.currency) ? line.currency : "GBP",
    amountText: line.amount === null ? "" : String(line.amount),
  };
}

function fromSaved(
  line: EventCostLine,
  event: Pick<BudgetCostEvent, "title" | "startsAt" | "location">
): Draft {
  return toDraft({
    id: line.id,
    eventId: line.event_id,
    eventTitle: event.title,
    startsAt: event.startsAt,
    location: event.location,
    category: line.category,
    description: line.description,
    amount: line.amount,
    currency: isCostCurrency(line.currency) ? line.currency : "GBP",
    staffUserId: line.staff_user_id,
    staffName: line.staff_name,
    notes: line.notes,
  });
}

export function BudgetEventCosts({
  lines,
  events,
  staff,
}: {
  lines: BudgetEventCostLine[];
  events: BudgetCostEvent[];
  staff: Staff[];
}) {
  const [rows, setRows] = useState<Draft[]>(() => lines.map(toDraft));
  const rowsRef = useRef(rows);
  const [search, setSearch] = useState("");
  const [addEventId, setAddEventId] = useState("");
  const [addingId, setAddingId] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const needle = search.trim().toLowerCase();

  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const eventOptions = useMemo(
    () => [...events].sort((a, b) => a.title.localeCompare(b.title)),
    [events]
  );

  const visible = useMemo(() => {
    if (!needle) return rows;
    return rows.filter((line) =>
      [line.eventTitle, line.location, line.description, line.staffName, line.notes, line.category]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, needle]);

  const groups = useMemo(() => {
    const byEvent = new Map<string, Draft[]>();
    for (const line of visible) {
      const list = byEvent.get(line.eventId) ?? [];
      list.push(line);
      byEvent.set(line.eventId, list);
    }
    return [...byEvent.entries()]
      .map(([eventId, groupRows]) => {
        const event = eventById.get(eventId);
        const first = groupRows[0];
        return {
          eventId,
          title: event?.title || first.eventTitle,
          startsAt: event?.startsAt ?? first.startsAt,
          location: event?.location || first.location,
          rows: groupRows,
          totals: costTotalsByCurrency(groupRows),
          tbc: groupRows.filter((row) => row.amount === null).length,
        };
      })
      .sort((a, b) => {
        if (a.startsAt && b.startsAt) return a.startsAt.localeCompare(b.startsAt);
        if (a.startsAt) return -1;
        if (b.startsAt) return 1;
        return a.title.localeCompare(b.title);
      });
  }, [visible, eventById]);

  const totals = costTotalsByCurrency(visible);
  const tbc = visible.filter((line) => line.amount === null).length;

  function setRowError(id: string, message: string) {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  function applyRow(id: string, patch: Partial<Draft>) {
    const next = rowsRef.current.map((row) => (row.id === id ? { ...row, ...patch } : row));
    rowsRef.current = next;
    setRows(next);
    return next.find((row) => row.id === id) ?? null;
  }

  async function persist(draft: Draft) {
    const amount = parseCostAmount(draft.amountText);
    if (amount === undefined) {
      setRowError(draft.id, "Enter an amount of 0 or more, or leave it blank");
      return;
    }
    const res = await fetch("/api/events/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_line",
        id: draft.id,
        event_id: draft.eventId,
        category: draft.category,
        description: draft.description,
        amount,
        currency: draft.currency,
        staff_user_id: draft.staffUserId,
        notes: draft.notes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.line) {
      setRowError(draft.id, typeof data.error === "string" ? data.error : "Could not save");
      return;
    }
    const saved = data.line as EventCostLine;
    setRowError(draft.id, "");
    const current = rowsRef.current.find((row) => row.id === draft.id);
    if (!current) return;
    applyRow(draft.id, {
      description: current.description === draft.description ? saved.description : current.description,
      notes: current.notes === draft.notes ? saved.notes : current.notes,
      amount: current.amountText === draft.amountText ? saved.amount : current.amount,
      amountText: current.amountText,
      staffUserId: current.staffUserId === draft.staffUserId ? saved.staff_user_id : current.staffUserId,
      staffName: current.staffUserId === draft.staffUserId ? saved.staff_name : current.staffName,
      category: current.category === draft.category ? saved.category : current.category,
      currency:
        current.currency === draft.currency && isCostCurrency(saved.currency)
          ? saved.currency
          : current.currency,
    });
  }

  function commit(id: string, patch: Partial<Draft>) {
    const next = applyRow(id, patch);
    if (next) void persist(next);
  }

  async function addLine(eventId: string) {
    const event = eventById.get(eventId);
    if (!event) {
      setError("Choose an event first");
      return;
    }
    setAddingId(eventId);
    setError("");
    const res = await fetch("/api/events/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_line",
        event_id: eventId,
        category: "other",
        description: "",
        amount: null,
        currency: "GBP",
        staff_user_id: null,
        notes: "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setAddingId("");
    if (!res.ok || !data.line) {
      setError(typeof data.error === "string" ? data.error : "Could not add a line");
      return;
    }
    setRows((prev) => {
      const next = [...prev, fromSaved(data.line as EventCostLine, event)];
      rowsRef.current = next;
      return next;
    });
    setAddEventId("");
  }

  async function removeLine(id: string) {
    const res = await fetch("/api/events/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_line", id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setRowError(id, typeof data.error === "string" ? data.error : "Could not remove");
      return;
    }
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      rowsRef.current = next;
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        The same lines as each event costs sheet. A change here updates the event, and a change on the event updates this tab.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="field !h-9 max-w-sm"
          aria-label="Search event costs"
          placeholder="Search events, people, or costs…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Event to add"
          className="field !h-9 max-w-xs !py-1.5"
          value={addEventId}
          onChange={(event) => setAddEventId(event.target.value)}
        >
          <option value="">Add a line to an event…</option>
          {eventOptions.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-secondary !py-1.5"
          disabled={!addEventId || addingId === addEventId}
          onClick={() => void addLine(addEventId)}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {addingId === addEventId ? "Adding…" : "Add line"}
        </button>
        {totals.map((item) => (
          <span
            key={item.currency}
            className="rounded-full bg-background px-3 py-1 text-sm font-medium tabular-nums"
          >
            {formatCostAmount(item.total, item.currency)}
          </span>
        ))}
        {tbc ? <span className="text-xs text-muted">{tbc} TBC</span> : null}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {groups.length === 0 ? (
        <p className="surface-card px-5 py-6 text-sm text-muted">
          {rows.length
            ? "No event costs match that search."
            : "No event costs yet. Add a line to an event, or enter costs on the event sheet."}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.eventId} className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-accent-soft/40 px-5 py-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg text-brand">{group.title}</h2>
                <p className="text-xs text-muted">
                  {[eventWhen(group.startsAt), group.location].filter(Boolean).join(" · ") ||
                    "Date not set"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {group.totals.map((item) => (
                  <span key={item.currency} className="text-sm font-medium tabular-nums">
                    {formatCostAmount(item.total, item.currency)}
                  </span>
                ))}
                {group.tbc ? (
                  <span className="text-xs text-muted">{group.tbc} TBC</span>
                ) : null}
                <Link
                  href={costsSheetPath(group.eventId)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  Open sheet
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-sand/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-2 py-2 font-medium">Description</th>
                    <th className="px-2 py-2 font-medium">Amount</th>
                    <th className="px-2 py-2 font-medium">Staff</th>
                    <th className="px-2 py-2 font-medium">Notes</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.id} className="group border-t border-border align-middle">
                      <td className="px-3 py-1">
                        <select
                          aria-label="Category"
                          className={CELL}
                          value={row.category}
                          onChange={(event) =>
                            commit(row.id, { category: event.target.value as EventCostCategory })
                          }
                        >
                          {COST_CATEGORIES.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          aria-label="Description"
                          className={CELL}
                          placeholder="What is it?"
                          value={row.description}
                          onChange={(event) => applyRow(row.id, { description: event.target.value })}
                          onBlur={(event) => commit(row.id, { description: event.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <span className="flex items-center">
                          <select
                            aria-label="Currency"
                            className={`${CELL} !w-16 shrink-0 !px-1 text-muted`}
                            value={row.currency}
                            onChange={(event) =>
                              commit(row.id, { currency: event.target.value as EventCostCurrency })
                            }
                          >
                            {COST_CURRENCIES.map((currency) => (
                              <option key={currency}>{currency}</option>
                            ))}
                          </select>
                          <input
                            aria-label="Amount"
                            className={`${CELL} text-right tabular-nums ${rowErrors[row.id] ? "!border-danger" : ""}`}
                            inputMode="decimal"
                            placeholder="TBC"
                            value={row.amountText}
                            onChange={(event) => applyRow(row.id, { amountText: event.target.value })}
                            onBlur={(event) => commit(row.id, { amountText: event.target.value })}
                          />
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        <select
                          aria-label="Staff"
                          className={CELL}
                          value={row.staffUserId ?? ""}
                          onChange={(event) => {
                            const staffUserId = event.target.value || null;
                            const person = staff.find((item) => item.id === staffUserId);
                            commit(row.id, {
                              staffUserId,
                              staffName: person?.name ?? "",
                            });
                          }}
                        >
                          <option value="">Unassigned</option>
                          {row.staffUserId && !staff.some((person) => person.id === row.staffUserId) ? (
                            <option value={row.staffUserId}>{row.staffName || "Former user"}</option>
                          ) : null}
                          {staff.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          aria-label="Notes"
                          className={`${CELL} text-muted`}
                          placeholder="Add a note"
                          value={row.notes}
                          onChange={(event) => applyRow(row.id, { notes: event.target.value })}
                          onBlur={(event) => commit(row.id, { notes: event.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <button
                          type="button"
                          aria-label="Remove line"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"
                          onClick={() => void removeLine(row.id)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rowErrors &&
            group.rows.some((row) => rowErrors[row.id]) ? (
              <div className="space-y-1 px-5 pb-2">
                {group.rows.map((row) =>
                  rowErrors[row.id] ? (
                    <p key={row.id} className="text-xs text-danger">
                      {rowErrors[row.id]}
                    </p>
                  ) : null
                )}
              </div>
            ) : null}
            <button
              type="button"
              className="btn-ghost m-2 !px-2 !py-1.5"
              disabled={addingId === group.eventId}
              onClick={() => void addLine(group.eventId)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {addingId === group.eventId ? "Adding…" : "Add line"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
