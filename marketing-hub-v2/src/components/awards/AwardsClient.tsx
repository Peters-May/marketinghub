"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import type { AwardEntry, AwardStatus } from "@/lib/types";
import { FormAlert } from "@/components/ui/FormAlert";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { apiErrorMessage } from "@/lib/ui/form-feedback";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { ContactOwnerSelect } from "@/components/ui/ContactOwnerSelect";
import { useHubView } from "@/lib/hub-view";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { plainTextFromHtml } from "@/lib/plain-text";
import { RelatedTasksPanel } from "@/components/tasks/RelatedTasksPanel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { removeById, rowFromResponse, upsertById } from "@/lib/data/list-patch";
import { StatusPill } from "@/components/ui/StatusPill";
import { statusEventColor } from "@/lib/ui/statusTokens";

const STATUSES: { id: AwardStatus; label: string }[] = [
  { id: "watching", label: "Watching" },
  { id: "entering", label: "Entering" },
  { id: "submitted", label: "Submitted" },
  { id: "shortlisted", label: "Shortlisted" },
  { id: "won", label: "Won" },
  { id: "not_won", label: "Not won" },
];

const VIEWS = [
  { id: "list", label: "List" },
  { id: "timeline", label: "Timeline" },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

const emptyForm = {
  title: "",
  organisation: "",
  category: "",
  year: String(new Date().getFullYear()),
  status: "watching" as AwardStatus,
  submission_deadline: "",
  deadline_verified: false,
  ceremony_at: "",
  owner: "",
  notes: "",
};

type EditForm = typeof emptyForm;

function toEditForm(item: AwardEntry): EditForm {
  return {
    title: item.title,
    organisation: item.organisation,
    category: item.category,
    year: String(item.year),
    status: item.status,
    submission_deadline: item.submission_deadline ?? "",
    deadline_verified: item.deadline_verified === true,
    ceremony_at: item.ceremony_at ?? "",
    owner: item.owner,
    notes: item.notes,
  };
}

export function AwardsClient({
  initialOpenId = null,
  initial,
}: {
  initialOpenId?: string | null;
  initial: AwardEntry[];
}) {
  const { view: hubView } = useHubView();
  const isAdmin = hubView === "admin";

  const [items, setItems] = useState(initial);
  const [view, setView] = useState<ViewId>("list");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<AwardEntry | null>(
    () => initial.find((item) => item.id === initialOpenId) ?? null
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");

  useEffect(() => {
    if (!selected) return;
    const next = items.find((i) => i.id === selected.id) ?? null;
    setSelected(next);
    // Only re-sync when the list or selected id changes, not on every selected object update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected intentionally omitted
  }, [items, selected?.id]);

  const years = useMemo(() => {
    const set = new Set(items.map((i) => String(i.year)));
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (
        !matchesSearch(search, [
          item.title,
          item.organisation,
          item.category,
          item.owner,
          plainTextFromHtml(item.notes),
        ])
      ) {
        return false;
      }
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (yearFilter !== "all" && String(item.year) !== yearFilter) return false;
      return true;
    });
  }, [items, search, statusFilter, yearFilter]);

  /** Awards with a usable year, grouped ascending for the yearly timeline. */
  const timelineByYear = useMemo(() => {
    const withYear = filtered.filter(
      (item) => Number.isFinite(item.year) && item.year > 0
    );
    const yearKeys = Array.from(
      new Set(withYear.map((item) => item.year))
    ).sort((a, b) => a - b);

    return yearKeys.map((year) => ({
      year,
      awards: withYear
        .filter((item) => item.year === year)
        .sort((a, b) => {
          const aDate = a.submission_deadline || a.ceremony_at || "";
          const bDate = b.submission_deadline || b.ceremony_at || "";
          if (aDate && bDate) return aDate.localeCompare(bDate);
          if (aDate) return -1;
          if (bDate) return 1;
          return a.title.localeCompare(b.title);
        }),
    }));
  }, [filtered]);

  const undatedYearCount = useMemo(
    () =>
      filtered.filter((item) => !Number.isFinite(item.year) || item.year <= 0)
        .length,
    [filtered]
  );

  const currentYear = new Date().getFullYear();

  async function create() {
    if (!isAdmin || creating) return;
    setCreating(true);
    setFormError(null);
    try {
      const res = await fetch("/api/awards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          year: Number(form.year) || new Date().getFullYear(),
          submission_deadline: form.submission_deadline || null,
          deadline_verified: form.deadline_verified === true,
          ceremony_at: form.ceremony_at || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const item = rowFromResponse<AwardEntry>(data);
      if (!res.ok || !item) {
        setFormError(apiErrorMessage(data, "Could not save award"));
        return;
      }
      setItems((prev) => upsertById(prev, item));
      setShowForm(false);
      setForm(emptyForm);
    } catch {
      setFormError("Could not save award");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(item: AwardEntry) {
    if (!isAdmin) return;
    setEditingId(item.id);
    setEdit(toEditForm(item));
  }

  function closeEdit() {
    setEditingId(null);
    setEdit(null);
  }

  async function addSubmission(parent: AwardEntry) {
    if (!isAdmin) return;
    const res = await fetch("/api/awards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${parent.title} — extra submission`,
        organisation: parent.organisation,
        category: parent.category,
        year: parent.year,
        status: "entering",
        submission_deadline: null,
        deadline_verified: false,
        ceremony_at: parent.ceremony_at,
        owner: parent.owner,
        event_id: parent.event_id,
        parent_id: parent.id,
        notes: "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    const item = rowFromResponse<AwardEntry>(data);
    if (!res.ok || !item) {
      setFormError(apiErrorMessage(data, "Could not save award"));
      return;
    }
    setItems((prev) => upsertById(prev, item));
    setSelected(item);
  }

  async function saveEdit() {
    if (!isAdmin || !editingId || !edit) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/awards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingId,
          patch: {
            title: edit.title.trim() || "Untitled award",
            organisation: edit.organisation,
            category: edit.category,
            year: Number(edit.year) || new Date().getFullYear(),
            status: edit.status,
            submission_deadline: edit.submission_deadline || null,
            deadline_verified: edit.deadline_verified === true,
            ceremony_at: edit.ceremony_at || null,
            owner: edit.owner,
            notes: edit.notes,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      const item = rowFromResponse<AwardEntry>(data);
      if (!res.ok || !item) {
        setFormError(apiErrorMessage(data, "Could not save award"));
        return;
      }
      setItems((prev) => upsertById(prev, item));
      closeEdit();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!isAdmin) return;
    if (!window.confirm("Remove this award entry?")) return;
    const res = await fetch("/api/awards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(apiErrorMessage(data, "Could not delete award"));
      return;
    }
    setItems((prev) => removeById(prev, id));
    if (editingId === id) closeEdit();
    if (selected?.id === id) setSelected(null);
  }

  function statusLabel(status: AwardStatus) {
    return STATUSES.find((s) => s.id === status)?.label ?? status;
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return "—";
    try {
      return format(parseISO(value), "d MMM yyyy");
    } catch {
      return value;
    }
  }

  return (
    <div>
      <PageHeader
        title="Awards"
        description="Track industry awards we’re watching, entering, or have won — sits alongside Sponsorships."
        actions={
          isAdmin ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowForm(true)}
            >
              Add award
            </button>
          ) : null
        }
      />

      <div
        className="mb-5 inline-flex flex-wrap gap-1 rounded-2xl border border-border bg-white p-1"
        role="tablist"
        aria-label="Awards views"
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-medium transition",
              view === v.id
                ? "bg-brand text-white shadow-sm"
                : "text-muted hover:bg-sand hover:text-foreground"
            )}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search awards, organisers, categories…"
        resultCount={filtered.length}
        totalCount={items.length}
        selects={[
          {
            id: "status",
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "all", label: "All statuses" },
              ...STATUSES.map((s) => ({ value: s.id, label: s.label })),
            ],
          },
          {
            id: "year",
            label: "Year",
            value: yearFilter,
            onChange: setYearFilter,
            options: [
              { value: "all", label: "All years" },
              ...years.map((y) => ({ value: y, label: y })),
            ],
          },
        ]}
      />

      {isAdmin && showForm ? (
        <div className="surface-card mb-6 grid gap-3 p-5 md:grid-cols-2">
          <AwardFields form={form} onChange={setForm} />
          <div className="md:col-span-2">
            <FormAlert message={formError} />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={creating}
              onClick={() => void create()}
            >
              {creating ? "Saving…" : "Save"}
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

      {view === "list" ? (
        <ul className="space-y-3">
          {filtered.map((item) => (
            <li
              key={item.id}
              className={cn(
                "surface-card cursor-pointer p-4 transition hover:border-brand/30 hover:shadow-md",
                selected?.id === item.id && "ring-2 ring-brand/30"
              )}
              onClick={() => setSelected(item)}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-brand">{item.title}</h2>
                    <StatusPill
                      status={item.status}
                      label={statusLabel(item.status)}
                    />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {[item.organisation, item.category, String(item.year)]
                      .filter(Boolean)
                      .join(" · ")}
                    {item.submission_deadline
                      ? ` · submit by ${format(parseISO(item.submission_deadline), "d MMM yyyy")}${item.deadline_verified === true ? "" : " (date not verified)"}`
                      : item.status === "watching"
                        ? " · needs research"
                        : ""}
                    {item.ceremony_at
                      ? ` · ceremony ${format(parseISO(item.ceremony_at), "d MMM yyyy")}`
                      : ""}
                    {item.owner ? ` · ${item.owner}` : ""}
                  </p>
                  {plainTextFromHtml(item.notes) ? (
                    <RichTextView
                      html={item.notes}
                      plain
                      clampLines={2}
                      className="mt-2 text-sm text-foreground/80"
                    />
                  ) : null}
                  {item.event_id ? (
                    <a
                      href="/app/events"
                      className="mt-2 inline-block text-xs font-medium text-brand underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Linked from Events
                    </a>
                  ) : null}
                </div>
                {isAdmin ? (
                  <div
                    className="flex gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => openEdit(item)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-[var(--danger)]"
                      onClick={() => void remove(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="list-none">
              <EmptyState
                title="No awards match"
                description={
                  isAdmin
                    ? "Try clearing filters, add one, or sync Events that include award ceremonies."
                    : "Try clearing filters to see more awards."
                }
              />
            </li>
          ) : null}
        </ul>
      ) : null}

      {view === "timeline" ? (
        <div className="surface-card overflow-hidden p-4">
          {timelineByYear.length === 0 ? (
            <p className="text-sm text-muted">
              No awards with a year in this filter. Add a year on each award to
              see them on the timeline.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  Yearly timeline — click an award to open.
                </p>
                <p className="text-xs text-muted">
                  {timelineByYear[0].year}
                  {timelineByYear.length > 1
                    ? ` – ${timelineByYear[timelineByYear.length - 1].year}`
                    : ""}
                </p>
              </div>
              <div className="-mx-1 overflow-x-auto pb-1">
                <div className="flex w-max min-w-full gap-3 px-1">
                  {timelineByYear.map(({ year, awards }) => {
                    const isCurrent = year === currentYear;
                    return (
                      <section
                        key={year}
                        className={cn(
                          "flex w-56 shrink-0 flex-col rounded-xl border border-border bg-sand/40",
                          isCurrent && "border-brand/40 ring-1 ring-brand/20"
                        )}
                      >
                        <header
                          className={cn(
                            "sticky top-0 z-[1] rounded-t-xl border-b border-border px-3 py-2.5",
                            isCurrent
                              ? "bg-brand/10 text-brand"
                              : "bg-white/80 text-foreground"
                          )}
                        >
                          <h3 className="text-sm font-semibold tabular-nums">
                            {year}
                          </h3>
                          <p className="text-[11px] text-muted">
                            {awards.length} award
                            {awards.length === 1 ? "" : "s"}
                          </p>
                        </header>
                        <ul className="flex flex-1 flex-col gap-2 p-2">
                          {awards.map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => setSelected(item)}
                                className={cn(
                                  "w-full rounded-lg border border-border bg-white p-2.5 text-left shadow-sm transition hover:border-brand/40 hover:shadow-md",
                                  selected?.id === item.id &&
                                    "ring-2 ring-brand/30"
                                )}
                              >
                                <div className="flex items-start gap-2">
                                  <span
                                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{
                                      background: statusEventColor(item.status),
                                    }}
                                    aria-hidden
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-brand">
                                      {item.title}
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-muted">
                                      {[
                                        statusLabel(item.status),
                                        item.organisation,
                                        item.category,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </p>
                                    {item.submission_deadline ? (
                                      <p className="mt-1 text-[11px] text-muted">
                                        Submit by{" "}
                                        {format(
                                          parseISO(item.submission_deadline),
                                          "d MMM"
                                        )}
                                        {item.deadline_verified === true
                                          ? ""
                                          : " · date not verified"}
                                      </p>
                                    ) : item.status === "watching" ? (
                                      <p className="mt-1 text-[11px] text-muted">
                                        Needs research
                                      </p>
                                    ) : item.ceremony_at ? (
                                      <p className="mt-1 text-[11px] text-muted">
                                        Ceremony{" "}
                                        {format(
                                          parseISO(item.ceremony_at),
                                          "d MMM"
                                        )}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          {undatedYearCount > 0 ? (
            <p className="mt-4 text-xs text-muted">
              {undatedYearCount} award(s) have no year and are hidden here —
              switch to List to edit them.
            </p>
          ) : null}
        </div>
      ) : null}

      {selected && !edit ? (
        <RecordDrawer
          open
          onClose={() => setSelected(null)}
          title="Award details"
          ariaLabel={`${selected.title} details`}
          footer={
            <div className="flex flex-wrap gap-2">
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => openEdit(selected)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void addSubmission(selected)}
                  >
                    Add another submission
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-[var(--danger)]"
                    onClick={() => void remove(selected.id)}
                  >
                    Delete
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-2xl text-brand">
                {selected.title}
              </h3>
              <div className="mt-2">
                <StatusPill
                  status={selected.status}
                  label={statusLabel(selected.status)}
                />
              </div>
            </div>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="label !mb-0.5">Organisation</dt>
                <dd>{selected.organisation || "—"}</dd>
              </div>
              <div>
                <dt className="label !mb-0.5">Category</dt>
                <dd>{selected.category || "—"}</dd>
              </div>
              <div>
                <dt className="label !mb-0.5">Year</dt>
                <dd>{selected.year || "—"}</dd>
              </div>
              <div>
                <dt className="label !mb-0.5">Submission deadline</dt>
                <dd>
                  {formatDate(selected.submission_deadline)}
                  {selected.submission_deadline &&
                  selected.deadline_verified !== true
                    ? " · date not verified"
                    : ""}
                  {!selected.submission_deadline &&
                  selected.status === "watching"
                    ? "Needs research. No date has been added."
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="label !mb-0.5">Ceremony date</dt>
                <dd>{formatDate(selected.ceremony_at)}</dd>
              </div>
              <div>
                <dt className="label !mb-0.5">Owner</dt>
                <dd>{selected.owner || "—"}</dd>
              </div>
              <div>
                <dt className="label !mb-0.5">Notes</dt>
                <dd>
                  <RichTextView html={selected.notes} />
                </dd>
              </div>
              {selected.event_id ? (
                <div>
                  <dt className="label !mb-0.5">Linked event</dt>
                  <dd>
                    <a
                      href="/app/events"
                      className="text-brand underline-offset-2 hover:underline"
                    >
                      Open in Events
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
            {items.some((item) => item.parent_id === selected.id) ? (
              <div>
                <p className="label">Extra submissions</p>
                <ul className="space-y-1 text-sm">
                  {items
                    .filter((item) => item.parent_id === selected.id)
                    .map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="text-brand underline-offset-2 hover:underline"
                          onClick={() => setSelected(item)}
                        >
                          {item.title}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
            <RelatedTasksPanel
              className="mt-4"
              relatedType="award"
              relatedId={selected.id}
            />
          </div>
        </RecordDrawer>
      ) : null}

      {isAdmin && edit && editingId ? (
        <RecordDrawer
          open
          onClose={closeEdit}
          title="Edit award"
          ariaLabel="Edit award"
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
          <FormAlert message={formError} />
          <AwardFields form={edit} onChange={setEdit} />
          <RelatedTasksPanel
            className="mt-4"
            relatedType="award"
            relatedId={editingId}
          />
        </RecordDrawer>
      ) : null}
    </div>
  );
}

function AwardFields({
  form,
  onChange,
}: {
  form: EditForm;
  onChange: (next: EditForm) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="label">Award name</label>
        <input
          className="field"
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Organisation</label>
        <input
          className="field"
          value={form.organisation}
          onChange={(e) => onChange({ ...form, organisation: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Category</label>
        <input
          className="field"
          value={form.category}
          onChange={(e) => onChange({ ...form, category: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Year</label>
        <input
          className="field"
          type="number"
          value={form.year}
          onChange={(e) => onChange({ ...form, year: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Status</label>
        <SearchSelect
          className="field"
          value={form.status}
          onChange={(status) =>
            onChange({ ...form, status: status as AwardStatus })
          }
          options={STATUSES.map((s) => ({ value: s.id, label: s.label }))}
        />
      </div>
      <div>
        <label className="label">Submission deadline</label>
        <input
          className="field"
          type="date"
          value={form.submission_deadline}
          onChange={(e) =>
            onChange({ ...form, submission_deadline: e.target.value })
          }
        />
        <label className="mt-2 flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={form.deadline_verified}
            onChange={(e) =>
              onChange({ ...form, deadline_verified: e.target.checked })
            }
          />
          Deadline checked
        </label>
      </div>
      <div>
        <label className="label">Ceremony date</label>
        <input
          className="field"
          type="date"
          value={form.ceremony_at}
          onChange={(e) => onChange({ ...form, ceremony_at: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Owner</label>
        <ContactOwnerSelect
          value={form.owner}
          onChange={(owner) => onChange({ ...form, owner })}
        />
      </div>
      <div className="md:col-span-2">
        <label className="label">Notes</label>
        <RichTextEditor
          value={form.notes}
          onChange={(notes) => onChange({ ...form, notes })}
          placeholder="Notes…"
          minHeight="80px"
        />
      </div>
    </div>
  );
}
