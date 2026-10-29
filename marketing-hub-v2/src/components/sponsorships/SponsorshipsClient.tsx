"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  MembershipType,
  PartnerKind,
  Sponsorship,
  SponsorshipStatus,
} from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { FormAlert } from "@/components/ui/FormAlert";
import { apiErrorMessage } from "@/lib/ui/form-feedback";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { ContactOwnerSelect } from "@/components/ui/ContactOwnerSelect";
import { useHubView } from "@/lib/hub-view";
import { format, parseISO, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { plainTextFromHtml } from "@/lib/plain-text";
import { RelatedTasksPanel } from "@/components/tasks/RelatedTasksPanel";
import { TimelineChart } from "@/components/ui/TimelineChart";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { StatusPill } from "@/components/ui/StatusPill";
import { statusEventColor } from "@/lib/ui/statusTokens";
import { removeById, rowFromResponse, upsertById } from "@/lib/data/list-patch";

const STATUSES: { id: SponsorshipStatus; label: string }[] = [
  { id: "prospect", label: "Prospect" },
  { id: "negotiating", label: "Negotiating" },
  { id: "confirmed", label: "Confirmed" },
  { id: "active", label: "Active" },
  { id: "complete", label: "Complete" },
  { id: "declined", label: "Declined" },
];

const STATUS_COLOR: Record<SponsorshipStatus, string> = {
  prospect: statusEventColor("watching"),
  negotiating: statusEventColor("todo"),
  confirmed: statusEventColor("scheduled"),
  active: statusEventColor("published"),
  complete: statusEventColor("done"),
  declined: statusEventColor("lost"),
};

const MEMBERSHIP_TYPES: { id: MembershipType; label: string }[] = [
  { id: "membership", label: "Membership" },
  { id: "directory_listing", label: "Directory listing" },
];

const VIEWS = [
  { id: "list", label: "List" },
  { id: "kanban", label: "Kanban" },
  { id: "timeline", label: "Timeline" },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

const emptyForm = {
  membership_type: "membership" as MembershipType,
  partner: "",
  package_name: "",
  starts_at: "",
  ends_at: "",
  value: "",
  status: "prospect" as SponsorshipStatus,
  deliverables: "",
  owner: "",
  onedrive_url: "",
  notes: "",
};

type EditForm = typeof emptyForm;

function toEditForm(item: Sponsorship): EditForm {
  return {
    membership_type: item.membership_type,
    partner: item.partner,
    package_name: item.package_name,
    starts_at: item.starts_at ?? "",
    ends_at: item.ends_at ?? "",
    value: item.value,
    status: item.status,
    deliverables: item.deliverables,
    owner: item.owner,
    onedrive_url: item.onedrive_url,
    notes: item.notes,
  };
}

function statusLabel(status: SponsorshipStatus) {
  return STATUSES.find((s) => s.id === status)?.label ?? status;
}

function partnerKind(item: Sponsorship): PartnerKind {
  return item.kind === "membership" ? "membership" : "sponsorship";
}

function membershipTypeLabel(type: MembershipType) {
  return MEMBERSHIP_TYPES.find((option) => option.id === type)?.label ?? type;
}

export function SponsorshipsClient({
  initial,
  kind = "all",
  hideHeader = false,
  currentUserId = null,
}: {
  initial: Sponsorship[];
  /** Filter to one partner type, or show all */
  kind?: PartnerKind | "all";
  hideHeader?: boolean;
  /** Signed-in user — members may only edit memberships they added. */
  currentUserId?: string | null;
}) {
  const { view: hubView } = useHubView();
  const isAdminView = hubView === "admin";

  const [items, setItems] = useState(initial);
  const [view, setView] = useState<ViewId>("list");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<Sponsorship | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [membershipTypeFilter, setMembershipTypeFilter] = useState("all");

  const createKind: PartnerKind =
    kind === "membership" ? "membership" : "sponsorship";
  const isMembership = kind === "membership";
  const showKindPicker = kind === "all" && isAdminView;
  const [formKind, setFormKind] = useState<PartnerKind>("membership");
  const activeCreateKind: PartnerKind = !isAdminView
    ? "membership"
    : showKindPicker
      ? formKind
      : createKind;
  /** Members can add memberships; sponsorships are admin-only. */
  const canCreate =
    isAdminView || kind === "membership" || kind === "all";
  const canManageItem = (item: Sponsorship) => {
    if (isAdminView) return true;
    if (partnerKind(item) !== "membership") return false;
    if (!currentUserId) return false;
    if (item.created_by_user_id) {
      return item.created_by_user_id === currentUserId;
    }
    return false;
  };
  const noun =
    !isAdminView || kind === "membership"
      ? "membership"
      : kind === "all"
        ? "partner"
        : "sponsorship";
  const nounTitle =
    kind === "all"
      ? "All partners"
      : isMembership
        ? "Memberships"
        : "Sponsorships";
  const packageLabel =
    activeCreateKind === "membership" ? "Tier / package" : "Package";
  const nameLabel =
    activeCreateKind === "membership" ? "Organisation" : "Partner";

  useEffect(() => {
    if (!isAdminView) setFormKind("membership");
  }, [isAdminView]);

  useEffect(() => {
    if (!selected) return;
    const next = items.find((i) => i.id === selected.id) ?? null;
    setSelected(next);
    // Only re-sync when the list or selected id changes, not on every selected object update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected intentionally omitted
  }, [items, selected?.id]);

  const scoped = useMemo(() => {
    if (kind === "all") return items;
    return items.filter((i) => partnerKind(i) === kind);
  }, [items, kind]);

  const filtered = useMemo(() => {
    return scoped.filter((item) => {
      if (
        !matchesSearch(search, [
          item.partner,
          item.package_name,
          ...(isAdminView ? [item.value] : []),
          item.owner,
          plainTextFromHtml(item.deliverables),
          plainTextFromHtml(item.notes),
          item.status,
          partnerKind(item),
          item.membership_type,
        ])
      ) {
        return false;
      }
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (
        kind === "membership" &&
        membershipTypeFilter !== "all" &&
        item.membership_type !== membershipTypeFilter
      ) {
        return false;
      }
      return true;
    });
  }, [
    scoped,
    search,
    statusFilter,
    membershipTypeFilter,
    isAdminView,
    kind,
  ]);

  const dated = useMemo(
    () =>
      filtered
        .filter((i) => i.starts_at)
        .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))),
    [filtered]
  );

  const timelineItems = useMemo(() => {
    return dated.map((item) => {
      const start = parseISO(item.starts_at!);
      const end = item.ends_at
        ? parseISO(item.ends_at)
        : addDays(start, 30);
      return {
        id: item.id,
        label: item.partner,
        subtitle: [
          statusLabel(item.status),
          item.package_name,
          ...(isAdminView ? [item.value] : []),
        ]
          .filter(Boolean)
          .join(" · "),
        start,
        end: end.getTime() >= start.getTime() ? end : start,
        color: STATUS_COLOR[item.status],
      };
    });
  }, [dated, isAdminView]);

  const undatedCount = useMemo(
    () => filtered.filter((i) => !i.starts_at).length,
    [filtered]
  );

  async function create() {
    if (!canCreate) return;
    const { value, ...rest } = form;
    const res = await fetch("/api/sponsorships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...rest,
        ...(isAdminView ? { value } : {}),
        kind: activeCreateKind,
        membership_type:
          activeCreateKind === "membership"
            ? form.membership_type
            : "membership",
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    const item = rowFromResponse<Sponsorship>(data);
    if (!res.ok || !item) {
      setFormError(apiErrorMessage(data, "Could not save partner"));
      return;
    }
    setItems((prev) => upsertById(prev, item));
    setShowForm(false);
    setForm(emptyForm);
  }

  function openEdit(item: Sponsorship) {
    if (!canManageItem(item)) return;
    setEditingId(item.id);
    setEdit(toEditForm(item));
  }

  function closeEdit() {
    setEditingId(null);
    setEdit(null);
  }

  async function saveEdit() {
    if (!editingId || !edit) return;
    const current = items.find((i) => i.id === editingId);
    if (!current || !canManageItem(current)) return;
    setSaving(true);
    try {
      const { value, ...rest } = edit;
      const res = await fetch("/api/sponsorships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingId,
          patch: {
            ...rest,
            ...(isAdminView ? { value } : {}),
            partner: edit.partner.trim() || "Untitled partner",
            starts_at: edit.starts_at || null,
            ends_at: edit.ends_at || null,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      const item = rowFromResponse<Sponsorship>(data);
      if (!res.ok || !item) {
      setFormError(apiErrorMessage(data, "Could not save partner"));
      return;
    }
      setItems((prev) => upsertById(prev, item));
      closeEdit();
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: SponsorshipStatus) {
    const item = items.find((i) => i.id === id);
    if (!item || !canManageItem(item)) return;
    const res = await fetch("/api/sponsorships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, patch: { status } }),
    });
    const data = await res.json().catch(() => ({}));
    const saved = rowFromResponse<Sponsorship>(data);
    if (!res.ok || !saved) {
      setFormError(apiErrorMessage(data, "Could not update partner"));
      return;
    }
    setItems((prev) => upsertById(prev, saved));
    if (editingId === id && edit) setEdit({ ...edit, status: saved.status });
  }

  async function remove(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item || !canManageItem(item)) return;
    if (!window.confirm(`Delete this ${noun}?`)) return;
    const res = await fetch("/api/sponsorships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(apiErrorMessage(data, "Could not delete partner"));
      return;
    }
    setItems((prev) => removeById(prev, id));
    if (editingId === id) closeEdit();
    if (selected?.id === id) setSelected(null);
  }

  const editingItem = editingId
    ? items.find((i) => i.id === editingId) ?? null
    : null;

  function formatDateLabel(value: string | null) {
    if (!value) return "—";
    try {
      return format(parseISO(value), "d MMM yyyy");
    } catch {
      return value;
    }
  }

  function CardActions({ item }: { item: Sponsorship }) {
    const manageable = canManageItem(item);
    return (
      <div
        className="mt-3 flex flex-wrap items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {manageable ? (
          <>
            <button
              type="button"
              className="btn-secondary px-2.5 py-1.5 text-xs"
              onClick={() => openEdit(item)}
            >
              Edit
            </button>
            <SearchSelect
              className="field !w-auto py-1.5 text-xs"
              value={item.status}
              onChange={(status) =>
                void setStatus(item.id, status as SponsorshipStatus)
              }
              aria-label="Change status"
              options={STATUSES.map((s) => ({ value: s.id, label: s.label }))}
            />
          </>
        ) : null}
        {item.onedrive_url ? (
          <a
            href={item.onedrive_url.startsWith("http") ? item.onedrive_url : undefined}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost px-2.5 py-1.5 text-xs"
            onClick={(e) => {
              if (!item.onedrive_url.startsWith("http")) e.preventDefault();
            }}
          >
            {item.membership_type === "directory_listing"
              ? "View profile"
              : "Docs"}
          </a>
        ) : null}
      </div>
    );
  }

  const addButton =
    canCreate && (isAdminView || kind !== "sponsorship") ? (
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          if (!isAdminView) setFormKind("membership");
          setShowForm(true);
        }}
      >
        Add {isAdminView && kind === "all" ? "partner" : noun}
      </button>
    ) : null;

  return (
    <div>
      <FormAlert message={formError} />
      {hideHeader ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl text-brand">{nounTitle}</h2>
          {addButton}
        </div>
      ) : (
        <PageHeader
          title={nounTitle}
          description={
            isMembership
              ? "Industry memberships and directory listings — renewals, fees, benefits, and profile links."
              : "Sponsorship partners, packages, deliverables, and docs."
          }
          actions={addButton}
        />
      )}

      <div
        className="mb-5 inline-flex flex-wrap gap-1 rounded-2xl border border-border bg-white p-1"
        role="tablist"
        aria-label={`${nounTitle} views`}
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
        searchPlaceholder={`Search ${nameLabel.toLowerCase()}, ${packageLabel.toLowerCase()}, notes…`}
        resultCount={filtered.length}
        totalCount={scoped.length}
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
          ...(kind === "membership"
            ? [
                {
                  id: "membership-type",
                  label: "Membership type",
                  value: membershipTypeFilter,
                  onChange: setMembershipTypeFilter,
                  options: [
                    { value: "all", label: "All types" },
                    ...MEMBERSHIP_TYPES.map((type) => ({
                      value: type.id,
                      label: type.label,
                    })),
                  ],
                },
              ]
            : []),
        ]}
      />

      {showForm && canCreate ? (
        <div className="surface-card mb-6 grid gap-3 p-5 md:grid-cols-2">
          {showKindPicker ? (
            <div className="md:col-span-2">
              <label className="label">Type</label>
              <SearchSelect
                className="field"
                value={formKind}
                onChange={(value) => setFormKind(value as PartnerKind)}
                options={[
                  { value: "sponsorship", label: "Sponsorship" },
                  { value: "membership", label: "Membership" },
                ]}
              />
            </div>
          ) : !isAdminView ? (
            <div className="md:col-span-2 rounded-xl border border-border bg-sand/40 px-3 py-2 text-xs text-muted">
              Adding a <span className="font-medium text-foreground">membership</span>
              . Sponsorships are managed in Admin view.
            </div>
          ) : null}
          {activeCreateKind === "membership" ? (
            <div>
              <label className="label">Membership type</label>
              <SearchSelect
                className="field"
                value={form.membership_type}
                onChange={(membership_type) =>
                  setForm({
                    ...form,
                    membership_type: membership_type as MembershipType,
                  })
                }
                options={MEMBERSHIP_TYPES.map((type) => ({
                  value: type.id,
                  label: type.label,
                }))}
              />
            </div>
          ) : null}
          {(
            [
              ["partner", nameLabel],
              ["package_name", packageLabel],
              ...(isAdminView
                ? ([
                    [
                      "value",
                      activeCreateKind === "membership"
                        ? "Fee / value"
                        : "Value",
                    ],
                  ] as const)
                : []),
              [
                "onedrive_url",
                activeCreateKind === "membership" &&
                form.membership_type === "directory_listing"
                  ? "Directory profile URL"
                  : "Docs / OneDrive URL",
              ],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                className="field"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <label className="label">Owner</label>
            <ContactOwnerSelect
              value={form.owner}
              onChange={(owner) => setForm({ ...form, owner })}
            />
          </div>
          <div>
            <label className="label">Starts</label>
            <input
              className="field"
              type="date"
              value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Ends</label>
            <input
              className="field"
              type="date"
              value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Status</label>
            <SearchSelect
              className="field"
              value={form.status}
              onChange={(status) =>
                setForm({
                  ...form,
                  status: status as SponsorshipStatus,
                })
              }
              options={STATUSES.map((s) => ({ value: s.id, label: s.label }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Deliverables</label>
            <RichTextEditor
              value={form.deliverables}
              onChange={(deliverables) => setForm({ ...form, deliverables })}
              placeholder="Deliverables…"
              minHeight="70px"
            />
          </div>
          {isAdminView && (
            <div className="md:col-span-2">
              <label className="label">Notes</label>
              <RichTextEditor
                value={form.notes}
                onChange={(notes) => setForm({ ...form, notes })}
                placeholder="Notes…"
                minHeight="70px"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={() => void create()}>
              Save
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div>
          {view === "list" ? (
            <div className="space-y-3">
              {filtered.map((item) => (
                <article
                  key={item.id}
                  className={cn(
                    "surface-card cursor-pointer p-5 transition hover:border-brand/30 hover:shadow-md",
                    selected?.id === item.id && "ring-2 ring-brand/30"
                  )}
                  onClick={() => setSelected(item)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl text-brand">
                        {item.partner}
                      </h2>
                      <p className="text-sm text-muted">
                        {item.package_name || "No package"}
                        {isAdminView ? ` · ${item.value || "—"}` : ""} ·{" "}
                        {statusLabel(item.status)}
                        {partnerKind(item) === "membership"
                          ? ` · ${membershipTypeLabel(item.membership_type)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  {plainTextFromHtml(item.deliverables) ? (
                    <div className="mt-3 text-sm">
                      <RichTextView html={item.deliverables} />
                    </div>
                  ) : null}
                  {isAdminView && plainTextFromHtml(item.notes) ? (
                    <RichTextView
                      html={item.notes}
                      plain
                      clampLines={3}
                      className="mt-2 text-xs text-muted"
                    />
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                    {item.starts_at ? <span>From {item.starts_at}</span> : null}
                    {item.ends_at ? <span>To {item.ends_at}</span> : null}
                    {item.owner ? <span>Owner: {item.owner}</span> : null}
                  </div>
                  <CardActions item={item} />
                </article>
              ))}
              {filtered.length === 0 ? (
                <EmptyState
                  title="No partners match"
                  description="Try clearing filters or add a new partner above."
                />
              ) : null}
            </div>
          ) : null}

          {view === "kanban" ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {STATUSES.map((col) => {
                const colItems = filtered.filter((i) => i.status === col.id);
                return (
                  <div
                    key={col.id}
                    className="surface-card flex w-72 shrink-0 flex-col p-3"
                  >
                    <div className="mb-3 flex items-center justify-between px-1">
                      <h2 className="text-sm font-semibold text-brand">
                        {col.label}
                      </h2>
                      <span className="text-xs text-muted">{colItems.length}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {colItems.map((item) => (
                        <article
                          key={item.id}
                          className={cn(
                            "cursor-pointer rounded-xl border border-border bg-sand/60 p-3 transition hover:border-brand/30 hover:shadow-sm",
                            selected?.id === item.id && "ring-2 ring-brand/30"
                          )}
                          onClick={() => setSelected(item)}
                        >
                          <p className="text-sm font-medium">{item.partner}</p>
                          <p className="mt-1 text-xs text-muted">
                            {item.package_name || "No package"}
                            {isAdminView && item.value
                              ? ` · ${item.value}`
                              : ""}
                            {partnerKind(item) === "membership"
                              ? ` · ${membershipTypeLabel(item.membership_type)}`
                              : ""}
                          </p>
                          <CardActions item={item} />
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {view === "timeline" ? (
            <TimelineChart
              items={timelineItems}
              onSelect={(id) => {
                const item = filtered.find((i) => i.id === id);
                if (item) setSelected(item);
              }}
              emptyMessage="Add start dates to see a timeline — or use List / Kanban."
              footer={
                undatedCount > 0 ? (
                  <p className="mt-4 text-xs text-muted">
                    {undatedCount} partner(s) have no start date and are hidden
                    here — switch to List or Kanban to edit them.
                  </p>
                ) : null
              }
            />
          ) : null}
      </div>

      {selected && !edit ? (
        <RecordDrawer
          open
          onClose={() => setSelected(null)}
          title="Partner details"
          ariaLabel={`${selected.partner} details`}
          footer={
            <div className="flex flex-wrap gap-2">
              {canManageItem(selected) ? (
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
                    {selected.partner}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusPill
                      status={selected.status}
                      label={statusLabel(selected.status)}
                    />
                    <span className="rounded-full bg-sand px-2.5 py-0.5 text-[11px] font-medium text-muted">
                      {partnerKind(selected) === "membership"
                        ? "Membership"
                        : "Sponsorship"}
                    </span>
                    {partnerKind(selected) === "membership" ? (
                      <span className="rounded-full bg-sand px-2.5 py-0.5 text-[11px] font-medium text-muted">
                        {membershipTypeLabel(selected.membership_type)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="label !mb-0.5">
                      {partnerKind(selected) === "membership"
                        ? "Tier / package"
                        : "Package"}
                    </dt>
                    <dd>{selected.package_name || "—"}</dd>
                  </div>
                  {isAdminView ? (
                    <div>
                      <dt className="label !mb-0.5">
                        {partnerKind(selected) === "membership"
                          ? "Fee / value"
                          : "Value"}
                      </dt>
                      <dd>{selected.value || "—"}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="label !mb-0.5">Starts</dt>
                    <dd>{formatDateLabel(selected.starts_at)}</dd>
                  </div>
                  <div>
                    <dt className="label !mb-0.5">Ends</dt>
                    <dd>{formatDateLabel(selected.ends_at)}</dd>
                  </div>
                  <div>
                    <dt className="label !mb-0.5">Owner</dt>
                    <dd>{selected.owner || "—"}</dd>
                  </div>
                  <div>
                    <dt className="label !mb-0.5">Deliverables</dt>
                    <dd>
                      <RichTextView html={selected.deliverables} />
                    </dd>
                  </div>
                  {isAdminView && (
                    <div>
                      <dt className="label !mb-0.5">Notes</dt>
                      <dd>
                        <RichTextView html={selected.notes} />
                      </dd>
                    </div>
                  )}
                  {selected.onedrive_url ? (
                    <div>
                      <dt className="label !mb-0.5">Docs</dt>
                      <dd>
                        {selected.onedrive_url.startsWith("http") ? (
                          <a
                            href={selected.onedrive_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand underline-offset-2 hover:underline"
                          >
                            Open docs
                          </a>
                        ) : (
                          selected.onedrive_url
                        )}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <RelatedTasksPanel
                  className="mt-4"
                  relatedType="sponsorship"
                  relatedId={selected.id}
                />
              </div>
        </RecordDrawer>
      ) : null}

      {edit && editingItem ? (
        <RecordDrawer
          open
          onClose={closeEdit}
          title={`Edit ${noun}`}
          ariaLabel={`Edit ${noun}`}
          footer={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => void saveEdit()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={closeEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-ghost text-[var(--danger)]"
                disabled={saving}
                onClick={() => void remove(editingItem.id)}
              >
                Delete
              </button>
            </div>
          }
        >
              <div className="grid gap-2">
                {editingItem?.kind === "membership" ? (
                  <div>
                    <label className="label">Membership type</label>
                    <SearchSelect
                      className="field"
                      value={edit.membership_type}
                      onChange={(membership_type) =>
                        setEdit({
                          ...edit,
                          membership_type: membership_type as MembershipType,
                        })
                      }
                      options={MEMBERSHIP_TYPES.map((type) => ({
                        value: type.id,
                        label: type.label,
                      }))}
                    />
                  </div>
                ) : null}
                {(
                  [
                    ["partner", nameLabel],
                    ["package_name", packageLabel],
                    ...(isAdminView
                      ? ([
                          [
                            "value",
                            isMembership ? "Fee / value" : "Value",
                          ],
                        ] as const)
                      : []),
                    [
                      "onedrive_url",
                      editingItem?.membership_type === "directory_listing"
                        ? "Directory profile URL"
                        : "Docs / OneDrive URL",
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="label">{label}</label>
                    <input
                      className="field"
                      value={edit[key]}
                      onChange={(e) =>
                        setEdit({ ...edit, [key]: e.target.value })
                      }
                    />
                  </div>
                ))}
                <div>
                  <label className="label">Owner</label>
                  <ContactOwnerSelect
                    value={edit.owner}
                    onChange={(owner) => setEdit({ ...edit, owner })}
                  />
                </div>
                <div>
                  <label className="label">Starts</label>
                  <input
                    className="field"
                    type="date"
                    value={edit.starts_at}
                    onChange={(e) =>
                      setEdit({ ...edit, starts_at: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">Ends</label>
                  <input
                    className="field"
                    type="date"
                    value={edit.ends_at}
                    onChange={(e) =>
                      setEdit({ ...edit, ends_at: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">Status</label>
                  <SearchSelect
                    className="field"
                    value={edit.status}
                    onChange={(status) =>
                      setEdit({
                        ...edit,
                        status: status as SponsorshipStatus,
                      })
                    }
                    options={STATUSES.map((s) => ({
                      value: s.id,
                      label: s.label,
                    }))}
                  />
                </div>
                <div>
                  <label className="label">Deliverables</label>
                  <RichTextEditor
                    value={edit.deliverables}
                    onChange={(deliverables) =>
                      setEdit({ ...edit, deliverables })
                    }
                    placeholder="Deliverables…"
                    minHeight="70px"
                  />
                </div>
                {isAdminView && (
                  <div>
                    <label className="label">Notes</label>
                    <RichTextEditor
                      value={edit.notes}
                      onChange={(notes) => setEdit({ ...edit, notes })}
                      placeholder="Notes…"
                      minHeight="90px"
                    />
                  </div>
                )}
                <RelatedTasksPanel
                  relatedType="sponsorship"
                  relatedId={editingId}
                />
              </div>
        </RecordDrawer>
      ) : null}
    </div>
  );
}
