"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BedDouble,
  Check,
  Lock,
  MoreHorizontal,
  Plane,
  Plus,
  Printer,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  COST_CATEGORIES,
  COST_CURRENCIES,
  canEditCostLine,
  costTotalsByCurrency,
  defaultCostsRequestDraft,
  formatCostAmount,
  parseCostAmount,
} from "@/lib/events/costs";
import type { EventCostCategory, EventCostLine } from "@/lib/types";

type Staff = { id: string; name: string };
type CostRequest = {
  id: string;
  staff_name: string;
  requested_by_name: string;
  created_at: string;
};
type Viewer = { id: string; isAdmin: boolean; name?: string };
/** Amount is kept as typed text while editing; parsed on save. */
type Draft = EventCostLine & { amountText: string };

const CATEGORY_STYLE: Record<
  EventCostCategory,
  { icon: typeof Plane; className: string; short: string }
> = {
  travel: { icon: Plane, className: "bg-sky-50 text-sky-800", short: "Travel" },
  accommodation: { icon: BedDouble, className: "bg-violet-50 text-violet-800", short: "Accommodation" },
  marketing_materials: { icon: Printer, className: "bg-amber-50 text-amber-800", short: "Materials" },
  other: { icon: MoreHorizontal, className: "bg-teal-50 text-teal-800", short: "Other" },
};

const CELL =
  "h-8 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-sm outline-none transition group-hover:border-border focus:border-accent focus:bg-white";

const ADD_SOMEONE = "__add__";

