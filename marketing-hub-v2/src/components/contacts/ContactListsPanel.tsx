"use client";

import { useMemo, useState } from "react";
import type { Contact, MediaList } from "@/lib/types";
import { matchesSearch } from "@/components/ui/FilterBar";
import { cn } from "@/lib/utils";

export function ContactListsPanel({
  contacts,
  lists,
  canDelete,
  busy,
  onCreate,
  onToggle,
  onDelete,
}: {
  contacts: Contact[];
  lists: MediaList[];
  canDelete: boolean;
  busy: boolean;
  onCreate: (input: { name: string; description: string }) => Promise<void>;
  onToggle: (listId: string, contactId: string) => Promise<void>;
  onDelete: (listId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");

  const selected = lists.find((list) => list.id === selectedId) ?? null;

  const members = useMemo(() => {
    if (!selected) return [];
    const onList = new Set(selected.contact_ids);
    const query = memberSearch.trim();
    const pool = query
      ? contacts.filter((contact) =>
          matchesSearch(query, [
            contact.name,
            contact.email,
            contact.organisation,
            contact.outlet,
            contact.role,
          ])
        )
      : contacts.filter((contact) => onList.has(contact.id));
    return pool.slice(0, 80);
  }, [contacts, memberSearch, selected]);

  async function create() {
    const nextName = name.trim();
    if (!nextName) return;
    await onCreate({ name: nextName, description: description.trim() });
    setName("");
    setDescription("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="surface-card space-y-3 p-4">
          <h2 className="font-display text-lg text-brand">New list</h2>
          <p className="text-sm text-muted">
            Segments are groups of contacts. PR media lists and pitches use
            these. Portal lists are not included.
          </p>
          <input
            className="field"
            placeholder="List name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="field min-h-[5rem]"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !name.trim()}
            onClick={() => void create()}
          >
            Create list
          </button>
        </div>
        {lists.length === 0 ? (
          <p className="text-sm text-muted">No lists yet.</p>
        ) : (
          <ul className="space-y-2">
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(list.id);
                    setMemberSearch("");
                  }}
                  className={cn(
                    "w-full rounded-xl border px-4 py-3 text-left",
                    selectedId === list.id
                      ? "border-accent bg-accent-soft"
                      : "border-brand/10 bg-white hover:border-brand/25"
                  )}
                >
                  <div className="font-medium text-brand">{list.name}</div>
                  <div className="text-xs text-muted">
                    {list.contact_ids.length} contact
                    {list.contact_ids.length === 1 ? "" : "s"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="surface-card p-4">
        {selected ? (
          <>
            <h2 className="font-display text-lg text-brand">{selected.name}</h2>
            <p className="mb-3 text-sm text-muted">
              {selected.description ||
                "Search contacts to add them. An empty search shows who is already on the list."}
            </p>
            <input
              className="field mb-3"
              placeholder="Search contacts to add…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
            {members.length === 0 ? (
              <p className="text-sm text-muted">
                {memberSearch.trim()
                  ? "No contacts match that search."
                  : "This list is empty. Search for a contact to add them."}
              </p>
            ) : (
              <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
                {members.map((contact) => {
                  const on = selected.contact_ids.includes(contact.id);
                  return (
                    <li
                      key={contact.id}
                      className="flex items-center justify-between gap-2 border-b border-brand/5 py-2 text-sm"
                    >
                      <span>
                        {contact.name}
                        <span className="text-muted">
                          {" "}
                          — {contact.organisation || contact.email || "No email"}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onToggle(selected.id, contact.id)}
                        className={cn(
                          "rounded px-2 py-1 text-xs",
                          on ? "bg-brand text-white" : "bg-mist text-brand"
                        )}
                      >
                        {on ? "On list" : "Add"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {canDelete ? (
              <button
                type="button"
                className="mt-4 text-sm text-muted underline"
                onClick={() => void onDelete(selected.id)}
              >
                Delete list
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">Select a list to manage members.</p>
        )}
      </div>
    </div>
  );
}
