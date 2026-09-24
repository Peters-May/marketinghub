"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Contact, ContactKind, HubUser } from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { SegmentFilter } from "@/components/ui/SegmentFilter";
import { useHubView } from "@/lib/hub-view";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { plainTextFromHtml } from "@/lib/plain-text";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { RecordDrawer } from "@/components/ui/RecordDrawer";

type KindFilter = "all" | ContactKind;

const emptyForm = {
  kind: "person" as ContactKind,
  name: "",
  organisation: "",
  role: "",
  email: "",
  phone: "",
  website: "",
  services: "",
  tags: "",
  notes: "",
  user_id: "",
  is_press: false,
  beat: "",
  outlet: "",
  country: "",
  preferred_topics: "",
};

type ContactForm = typeof emptyForm;

function toForm(c: Contact): ContactForm {
  return {
    kind: c.kind === "company" ? "company" : "person",
    name: c.name,
    organisation: c.organisation,
    role: c.role,
    email: c.email,
    phone: c.phone,
    website: c.website ?? "",
    services: c.services ?? "",
    tags: c.tags.join(", "),
    notes: c.notes,
    user_id: c.user_id ?? "",
    is_press: Boolean(c.is_press),
    beat: c.beat ?? "",
    outlet: c.outlet ?? "",
    country: c.country ?? "",
    preferred_topics: c.preferred_topics ?? "",
  };
}

function isCompany(kind: ContactKind | string | undefined) {
  return kind === "company";
}