function toDraft(line: EventCostLine): Draft {
  return { ...line, amountText: line.amount === null ? "" : String(line.amount) };
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function EventCostsModal({
  eventId,
  eventTitle,
  onClose,
  onLinesChange,
}: {
  eventId: string;
  eventTitle: string;
  onClose: () => void;
  /** Keeps the header button count in step without a refetch. */
  onLinesChange?: (lines: EventCostLine[]) => void;
}) {
  const [rows, setRows] = useState<Draft[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [requests, setRequests] = useState<CostRequest[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [requestTo, setRequestTo] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [memberDomains, setMemberDomains] = useState<string[]>(["petersandmay.com"]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [requestSubject, setRequestSubject] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestMsg, setRequestMsg] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  /** Cost-line staff picker: which row is creating a new person. */
  const [addingStaffRowId, setAddingStaffRowId] = useState<string | null>(null);
  const [lineNewName, setLineNewName] = useState("");
  const [lineNewEmail, setLineNewEmail] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);
  const [addingStaffError, setAddingStaffError] = useState("");

  const publish = useCallback(
    (next: Draft[]) => {
      setRows(next);
      onLinesChange?.(next);
    },
    [onLinesChange]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fetch(`/api/events/costs?eventId=${encodeURIComponent(eventId)}`);
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not load costs");
        return;
      }
      setStaff(data.staff ?? []);
      setRequests(Array.isArray(data.requests) ? data.requests : []);
      setViewer(data.viewer ?? null);
      if (Array.isArray(data.memberDomains) && data.memberDomains.length) {
        setMemberDomains(data.memberDomains.filter((domain: unknown) => typeof domain === "string"));
      }
      publish(((data.lines ?? []) as EventCostLine[]).map(toDraft));
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, publish]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (composeOpen) {
        if (!requesting) setComposeOpen(false);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composeOpen, onClose, requesting]);

  const totals = useMemo(() => costTotalsByCurrency(rows), [rows]);
  const tbc = rows.filter((row) => row.amount === null).length;
  const people = new Set(rows.map((row) => row.staff_user_id ?? row.staff_name)).size;

  function setRowError(id: string, message: string) {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }

  function patchLocal(id: string, patch: Partial<Draft>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function save(draft: Draft) {
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
        event_id: eventId,
        category: draft.category,
        description: draft.description,
        amount,
        currency: draft.currency,
        staff_user_id: draft.staff_user_id,
        notes: draft.notes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.line) {
      setRowError(draft.id, typeof data.error === "string" ? data.error : "Could not save");
      return;
    }
    setRowError(draft.id, "");
    setRows((prev) => {
      const next = prev.map((row) =>
        row.id === draft.id ? { ...toDraft(data.line), amountText: row.amountText } : row
      );
      onLinesChange?.(next);
      return next;
    });
  }

  function saveWith(id: string, patch: Partial<Draft>) {
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    const next = { ...row, ...patch };
    patchLocal(id, patch);
    void save(next);
  }

  function rememberStaff(person: Staff) {
    setStaff((prev) => {
      if (prev.some((item) => item.id === person.id)) return prev;
      return [...prev, person].sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  function cancelLineAddStaff() {
    setAddingStaffRowId(null);
    setLineNewName("");
    setLineNewEmail("");
    setAddingStaffError("");
  }

  async function confirmLineAddStaff(rowId: string) {
    const name = lineNewName.trim();
    const email = lineNewEmail.trim();
    if (!name || !email.includes("@")) {
      setAddingStaffError("Enter their name and email");
      return;
    }
    if (!companyEmail(email)) {
      setAddingStaffError("Use their Peters & May email address");
      return;
    }
    setAddingStaff(true);
    setAddingStaffError("");
    const res = await fetch("/api/events/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_staff",
        full_name: name,
        email,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setAddingStaff(false);
    if (!res.ok || !data.staff?.id) {
      setAddingStaffError(
        typeof data.error === "string" ? data.error : "Could not add this person"
      );
      return;
    }
    const person = {
      id: String(data.staff.id),
      name: String(data.staff.name || name),
    };
    rememberStaff(person);
    cancelLineAddStaff();
    saveWith(rowId, { staff_user_id: person.id, staff_name: person.name });
  }

  async function addLine() {
    setAdding(true);
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
        staff_user_id: viewer?.id ?? null,
        notes: "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setAdding(false);
    if (!res.ok || !data.line) {
      setError(typeof data.error === "string" ? data.error : "Could not add a line");
      return;
    }
    publish([...rows, toDraft(data.line)]);
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
    if (addingStaffRowId === id) cancelLineAddStaff();
    publish(rows.filter((row) => row.id !== id));
  }

  const addingSomeone = requestTo === ADD_SOMEONE;

  function companyEmail(email: string) {
    const domain = email.trim().toLowerCase().split("@")[1] ?? "";
    return !!domain && memberDomains.includes(domain);
  }

  function requestRecipient(): { name: string; email?: string } | null {
    if (addingSomeone) {
      const name = newName.trim();
      const email = newEmail.trim();
      if (!name || !email.includes("@")) return null;
      return { name, email };
    }
    const person = staff.find((item) => item.id === requestTo);
    return person ? { name: person.name } : null;
  }

  function openCompose() {
    const recipient = requestRecipient();
    if (!recipient) {
      setRequestMsg({
        tone: "error",
        text: addingSomeone ? "Enter their name and email" : "Choose someone first",
      });
      return;
    }
    if (addingSomeone && recipient.email && !companyEmail(recipient.email)) {
      setRequestMsg({ tone: "error", text: "Use their Peters & May email address" });
      return;
    }
    const draft = defaultCostsRequestDraft({
      eventTitle,
      recipientName: recipient.name,
      requestedBy: viewer?.name || "Marketing",
    });
    setRequestSubject(draft.subject);
    setRequestMessage(draft.message);
    setRequestMsg(null);
    setComposeOpen(true);
  }

  function sentCopy(
    name: string,
    data: { emailed?: boolean; emailSkipped?: string; added?: boolean; invited?: boolean }
  ) {
    const skipped = data.emailSkipped ?? "email not configured";
    if (data.added && data.invited && data.emailed) {
      return `Added ${name} and sent the request. They'll also get an email to set their Hub password.`;
    }
    if (data.added && data.emailed) {
      return `Added ${name} and sent the request.`;
    }
    if (data.added) {
      return `Added ${name}. The email wasn't sent (${skipped}).`;
    }
    if (data.emailed) return `Request sent to ${name} — Hub reminder added`;
    return `Added a Hub reminder for ${name}. The email wasn't sent (${skipped}).`;
  }

  async function sendRequest() {
    const recipient = requestRecipient();
    if (!recipient) {
      setRequestMsg({
        tone: "error",
        text: addingSomeone ? "Enter their name and email" : "Choose someone first",
      });
      return;
    }
    if (!requestSubject.trim()) {
      setRequestMsg({ tone: "error", text: "Add a subject" });
      return;
    }
    if (!requestMessage.trim()) {
      setRequestMsg({ tone: "error", text: "Add a message" });
      return;
    }
    setRequesting(true);
    setRequestMsg(null);
    const res = await fetch("/api/events/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "request",
        event_id: eventId,
        ...(addingSomeone
          ? { email: recipient.email, full_name: recipient.name }
          : { staff_user_id: requestTo }),
        subject: requestSubject.trim(),
        message: requestMessage.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setRequesting(false);
    if (!res.ok) {
      setRequestMsg({
        tone: "error",
        text: typeof data.error === "string" ? data.error : "Could not send the request",
      });
      return;
    }
    const name =
      (typeof data.staff?.name === "string" && data.staff.name) || recipient.name || "them";
    if (data.request?.id) {
      setRequests((prev) => [data.request, ...prev.filter((item) => item.id !== data.request.id)]);
    }
    if (data.staff?.id && data.staff?.name) {
      rememberStaff({ id: data.staff.id, name: data.staff.name });
    }
    setComposeOpen(false);
    setRequestMsg({
      tone: data.emailed ? "ok" : "warn",
      text: sentCopy(name, data),
    });
    setRequestTo("");
    setNewName("");
    setNewEmail("");
    setRequestSubject("");
    setRequestMessage("");
  }

  const staffOptions = (row: Draft) =>
    row.staff_user_id && !staff.some((person) => person.id === row.staff_user_id)
      ? [...staff, { id: row.staff_user_id, name: row.staff_name || "Former user" }]
      : staff;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:left-sidebar md:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-costs-title"
      onClick={onClose}
    >
      <div
        className="surface-card w-full max-w-4xl p-5 shadow-xl md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="event-costs-title" className="font-display text-xl text-brand">
              Costs
            </h3>
            <p className="truncate text-sm text-muted">
              {eventTitle}
              {rows.length
                ? ` · ${rows.length} line${rows.length === 1 ? "" : "s"} · ${people} ${people === 1 ? "person" : "people"}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary !h-8 !w-8 !p-0"
            aria-label="Done"
            title="Done"
            onClick={onClose}
          >
            <Check className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[150px_minmax(0,1.3fr)_150px_150px_minmax(0,1fr)_32px] gap-x-2 px-1 pb-1.5 text-xs text-muted">
              <span>Category</span>
              <span>Description</span>
              <span>Amount</span>
              <span>Staff</span>
              <span>Notes</span>
              <span />
            </div>

            {loading ? (
              <p className="px-2 py-6 text-sm text-muted">Loading costs…</p>
            ) : rows.length === 0 ? (
              <p className="px-2 py-6 text-sm text-muted">
                Add a line for each cost — travel, accommodation, print, or anything else.
              </p>
            ) : (
              <ul>
                {rows.map((row) => {
                  const editable = viewer ? canEditCostLine(row, viewer) : false;
                  const style = CATEGORY_STYLE[row.category] ?? CATEGORY_STYLE.other;
                  const Icon = style.icon;
                  return (
                    <li key={row.id} className="group rounded-lg py-1 hover:bg-background">
                      <div className="grid grid-cols-[150px_minmax(0,1.3fr)_150px_150px_minmax(0,1fr)_32px] items-center gap-x-2">
                        <span className="pl-1">
                          <span
                            className={`relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${style.className}`}
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden />
                            {style.short}
                            {editable ? (
                              <select
                                aria-label="Category"
                                className="absolute inset-0 cursor-pointer opacity-0"
                                value={row.category}
                                onChange={(e) =>
                                  saveWith(row.id, { category: e.target.value as EventCostCategory })
                                }
                              >
                                {COST_CATEGORIES.map((item) => (
                                  <option key={item.value} value={item.value}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </span>
                        </span>

                        {editable ? (
                          <input
                            className={CELL}
                            aria-label="Description"
                            placeholder="What is it?"
                            value={row.description}
                            onChange={(e) => patchLocal(row.id, { description: e.target.value })}
                            onBlur={() => void save(row)}
                          />
                        ) : (
                          <span className="truncate px-2 text-sm text-muted">{row.description}</span>
                        )}

                        {editable ? (
                          <span className="flex items-center">
                            <select
                              aria-label="Currency"
                              className={`${CELL} !w-[60px] shrink-0 !px-1 text-muted`}
                              value={row.currency}
                              onChange={(e) =>
                                saveWith(row.id, { currency: e.target.value as Draft["currency"] })
                              }
                            >
                              {COST_CURRENCIES.map((currency) => (
                                <option key={currency}>{currency}</option>
                              ))}
                            </select>
                            <input
                              className={`${CELL} text-right tabular-nums ${rowErrors[row.id] ? "!border-danger" : ""}`}
                              aria-label="Amount"
                              inputMode="decimal"
                              placeholder="TBC"
                              value={row.amountText}
                              onChange={(e) => patchLocal(row.id, { amountText: e.target.value })}
                              onBlur={() => void save(row)}
                            />
                          </span>
                        ) : (
                          <span className="px-2 text-right text-sm tabular-nums text-muted">
                            {row.amount === null
                              ? `${row.currency} TBC`
                              : formatCostAmount(row.amount, row.currency)}
                          </span>
                        )}

                        <span className="flex min-w-0 items-center gap-1.5 px-1">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sand text-[11px] text-muted">
                            {initials(
                              addingStaffRowId === row.id ? lineNewName || "?" : row.staff_name
                            )}
                          </span>
                          {viewer?.isAdmin ? (
                            <select
                              aria-label="Staff"
                              className={`${CELL} !px-1`}
                              value={
                                addingStaffRowId === row.id
                                  ? ADD_SOMEONE
                                  : (row.staff_user_id ?? "")
                              }
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === ADD_SOMEONE) {
                                  setAddingStaffRowId(row.id);
                                  setLineNewName("");
                                  setLineNewEmail("");
                                  setAddingStaffError("");
                                  return;
                                }
                                if (addingStaffRowId === row.id) cancelLineAddStaff();
                                saveWith(row.id, {
                                  staff_user_id: value || null,
                                  staff_name:
                                    staffOptions(row).find((person) => person.id === value)
                                      ?.name ?? "",
                                });
                              }}
                            >
                              <option value="">Unassigned</option>
                              {staffOptions(row).map((person) => (
                                <option key={person.id} value={person.id}>
                                  {person.name}
                                </option>
                              ))}
                              <option value={ADD_SOMEONE}>Add someone…</option>
                            </select>
                          ) : (
                            <span className="truncate text-sm text-muted">
                              {row.staff_name || "Unassigned"}
                            </span>
                          )}
                        </span>

                        {editable ? (
                          <input
                            className={`${CELL} text-muted`}
                            aria-label="Notes"
                            placeholder="Add a note"
                            value={row.notes}
                            onChange={(e) => patchLocal(row.id, { notes: e.target.value })}
                            onBlur={() => void save(row)}
                          />
                        ) : (
                          <span className="truncate px-2 text-sm text-muted">{row.notes}</span>
                        )}

                        {editable ? (
                          <button
                            type="button"
                            aria-label="Remove line"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100"
                            onClick={() => void removeLine(row.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        ) : (
                          <Lock className="mx-auto h-3.5 w-3.5 text-muted" aria-label="Read only" />
                        )}
                      </div>
                      {addingStaffRowId === row.id ? (
                        <div className="mt-1 grid gap-2 rounded-lg bg-background p-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                          <input
                            className="field !h-8"
                            aria-label="New staff name"
                            placeholder="Name"
                            value={lineNewName}
                            disabled={addingStaff}
                            onChange={(e) => {
                              setLineNewName(e.target.value);
                              setAddingStaffError("");
                            }}
                          />
                          <input
                            className="field !h-8"
                            aria-label="New staff email"
                            type="email"
                            placeholder="name@petersandmay.com"
                            autoComplete="off"
                            value={lineNewEmail}
                            disabled={addingStaff}
                            onChange={(e) => {
                              setLineNewEmail(e.target.value);
                              setAddingStaffError("");
                            }}
                          />
                          <button
                            type="button"
                            className="btn-primary !h-8 !px-3"
                            disabled={addingStaff}
                            onClick={() => void confirmLineAddStaff(row.id)}
                          >
                            {addingStaff ? "Adding…" : "Add"}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost !h-8 !px-2"
                            disabled={addingStaff}
                            onClick={cancelLineAddStaff}
                          >
                            Cancel
                          </button>
                          <p className="text-xs text-muted sm:col-span-4">
                            They will be added as a Hub member using their Peters & May email.
                          </p>
                          {addingStaffError ? (
                            <p className="text-xs text-danger sm:col-span-4">{addingStaffError}</p>
                          ) : null}
                        </div>
                      ) : null}
                      {rowErrors[row.id] ? (
                        <p className="px-2 pt-1 text-xs text-danger">{rowErrors[row.id]}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <button
          type="button"
          className="btn-ghost mt-2 !px-2 !py-1.5"
          disabled={adding || loading}
          onClick={() => void addLine()}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {adding ? "Adding…" : "Add line"}
        </button>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="mr-1 text-xs text-muted">Total</span>
          {totals.length ? (
            totals.map((item) => (
              <span
                key={item.currency}
                className="rounded-full bg-background px-3 py-1 text-sm font-medium tabular-nums"
              >
                {formatCostAmount(item.total, item.currency)}
              </span>
            ))
          ) : (
            <span className="text-sm text-muted">No amounts yet</span>
          )}
          <span className="ml-auto text-xs text-muted">
            {tbc ? `${tbc} TBC · ` : ""}not converted
          </span>
        </div>

        <div className="mt-4 rounded-xl bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Send className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <select
              aria-label="Request costs from"
              className="field !h-9 min-w-[160px] flex-1 !py-1.5"
              value={requestTo}
              onChange={(e) => {
                setRequestTo(e.target.value);
                setRequestMsg(null);
              }}
            >
              <option value="">Ask someone for their costs…</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
              <option value={ADD_SOMEONE}>Add someone…</option>
            </select>
            <button
              type="button"
              className="btn-primary !py-1.5"
              disabled={requesting}
              onClick={openCompose}
            >
              Draft email
            </button>
          </div>
          {addingSomeone ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                className="field !h-9"
                aria-label="Name"
                placeholder="Name"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setRequestMsg(null);
                }}
              />
              <input
                className="field !h-9"
                aria-label="Email"
                type="email"
                placeholder="name@petersandmay.com"
                autoComplete="off"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setRequestMsg(null);
                }}
              />
              <p className="text-xs text-muted sm:col-span-2">
                They will be added as a Hub member when you send, using their Peters & May email.
              </p>
            </div>
          ) : null}
          {requests.length ? (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-1.5 text-xs text-muted">Requested</p>
              <ul className="max-h-28 space-y-1 overflow-y-auto">
                {requests.map((item) => (
                  <li key={item.id} className="text-xs text-muted">
                    <span className="text-foreground">{item.staff_name}</span>
                    {", asked by "}
                    {item.requested_by_name}
                    {" · "}
                    {new Intl.DateTimeFormat("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(item.created_at))}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!composeOpen && requestMsg ? (
            <p
              className={`mt-2 text-xs ${
                requestMsg.tone === "ok"
                  ? "text-success"
                  : requestMsg.tone === "warn"
                    ? "text-muted"
                    : "text-danger"
              }`}
            >
              {requestMsg.text}
            </p>
          ) : null}
        </div>
      </div>

      {composeOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 md:left-sidebar md:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="costs-request-title"
          onClick={() => {
            if (!requesting) setComposeOpen(false);
          }}
        >
          <div
            className="surface-card w-full max-w-lg p-5 shadow-xl md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 id="costs-request-title" className="font-display text-lg text-brand">
                  Request costs
                </h4>
                <p className="truncate text-sm text-muted">
                  To{" "}
                  {addingSomeone
                    ? `${newName.trim()}${newEmail.trim() ? ` · ${newEmail.trim()}` : ""}`
                    : (staff.find((person) => person.id === requestTo)?.name ?? "staff member")}
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost !p-1.5"
                aria-label="Close"
                disabled={requesting}
                onClick={() => setComposeOpen(false)}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs text-muted">Subject</span>
              <input
                className="field"
                value={requestSubject}
                onChange={(e) => setRequestSubject(e.target.value)}
                disabled={requesting}
              />
            </label>

            <label className="mb-2 block">
              <span className="mb-1 block text-xs text-muted">Message</span>
              <textarea
                className="field min-h-[220px] resize-y font-sans leading-relaxed"
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                disabled={requesting}
              />
            </label>
            <p className="mb-4 text-xs text-muted">
              The email will include a link to this costs sheet under your message.
            </p>

            {requestMsg ? (
              <p
                className={`mb-3 text-xs ${
                  requestMsg.tone === "ok"
                    ? "text-success"
                    : requestMsg.tone === "warn"
                      ? "text-muted"
                      : "text-danger"
                }`}
              >
                {requestMsg.text}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn-ghost"
                disabled={requesting}
                onClick={() => setComposeOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={requesting}
                onClick={() => void sendRequest()}
              >
                {requesting ? "Sending…" : "Send request"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
