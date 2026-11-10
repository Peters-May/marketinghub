"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { FormAlert } from "@/components/ui/FormAlert";
import { getMerchOrderItems } from "@/lib/merch/order-items";
import type { MerchIssuedLine, MerchIssuedPerson, MerchOrder } from "@/lib/types";
import { cn } from "@/lib/utils";

const CURRENT_YEAR = new Date().getFullYear();

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

function nameKey(name: string) {
  return name.trim().toLowerCase() || "unnamed";
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

/** Item-only tallies (size is for person rows, not totals). */
function tallyItems(records: MerchIssuedPerson[]) {
  const map = new Map<string, number>();
  for (const record of records) {
    for (const line of record.lines) {
      const item = line.item.trim() || "Untitled";
      map.set(item, (map.get(item) ?? 0) + (line.quantity || 0));
    }
  }
  return Array.from(map.entries())
    .map(([item, quantity]) => ({ item, quantity }))
    .sort((a, b) => a.item.localeCompare(b.item));
}

type PersonGroup = {
  key: string;
  name: string;
  records: MerchIssuedPerson[];
};

function groupByPerson(records: MerchIssuedPerson[]): PersonGroup[] {
  const map = new Map<string, MerchIssuedPerson[]>();
  for (const record of records) {
    const key = nameKey(record.name);
    const list = map.get(key) ?? [];
    list.push(record);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return a.id.localeCompare(b.id);
      });
      const named =
        sorted.find((row) => row.name.trim())?.name.trim() || "Unnamed";
      return { key, name: named, records: sorted };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
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

  const persist = useCallback(
    async (next: MerchIssuedPerson[]) => {
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
    },
    [deliveredOrders]
  );

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

  const groups = useMemo(() => groupByPerson(filtered), [filtered]);
  const overallTallies = useMemo(() => tallyItems(filtered), [filtered]);

  function renameGroup(group: PersonGroup, nextName: string) {
    const keys = new Set(group.records.map((row) => row.id));
    setPeople((prev) =>
      prev.map((person) =>
        keys.has(person.id)
          ? {
              ...person,
              name: nextName,
              updated_at: new Date().toISOString(),
            }
          : person
      )
    );
  }

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

  function addPerson() {
    const person: MerchIssuedPerson = {
      id: newId("iss"),
      name: "",
      year: CURRENT_YEAR,
      lines: [emptyLine()],
      source: "manual",
      merch_order_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setPeople((prev) => [person, ...prev]);
  }

  function addYearToPerson(group: PersonGroup, year: number) {
    const template = group.records[0];
    const person: MerchIssuedPerson = {
      id: newId("iss"),
      name: group.name || template?.name || "",
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
    if (!window.confirm("Remove this year block from previous orders?")) return;
    setPeople((prev) => prev.filter((person) => person.id !== id));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">
          Issued kit by person — years stacked under each name, with size kept
          on the person rows for reference. Tallies count items only. Edits save
          automatically.
        </p>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted" aria-live="polite">
            {saving ? "Saving…" : loading ? "Loading…" : "Saved"}
          </p>
          <button type="button" className="btn-secondary text-sm" onClick={addPerson}>
            Add person
          </button>
        </div>
      </div>

      <FormAlert message={error} />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, item or size…"
        resultCount={groups.length}
        totalCount={groupByPerson(people).length}
      />

      {loading ? (
        <p className="text-sm text-muted">Loading previous orders…</p>
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border border-border bg-white px-4 py-8 text-center text-sm text-muted shadow-sm">
          No people recorded yet.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <PersonCard
              key={group.key}
              group={group}
              onRename={(name) => renameGroup(group, name)}
              onAddYear={(year) => addYearToPerson(group, year)}
              onUpdatePerson={updatePerson}
              onUpdateLine={updateLine}
              onAddLine={addLine}
              onRemoveLine={removeLine}
              onRemovePerson={removePerson}
            />
          ))}

          {overallTallies.length > 0 ? (
            <section className="rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Item tallies
              </p>
              <div className="flex flex-wrap gap-2">
                {overallTallies.map((row) => (
                  <span
                    key={row.item}
                    className="rounded-full border border-border bg-sand/30 px-2.5 py-1 text-xs text-foreground"
                  >
                    {row.item}
                    <span className="ml-1 font-semibold">{row.quantity}</span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PersonCard({
  group,
  onRename,
  onAddYear,
  onUpdatePerson,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
  onRemovePerson,
}: {
  group: PersonGroup;
  onRename: (name: string) => void;
  onAddYear: (year: number) => void;
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
  const yearsPresent = new Set(group.records.map((row) => row.year));
  const nextYear = yearsPresent.has(CURRENT_YEAR)
    ? CURRENT_YEAR - 1
    : CURRENT_YEAR;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-sand/40 px-4 py-3">
        <input
          className="field max-w-md flex-1 font-display text-lg text-brand"
          value={group.name}
          placeholder="Name"
          onChange={(e) => onRename(e.target.value)}
        />
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => onAddYear(nextYear)}
        >
          Add {nextYear}
        </button>
      </div>

      <div className="divide-y divide-border">
        {group.records.map((record) => (
          <YearBlock
            key={record.id}
            record={record}
            onUpdatePerson={onUpdatePerson}
            onUpdateLine={onUpdateLine}
            onAddLine={onAddLine}
            onRemoveLine={onRemoveLine}
            onRemovePerson={onRemovePerson}
          />
        ))}
      </div>
    </section>
  );
}

function YearBlock({
  record,
  onUpdatePerson,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
  onRemovePerson,
}: {
  record: MerchIssuedPerson;
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
  const lines = record.lines;

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">
            Year
          </label>
          <input
            className="field w-24"
            type="number"
            value={record.year}
            onChange={(e) =>
              onUpdatePerson(record.id, {
                year: Number(e.target.value) || CURRENT_YEAR,
              })
            }
          />
          <span className="text-[11px] text-muted">
            {record.source === "delivered"
              ? "From delivered order"
              : record.source === "manual"
                ? "Added manually"
                : "Original issue"}
          </span>
        </div>
        <button
          type="button"
          className="text-xs text-muted hover:text-red-700"
          onClick={() => onRemovePerson(record.id)}
        >
          Remove year
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-sand/20 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="px-3 py-2 font-semibold">Size</th>
              <th className="px-3 py-2 font-semibold">Qty</th>
              <th className="px-3 py-2 font-semibold">Colour / note</th>
              <th className="px-3 py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 italic text-muted">
                  No items recorded
                </td>
              </tr>
            ) : (
              lines.map((line, index) => (
                <tr
                  key={line.id}
                  className={cn(
                    "border-t border-border/70 align-top",
                    index === 0 && "border-t-0"
                  )}
                >
                  <td className="px-3 py-2">
                    <input
                      className="field w-full min-w-[10rem]"
                      value={line.item}
                      placeholder="Item"
                      onChange={(e) =>
                        onUpdateLine(record.id, line.id, {
                          item: e.target.value,
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="field w-20"
                      value={line.size}
                      placeholder="Size"
                      onChange={(e) =>
                        onUpdateLine(record.id, line.id, {
                          size: e.target.value,
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="field w-16"
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) =>
                        onUpdateLine(record.id, line.id, {
                          quantity: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1 sm:flex-row">
                      <input
                        className="field w-full min-w-[6rem]"
                        value={line.colour}
                        placeholder="Colour"
                        onChange={(e) =>
                          onUpdateLine(record.id, line.id, {
                            colour: e.target.value,
                          })
                        }
                      />
                      <input
                        className="field w-full min-w-[6rem]"
                        value={line.note}
                        placeholder="Note"
                        onChange={(e) =>
                          onUpdateLine(record.id, line.id, {
                            note: e.target.value,
                          })
                        }
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-xs text-muted hover:text-foreground"
                      onClick={() => onRemoveLine(record.id, line.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="mt-2 text-xs font-medium text-brand hover:underline"
        onClick={() => onAddLine(record.id)}
      >
        + Add item
      </button>
    </div>
  );
}