function parseTags(tags: string | string[]) {
  return Array.isArray(tags)
    ? tags
    : String(tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
}

export function ContactsClient({
  initial,
  initialSelectedId,
}: {
  initial: Contact[];
  initialSelectedId?: string;
}) {
  const { canToggleAdminView } = useHubView();
  const canDelete = canToggleAdminView;

  const [items, setItems] = useState(initial);
  const [users, setUsers] = useState<HubUser[]>([]);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [selected, setSelected] = useState<Contact | null>(
    () => initial.find((contact) => contact.id === initialSelectedId) ?? null
  );
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<ContactForm | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/contacts");
    const data = await res.json();
    setItems(data.contacts ?? []);
  }, []);

  const refreshUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      /* non-admin / unavailable */
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshUsers();
  }, [refresh, refreshUsers]);

  useEffect(() => {
    if (!selected) return;
    const next = items.find((c) => c.id === selected.id) ?? null;
    setSelected(next);
    // Only re-sync when the list or selected id changes, not on every selected object update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected intentionally omitted
  }, [items, selected?.id]);

  const userById = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u]));
    return map;
  }, [users]);

  const tags = useMemo(() => {
    const set = new Set(items.flatMap((c) => c.tags).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((c) => {
      if (
        !matchesSearch(search, [
          c.name,
          c.organisation,
          c.role,
          c.email,
          c.website,
          c.services,
          c.outlet,
          c.beat,
          c.country,
          c.preferred_topics,
          c.tags.join(" "),
          plainTextFromHtml(c.notes),
          c.user_id ? userById.get(c.user_id)?.full_name ?? "" : "",
          c.user_id ? userById.get(c.user_id)?.email ?? "" : "",
        ])
      ) {
        return false;
      }
      if (kindFilter !== "all" && (c.kind ?? "person") !== kindFilter) {
        return false;
      }
      if (tagFilter !== "all" && !c.tags.includes(tagFilter)) return false;
      return true;
    });
  }, [items, search, kindFilter, tagFilter, userById]);

  async function create() {
    await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        organisation: isCompany(form.kind)
          ? form.organisation.trim() || form.name.trim()
          : form.organisation,
        user_id: isCompany(form.kind) ? null : form.user_id || null,
        is_press: form.is_press,
        beat: form.beat,
        outlet: form.outlet,
        country: form.country,
        preferred_topics: form.preferred_topics,
      }),
    });
    setShowForm(false);
    setForm(emptyForm);
    await refresh();
  }

  function openEdit(contact: Contact) {
    setEditingId(contact.id);
    setEdit(toForm(contact));
  }

  function closeEdit() {
    setEditingId(null);
    setEdit(null);
  }

  async function saveEdit() {
    if (!editingId || !edit) return;
    setSaving(true);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingId,
          patch: {
            kind: edit.kind,
            name: edit.name.trim() || (isCompany(edit.kind) ? "Company" : "Contact"),
            organisation: isCompany(edit.kind)
              ? edit.organisation.trim() || edit.name.trim()
              : edit.organisation,
            role: edit.role,
            email: edit.email,
            phone: edit.phone,
            website: edit.website,
            services: edit.services,
            tags: parseTags(edit.tags),
            notes: edit.notes,
            user_id: isCompany(edit.kind) ? null : edit.user_id || null,
            is_press: edit.is_press,
            beat: edit.beat,
            outlet: edit.outlet,
            country: edit.country,
            preferred_topics: edit.preferred_topics,
          },
        }),
      });
      closeEdit();
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!canDelete) return;
    if (!window.confirm("Delete this contact?")) return;
    await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    if (selected?.id === id) setSelected(null);
    if (editingId === id) closeEdit();
    await refresh();
  }

  function linkedLabel(userId: string | null | undefined) {
    if (!userId) return null;
    const u = userById.get(userId);
    if (!u) return "Linked user";
    return u.full_name || u.email || "Linked user";
  }

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="People, press, and supplier companies (North Sails, printers, and similar)."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setForm({
                ...emptyForm,
                kind: kindFilter === "company" ? "company" : "person",
              });
              setShowForm(true);
            }}
          >
            Add {kindFilter === "company" ? "company" : "contact"}
          </button>
        }
      />

      <SegmentFilter
        label="Contact type"
        value={kindFilter}
        onChange={setKindFilter}
        options={[
          { id: "all", label: "All" },
          { id: "person", label: "People" },
          { id: "company", label: "Companies" },
        ]}
        size="md"
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, organisation, email…"
        resultCount={filtered.length}
        totalCount={items.length}
        selects={[
          {
            id: "tag",
            label: "Tag",
            value: tagFilter,
            onChange: setTagFilter,
            options: [
              { value: "all", label: "All tags" },
              ...tags.map((t) => ({ value: t, label: t })),
            ],
          },
        ]}
      />

      {showForm ? (
        <div className="surface-card mb-6 p-5">
          <ContactFields form={form} onChange={setForm} users={users} />
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-primary" onClick={() => void create()}>
              Save
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="surface-card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-sand/50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">
                  Organisation
                </th>
                <th className="hidden px-4 py-3 font-semibold lg:table-cell">
                  Type
                </th>
                <th className="hidden px-4 py-3 font-semibold lg:table-cell">
                  Tags
                </th>
                <th className="px-4 py-3 font-semibold">Email</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-sand ${
                    selected?.id === c.id ? "bg-accent-soft/50" : ""
                  }`}
                  onClick={() => setSelected(c)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted md:hidden">{c.organisation}</p>
                    {c.user_id ? (
                      <p className="mt-0.5 text-[11px] text-brand">
                        Hub: {linkedLabel(c.user_id)}
                      </p>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {isCompany(c.kind)
                      ? c.services || c.organisation || "—"
                      : c.organisation || "—"}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-muted">
                      {isCompany(c.kind) ? "Company" : "Person"}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-brand"
                        >
                          {t}
                        </span>
                      ))}
                      {c.tags.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        className="text-brand hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <EmptyState
              title="No contacts match"
              description="Try clearing your search or add a new contact above."
            />
          ) : null}
        </div>

        <aside className="surface-card h-fit p-5 lg:sticky lg:top-6">
          {selected ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-xl text-brand">{selected.name}</h2>
                <button
                  type="button"
                  className="btn-ghost shrink-0 px-2 py-1 text-xs"
                  onClick={() => setSelected(null)}
                >
                  Clear
                </button>
              </div>

              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="label !mb-0.5">Type</dt>
                  <dd>{isCompany(selected.kind) ? "Company" : "Person"}</dd>
                </div>
                {isCompany(selected.kind) ? (
                  <>
                    <div>
                      <dt className="label !mb-0.5">Services</dt>
                      <dd>{selected.services || "—"}</dd>
                    </div>
                    <div>
                      <dt className="label !mb-0.5">Website</dt>
                      <dd>
                        {selected.website ? (
                          <a
                            href={selected.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand hover:underline"
                          >
                            {selected.website}
                          </a>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <dt className="label !mb-0.5">Organisation</dt>
                      <dd>{selected.organisation || "—"}</dd>
                    </div>
                    <div>
                      <dt className="label !mb-0.5">Role</dt>
                      <dd>{selected.role || "—"}</dd>
                    </div>
                  </>
                )}
                <div>
                  <dt className="label !mb-0.5">Email</dt>
                  <dd>
                    {selected.email ? (
                      <a
                        href={`mailto:${selected.email}`}
                        className="text-brand hover:underline"
                      >
                        {selected.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="label !mb-0.5">Phone</dt>
                  <dd>
                    {selected.phone ? (
                      <a
                        href={`tel:${selected.phone}`}
                        className="text-brand hover:underline"
                      >
                        {selected.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                {selected.is_press ? (
                  <>
                    <div>
                      <dt className="label !mb-0.5">Press</dt>
                      <dd>Yes</dd>
                    </div>
                    <div>
                      <dt className="label !mb-0.5">Outlet</dt>
                      <dd>{selected.outlet || "—"}</dd>
                    </div>
                    <div>
                      <dt className="label !mb-0.5">Beat</dt>
                      <dd>{selected.beat || "—"}</dd>
                    </div>
                    <div>
                      <dt className="label !mb-0.5">Country</dt>
                      <dd>{selected.country || "—"}</dd>
                    </div>
                  </>
                ) : null}
                {isCompany(selected.kind) ? null : (
                  <div>
                    <dt className="label !mb-0.5">Linked hub user</dt>
                    <dd>
                      {selected.user_id ? (
                        <span className="text-brand">
                          {linkedLabel(selected.user_id)}
                        </span>
                      ) : (
                        <span className="text-muted">Not linked</span>
                      )}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="label !mb-0.5">Tags</dt>
                  <dd>
                    {selected.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selected.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-brand"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="label !mb-0.5">Notes</dt>
                  <dd>
                    <RichTextView html={selected.notes} />
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => openEdit(selected)}
                >
                  Edit
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    className="btn-ghost text-[var(--danger)]"
                    onClick={() => void remove(selected.id)}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Select a contact to view details
              {canDelete ? ", edit, or delete." : "."}
            </p>
          )}
        </aside>
      </div>

      {edit && editingId ? (
        <RecordDrawer
          open
          onClose={closeEdit}
          title={isCompany(edit.kind) ? "Edit company" : "Edit contact"}
          ariaLabel="Edit contact"
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => void saveEdit()}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button type="button" className="btn-secondary" onClick={closeEdit}>
                Cancel
              </button>
            </div>
          }
        >
          <ContactFields form={edit} onChange={setEdit} users={users} />
        </RecordDrawer>
      ) : null}
    </div>
  );
}

function ContactFields({
  form,
  onChange,
  users,
}: {
  form: ContactForm;
  onChange: (next: ContactForm) => void;
  users: HubUser[];
}) {
  const company = isCompany(form.kind);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="label">Type</label>
        <SearchSelect
          className="field"
          value={form.kind}
          onChange={(kind) =>
            onChange({
              ...form,
              kind: kind === "company" ? "company" : "person",
              user_id: kind === "company" ? "" : form.user_id,
              tags:
                kind === "company" && !form.tags.trim()
                  ? "vendor"
                  : form.tags,
            })
          }
          options={[
            { value: "person", label: "Person" },
            { value: "company", label: "Company" },
          ]}
        />
      </div>
      <div>
        <label className="label">{company ? "Company name" : "Name"}</label>
        <input
          className="field"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
        />
      </div>
      {company ? (
        <>
          <div>
            <label className="label">Website</label>
            <input
              className="field"
              value={form.website}
              onChange={(e) => onChange({ ...form, website: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div>
            <label className="label">Services</label>
            <input
              className="field"
              value={form.services}
              onChange={(e) => onChange({ ...form, services: e.target.value })}
              placeholder="Clothing, print…"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="label">Organisation</label>
            <input
              className="field"
              value={form.organisation}
              onChange={(e) =>
                onChange({ ...form, organisation: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Role</label>
            <input
              className="field"
              value={form.role}
              onChange={(e) => onChange({ ...form, role: e.target.value })}
            />
          </div>
        </>
      )}
      <div>
        <label className="label">Email</label>
        <input
          className="field"
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Phone</label>
        <input
          className="field"
          value={form.phone}
          onChange={(e) => onChange({ ...form, phone: e.target.value })}
        />
      </div>
      <div className="md:col-span-2 flex items-center gap-2 pt-1">
        <input
          id="contact-is-press"
          type="checkbox"
          checked={form.is_press}
          onChange={(e) => onChange({ ...form, is_press: e.target.checked })}
        />
        <label htmlFor="contact-is-press" className="text-sm text-brand">
          Press / media contact
        </label>
      </div>
      {form.is_press ? (
        <>
          <div>
            <label className="label">Outlet</label>
            <input
              className="field"
              value={form.outlet}
              onChange={(e) => onChange({ ...form, outlet: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Beat</label>
            <input
              className="field"
              value={form.beat}
              onChange={(e) => onChange({ ...form, beat: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Country</label>
            <input
              className="field"
              value={form.country}
              onChange={(e) => onChange({ ...form, country: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Preferred topics</label>
            <input
              className="field"
              value={form.preferred_topics}
              onChange={(e) =>
                onChange({ ...form, preferred_topics: e.target.value })
              }
            />
          </div>
        </>
      ) : null}
      <div className={company ? "md:col-span-2" : undefined}>
        <label className="label">
          {company ? "Tags (e.g. vendor, printer, merch)" : "Tags (comma-separated)"}
        </label>
        <input
          className="field"
          value={form.tags}
          onChange={(e) => onChange({ ...form, tags: e.target.value })}
        />
      </div>
      {company ? null : (
        <div className="md:col-span-2">
          <label className="label">Linked hub user</label>
          <SearchSelect
            className="field"
            value={form.user_id}
            allowEmpty
            emptyLabel="None"
            placeholder="None"
            onChange={(user_id) => onChange({ ...form, user_id })}
            options={users.map((u) => ({
              value: u.id,
              label: `${u.full_name || u.email} (${u.role})`,
            }))}
          />
          <p className="mt-1 text-xs text-muted">
            Linked members can edit this contact under My details.
          </p>
        </div>
      )}
      <div className="md:col-span-2">
        <label className="label">Notes</label>
        <RichTextEditor
          value={form.notes}
          onChange={(notes) => onChange({ ...form, notes })}
          placeholder="Notes…"
          minHeight="70px"
        />
      </div>
    </div>
  );
}
