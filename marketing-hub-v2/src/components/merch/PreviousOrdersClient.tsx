"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { FormAlert } from "@/components/ui/FormAlert";
import { getMerchOrderItems } from "@/lib/merch/order-items";
import type { MerchIssuedLine, MerchIssuedPerson, MerchOrder } from "@/lib/types";
import { cn } from "@/lib/utils";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1];

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyLine(): MerchIssuedLine {
  return {
    id: newId("line"),
    item: "",
    size: "",
    quantity: 1,
    colour: "",
    note: "",
  };
}

function deliveredToPeople(orders: MerchOrder[]): MerchIssuedPerson[] {
  return orders
    .filter((order) => order.status === "delivered")
    .map((order) => {
      const when = order.updated_at || order.created_at;
      const year = when ? new Date(when).getFullYear() : CURRENT_YEAR;
      return {
        id: `delivered_${order.id}`,
        name: order.requested_for || order.created_by || "Unknown",
        year: Number.isFinite(year) ? year : CURRENT_YEAR,
        lines: getMerchOrderItems(order).map((line, index) => ({
          id: line.id || `line_${index}`,
          item: line.is_other
            ? (line.other_description ?? "").trim() || "Other"
            : line.item,
          size: line.size || "",
          quantity: line.quantity || 1,
          colour: line.colour || "",
          note: "",
        })),
        source: "delivered" as const,
        merch_order_id: order.id,
        created_at: order.created_at,
        updated_at: order.updated_at,
      };
    });
}

function mergePeople(
  stored: MerchIssuedPerson[],
  delivered: MerchOrder[]
): MerchIssuedPerson[] {
  const fromOrders = deliveredToPeople(delivered);
  const knownOrderIds = new Set(
    stored
      .map((person) => person.merch_order_id)
      .filter((id): id is string => Boolean(id))
  );
  const extras = fromOrders.filter(
    (person) =>
      !person.merch_order_id || !knownOrderIds.has(person.merch_order_id)
  );
  return [...stored, ...extras];
}

function tallyLines(people: MerchIssuedPerson[]) {
  const map = new Map<string, number>();
  for (const person of people) {
    for (const line of person.lines) {
      const item = line.item.trim() || "Untitled";
      const size = line.size.trim() || "—";
      const key = `${item}|||${size}`;
      map.set(key, (map.get(key) ?? 0) + (line.quantity || 0));
    }
  }
  return Array.from(map.entries())
    .map(([key, quantity]) => {
      const [item, size] = key.split("|||");
      return { item, size, quantity };
    })
    .sort((a, b) => {
      const itemCmp = a.item.localeCompare(b.item);
      if (itemCmp !== 0) return itemCmp;
      return a.size.localeCompare(b.size);
    });
}

export function PreviousOrdersClient({
  deliveredOrders = [],
}: {
  deliveredOrders?: MerchOrder[];
}) {
  const [people, setPeople] = useState<MerchIssuedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const saveTimer = useRef<number | null>(null);
  const skipNextSave = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/merch/issued");
      if (!res.ok) {
        setError("Could not load previous orders");
        return;
      }
      const data = (await res.json()) as { people?: MerchIssuedPerson[] };
      skipNextSave.current = true;
      setPeople(mergePeople(data.people ?? [], deliveredOrders));
    } catch {
      setError("Could not load previous orders");
    } finally {
      setLoading(false);
    }
  }, [deliveredOrders]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(async (next: MerchIssuedPerson[]) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/merch/issued", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ people: next }),
      });
      if (!res.ok) {
        setError("Could not save changes");
        return;
      }
      const data = (await res.json()) as { people?: MerchIssuedPerson[] };
      if (data.people) {
        skipNextSave.current = true;
        setPeople(mergePeople(data.people, deliveredOrders));
      }
    } catch {
      setError("Could not save changes");
    } finally {
      setSaving(false);
    }
  }, [deliveredOrders]);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (loading) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(people);
    }, 700);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [people, persist, loading]);

  const filtered = useMemo(() => {
    return people.filter((person) =>
      matchesSearch(search, [
        person.name,
        String(person.year),
        ...person.lines.flatMap((line) => [
          line.item,
          line.size,
          line.colour,
          line.note,
          String(line.quantity),
        ]),
      ])
    );
  }, [people, search]);

  function updatePerson(id: string, patch: Partial<MerchIssuedPerson>) {
    setPeople((prev) =>
      prev.map((person) =>
        person.id === id
          ? { ...person, ...patch, updated_at: new Date().toISOString() }
          : person
      )
    );
  }

  function updateLine(
    personId: string,
    lineId: string,
    patch: Partial<MerchIssuedLine>
  ) {
    setPeople((prev) =>
      prev.map((person) => {
        if (person.id !== personId) return person;
        return {
          ...person,
          updated_at: new Date().toISOString(),
          lines: person.lines.map((line) =>
            line.id === lineId ? { ...line, ...patch } : line
          ),
        };
      })
    );
  }

  function addLine(personId: string) {
    setPeople((prev) =>
      prev.map((person) =>
        person.id === personId
          ? {
              ...person,
              updated_at: new Date().toISOString(),
              lines: [...person.lines, emptyLine()],
            }
          : person
      )
    );
  }

  function removeLine(personId: string, lineId: string) {
    setPeople((prev) =>
      prev.map((person) =>
        person.id === personId
          ? {
              ...person,
              updated_at: new Date().toISOString(),
              lines: person.lines.filter((line) => line.id !== lineId),
            }
          : person
      )
    );
  }

  function addPerson(year: number) {
    const person: MerchIssuedPerson = {
      id: newId("iss"),
      name: "",
      year,
      lines: [emptyLine()],
      source: "manual",
      merch_order_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setPeople((prev) => [person, ...prev]);
  }

  function removePerson(id: string) {
    if (!window.confirm("Remove this person from previous orders?")) return;
    setPeople((prev) => prev.filter((person) => person.id !== id));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">
          Issued kit by year — one person per row, with item, size and quantity
          for future reference. Edits save automatically. Delivered shop orders
          appear here when marked delivered.
        </p>
        <p className="text-xs text-muted" aria-live="polite">
          {saving ? "Saving…" : loading ? "Loading…" : "Saved"}
        </p>
      </div>

      <FormAlert message={error} />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, item or size…"
        resultCount={filtered.length}
        totalCount={people.length}
      />

      {loading ? (
        <p className="text-sm text-muted">Loading previous orders…</p>
      ) : (
        <div className="space-y-8">
          {YEARS.map((year) => {
            const yearPeople = filtered
              .filter((person) => person.year === year)
              .sort((a, b) => a.name.localeCompare(b.name));
            const tallies = tallyLines(yearPeople);
            return (
              <YearTable
                key={year}
                year={year}
                people={yearPeople}
                tallies={tallies}
                onAddPerson={() => addPerson(year)}
                onUpdatePerson={updatePerson}
                onUpdateLine={updateLine}
                onAddLine={addLine}
                onRemoveLine={removeLine}
                onRemovePerson={removePerson}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function YearTable({
  year,
  people,
  tallies,
  onAddPerson,
  onUpdatePerson,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
  onRemovePerson,
}: {
  year: number;
  people: MerchIssuedPerson[];
  tallies: { item: string; size: string; quantity: number }[];
  onAddPerson: () => void;
  onUpdatePerson: (id: string, patch: Partial<MerchIssuedPerson>) => void;
  onUpdateLine: (
    personId: string,
    lineId: string,
    patch: Partial<MerchIssuedLine>
  ) => void;
  onAddLine: (personId: string) => void;
  onRemoveLine: (personId: string, lineId: string) => void;
  onRemovePerson: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-sand/40 px-4 py-3">
        <h3 className="font-display text-lg text-brand">{year}</h3>
        <button type="button" className="btn-secondary text-sm" onClick={onAddPerson}>
          Add person
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-sand/20 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Name</th>
              <th className="px-4 py-2.5 font-semibold">Item</th>
              <th className="px-4 py-2.5 font-semibold">Size</th>
              <th className="px-4 py-2.5 font-semibold">Qty</th>
              <th className="px-4 py-2.5 font-semibold">Colour / note</th>
              <th className="px-4 py-2.5 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {people.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No people recorded for {year}.
                </td>
              </tr>
            ) : (
              people.map((person) => (
                <PersonBlock
                  key={person.id}
                  person={person}
                  onUpdatePerson={onUpdatePerson}
                  onUpdateLine={onUpdateLine}
                  onAddLine={onAddLine}
                  onRemoveLine={onRemoveLine}
                  onRemovePerson={onRemovePerson}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {tallies.length > 0 ? (
        <div className="border-t border-border bg-sand/20 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {year} tallies
          </p>
          <div className="flex flex-wrap gap-2">
            {tallies.map((row) => (
              <span
                key={`${row.item}-${row.size}`}
                className="rounded-full border border-border bg-white px-2.5 py-1 text-xs text-foreground"
              >
                {row.item}
                <span className="text-muted"> · {row.size}</span>
                <span className="ml-1 font-semibold">{row.quantity}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PersonBlock({
  person,
  onUpdatePerson,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
  onRemovePerson,
}: {
  person: MerchIssuedPerson;
  onUpdatePerson: (id: string, patch: Partial<MerchIssuedPerson>) => void;
  onUpdateLine: (
    personId: string,
    lineId: string,
    patch: Partial<MerchIssuedLine>
  ) => void;
  onAddLine: (personId: string) => void;
  onRemoveLine: (personId: string, lineId: string) => void;
  onRemovePerson: (id: string) => void;
}) {
  const lines = person.lines;
  const rowSpan = Math.max(lines.length, 1) + 1;

  return (
    <>
      {lines.length === 0 ? (
        <tr className="border-b border-border/70 border-t border-border align-top">
          <td className="px-4 py-2" rowSpan={rowSpan}>
            <NameCell person={person} onUpdatePerson={onUpdatePerson} />
          </td>
          <td className="px-4 py-2 italic text-muted" colSpan={4}>
            No items recorded
          </td>
          <td className="px-4 py-2" />
        </tr>
      ) : (
        lines.map((line, index) => (
          <tr
            key={line.id}
            className={cn(
              "border-b border-border/70 align-top",
              index === 0 && "border-t border-border"
            )}
          >
            {index === 0 ? (
              <td className="px-4 py-2" rowSpan={rowSpan}>
                <NameCell person={person} onUpdatePerson={onUpdatePerson} />
              </td>
            ) : null}
            <td className="px-4 py-2">
              <input
                className="field w-full min-w-[10rem]"
                value={line.item}
                placeholder="Item"
                onChange={(e) =>
                  onUpdateLine(person.id, line.id, { item: e.target.value })
                }
              />
            </td>
            <td className="px-4 py-2">
              <input
                className="field w-20"
                value={line.size}
                placeholder="Size"
                onChange={(e) =>
                  onUpdateLine(person.id, line.id, { size: e.target.value })
                }
              />
            </td>
            <td className="px-4 py-2">
              <input
                className="field w-16"
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) =>
                  onUpdateLine(person.id, line.id, {
                    quantity: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </td>
            <td className="px-4 py-2">
              <div className="flex flex-col gap-1 sm:flex-row">
                <input
                  className="field w-full min-w-[6rem]"
                  value={line.colour}
                  placeholder="Colour"
                  onChange={(e) =>
                    onUpdateLine(person.id, line.id, { colour: e.target.value })
                  }
                />
                <input
                  className="field w-full min-w-[6rem]"
                  value={line.note}
                  placeholder="Note"
                  onChange={(e) =>
                    onUpdateLine(person.id, line.id, { note: e.target.value })
                  }
                />
              </div>
            </td>
            <td className="px-4 py-2">
              <button
                type="button"
                className="text-xs text-muted hover:text-foreground"
                onClick={() => onRemoveLine(person.id, line.id)}
              >
                Remove
              </button>
            </td>
          </tr>
        ))
      )}
      <tr className="border-b border-border bg-sand/10">
        <td className="px-4 py-2" colSpan={4}>
          <button
            type="button"
            className="text-xs font-medium text-brand hover:underline"
            onClick={() => onAddLine(person.id)}
          >
            + Add item
          </button>
        </td>
        <td className="px-4 py-2">
          <button
            type="button"
            className="text-xs text-muted hover:text-red-700"
            onClick={() => onRemovePerson(person.id)}
          >
            Delete
          </button>
        </td>
      </tr>
    </>
  );
}

function NameCell({
  person,
  onUpdatePerson,
}: {
  person: MerchIssuedPerson;
  onUpdatePerson: (id: string, patch: Partial<MerchIssuedPerson>) => void;
}) {
  return (
    <>
      <input
        className="field w-full min-w-[9rem] font-medium"
        value={person.name}
        placeholder="Name"
        onChange={(e) => onUpdatePerson(person.id, { name: e.target.value })}
      />
      <p className="mt-1 text-[11px] text-muted">
        {person.source === "delivered"
          ? "From delivered order"
          : person.source === "manual"
            ? "Added manually"
            : "Original issue"}
      </p>
    </>
  );
}
