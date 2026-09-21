"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type {
  Contact,
  EventAttendance,
  EventAttendanceStatus,
  EventItem,
} from "@/lib/types";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullCalendarStyles } from "@/components/ui/FullCalendarStyles";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { useHubView } from "@/lib/hub-view";
import { onTourPrepare } from "@/lib/tour/bus";
import {
  divisionColor,
  normalizeDivision,
} from "@/lib/events/division-colors";
import {
  EVENT_TYPE_COLORS,
  eventTypeColor,
  normalizeEventTypeLabel,
} from "@/lib/events/event-type-colors";
import {
  DIVISIONS,
  EVENT_TYPES,
  ensureFieldOption,
  optionsForField,
  orderedFilterValues,
  selectOptionsWithCurrent,
  type FieldOption,
} from "@/lib/data/collections";
import { useManagedFieldOptions } from "@/lib/data/useManagedFieldOptions";
import {
  downloadCalendarIcs,
  downloadEventIcs,
  eventsFeedWebcalUrl,
  googleCalendarAddUrl,
  outlookCalendarAddUrl,
} from "@/lib/events/event-ics";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { plainTextFromHtml } from "@/lib/plain-text";
import { RelatedTasksPanel } from "@/components/tasks/RelatedTasksPanel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { createPersonContact } from "@/lib/contacts/create-person";

const ATTENDANCE_OPTIONS: { value: EventAttendanceStatus; label: string }[] = [
  { value: "attending", label: "Attending" },
  { value: "maybe", label: "Maybe" },
  { value: "not_attending", label: "Not attending" },
  { value: "interested", label: "Interested" },
];

const emptyForm = {
  title: "",
  starts_at: "",
  ends_at: "",
  location: "",
  event_type: "Event",
  division: "",
  notes: "",
  link_url: "",
  social_media_post_completed: false,
  personal_social_media_graphics_completed: false,
  reached_out_for_pr_to_organisers: false,
};

type EventForm = typeof emptyForm;

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toEditForm(event: EventItem): EventForm {
  return {
    title: event.title,
    starts_at: toLocalInput(event.starts_at),
    ends_at: toLocalInput(event.ends_at),
    location: event.location,
    event_type: event.event_type || "Event",
    division: event.division || "",
    notes: event.notes,
    link_url: event.link_url,
    social_media_post_completed: Boolean(event.social_media_post_completed),
    personal_social_media_graphics_completed: Boolean(
      event.personal_social_media_graphics_completed
    ),
    reached_out_for_pr_to_organisers: Boolean(
      event.reached_out_for_pr_to_organisers
    ),
  };
}

function hasValidStart(event: EventItem): boolean {
  if (!event.starts_at) return false;
  const t = new Date(event.starts_at).getTime();
  return !Number.isNaN(t);
}

/** yyyy-MM-dd for date comparisons (local calendar day). */
function todayDateKey(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Default list filter: from today with no upper bound. */
function isDefaultUpcomingDateRange(from: string, to: string): boolean {
  return from === todayDateKey() && !to;
}

function matchesNonDateFilters(
  e: EventItem,
  search: string,
  typeFilter: string,
  divisionFilter: string,
  personFilter: string,
  attendingByEventId: Map<string, EventAttendance[]>
): boolean {
  if (
    !matchesSearch(search, [
      e.title,
      e.location,
      e.event_type,
      e.division,
      plainTextFromHtml(e.notes),
    ])
  ) {
    return false;
  }
  if (typeFilter !== "all" && e.event_type !== typeFilter) return false;
  if (
    divisionFilter !== "all" &&
    normalizeDivision(e.division) !== divisionFilter
  ) {
    return false;
  }
  if (personFilter !== "all") {
    const attendees = attendingByEventId.get(e.id) ?? [];
    if (!attendees.some((a) => a.user_id === personFilter)) return false;
  }
  return true;
}

/** Last day the event is still on (end date, or start if no end). */
function eventLastDateKey(event: EventItem): string | null {
  if (!hasValidStart(event)) return null;
  const iso = event.ends_at || event.starts_at!;
  return iso.slice(0, 10);
}

/** First day of the event. */
function eventFirstDateKey(event: EventItem): string | null {
  if (!hasValidStart(event)) return null;
  return event.starts_at!.slice(0, 10);
}

/**
 * Event overlaps [from, to] (inclusive). Empty bound = open-ended.
 * Undated events always pass (shown under Needs a date).
 */
function matchesDateRange(
  event: EventItem,
  from: string,
  to: string
): boolean {
  const first = eventFirstDateKey(event);
  const last = eventLastDateKey(event);
  if (!first || !last) return true;
  if (from && last < from) return false;
  if (to && first > to) return false;
  return true;
}

/** Midnight / date-only ISO — avoid showing as "1a" in BST. */
function isDateOnlyIso(iso: string): boolean {
  if (!iso.includes("T")) return true;
  return iso.slice(11, 16) === "00:00";
}

function formatEventWhen(event: EventItem): string {
  if (!hasValidStart(event)) return "Date to be added";
  const startDate = format(new Date(event.starts_at!), "EEE d MMM yyyy");
  const dateOnly = isDateOnlyIso(event.starts_at!);
  let line = dateOnly
    ? startDate
    : `${startDate} · ${format(new Date(event.starts_at!), "HH:mm")}`;
  if (event.ends_at) {
    const end = new Date(event.ends_at);
    if (!Number.isNaN(end.getTime())) {
      const endDay = format(end, "EEE d MMM yyyy");
      if (endDay !== startDate) line += ` → ${endDay}`;
    }
  }
  return line;
}

function DivisionSwatch({ division }: { division: string }) {
  const color = divisionColor(division);
  const label = normalizeDivision(division) || "Unassigned";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {label}
    </span>
  );
}

const AVATAR_PALETTE = [
  "#0f766e",
  "#1d4ed8",
  "#b45309",
  "#be185d",
  "#6d28d9",
  "#0369a1",
  "#15803d",
  "#9f1239",
];

function personInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!;
}

function AttendeeInitials({
  people,
  max = 4,
  size = "sm",
}: {
  people: { id: string; name: string }[];
  max?: number;
  size?: "sm" | "md";
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;
  const dim = size === "sm" ? "h-4 w-4 text-[8px]" : "h-6 w-6 text-[10px]";
  return (
    <span className="inline-flex items-center" title={people.map((p) => p.name).join(", ")}>
      <span className="inline-flex items-center -space-x-1">
        {shown.map((person) => (
          <span
            key={person.id}
            className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-white/80 ${dim}`}
            style={{ backgroundColor: avatarColor(person.id || person.name) }}
            title={person.name}
          >
            {personInitials(person.name)}
          </span>
        ))}
      </span>
      {overflow > 0 ? (
        <span className="ml-0.5 text-[9px] font-semibold text-current opacity-80">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

function TypeSwatch({ eventType }: { eventType: string }) {
  const color = eventTypeColor(eventType);
  const label = normalizeEventTypeLabel(eventType);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
      style={{ backgroundColor: color.bg }}
    >
      {label}
    </span>
  );
}

function EventFields({
  form,
  onChange,
  eventTypeOptions,
  divisionOptions,
  showAdminChecks = false,
}: {
  form: EventForm;
  onChange: (next: EventForm) => void;
  eventTypeOptions: FieldOption[];
  divisionOptions: FieldOption[];
  showAdminChecks?: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="label">Title</label>
        <input
          className="field"
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Starts (optional)</label>
        <input
          className="field"
          type="datetime-local"
          value={form.starts_at}
          onChange={(e) => onChange({ ...form, starts_at: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Ends</label>
        <input
          className="field"
          type="datetime-local"
          value={form.ends_at}
          onChange={(e) => onChange({ ...form, ends_at: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Location</label>
        <input
          className="field"
          value={form.location}
          onChange={(e) => onChange({ ...form, location: e.target.value })}
        />
      </div>
      <div>
        <label className="label">Type</label>
        <SearchSelect
          className="field"
          value={form.event_type}
          onChange={(event_type) => onChange({ ...form, event_type })}
          options={selectOptionsWithCurrent(eventTypeOptions, form.event_type)}
        />
      </div>
      <div>
        <label className="label">Division</label>
        <SearchSelect
          className="field"
          value={form.division}
          allowEmpty
          emptyLabel="Unassigned"
          placeholder="Unassigned"
          onChange={(division) => onChange({ ...form, division })}
          options={selectOptionsWithCurrent(divisionOptions, form.division)}
        />
      </div>
      <div className="md:col-span-2">
        <label className="label">Link</label>
        <input
          className="field"
          value={form.link_url}
          onChange={(e) => onChange({ ...form, link_url: e.target.value })}
          placeholder="https://"
        />
      </div>
      <div className="md:col-span-2">
        <label className="label">Notes</label>
        <RichTextEditor
          value={form.notes}
          onChange={(notes) => onChange({ ...form, notes })}
          placeholder="Event notes…"
          minHeight="88px"
        />
      </div>
      {showAdminChecks ? (
        <div className="md:col-span-2 space-y-2 rounded-lg border border-border bg-sand/40 px-3 py-3">
          <p className="label !mb-1">Admin checklist</p>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={form.social_media_post_completed}
              onChange={(e) =>
                onChange({
                  ...form,
                  social_media_post_completed: e.target.checked,
                })
              }
            />
            Social media post completed
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={form.personal_social_media_graphics_completed}
              onChange={(e) =>
                onChange({
                  ...form,
                  personal_social_media_graphics_completed: e.target.checked,
                })
              }
            />
            Personal social media graphics completed
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="rounded border-border"
              checked={form.reached_out_for_pr_to_organisers}
              onChange={(e) =>
                onChange({
                  ...form,
                  reached_out_for_pr_to_organisers: e.target.checked,
                })
              }
            />
            Reached out for PR to event organisers
          </label>
        </div>
      ) : null}
    </div>
  );
}

type NewContactDraft = {
  name: string;
  organisation: string;
  role: string;
  email: string;
  phone: string;
};

const emptyNewContact = (name = ""): NewContactDraft => ({
  name,
  organisation: "",
  role: "",
  email: "",
  phone: "",
});

function EventAttendeeManager({
  attending,
  contacts,
  contactsLoaded,
  canManage,
  currentUserId,
  saving,
  onAddContact,
  onContactCreated,
  onRemove,
  className = "",
}: {
  attending: EventAttendance[];
  contacts: Contact[];
  contactsLoaded: boolean;
  canManage: boolean;
  currentUserId: string | null;
  saving: boolean;
  onAddContact: (contactId: string) => void;
  onContactCreated: (contact: Contact) => void;
  onRemove: (userId: string) => void;
  className?: string;
}) {
  const [pick, setPick] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<NewContactDraft>(emptyNewContact);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");

  const attendingIds = useMemo(() => {
    const ids = new Set(attending.map((a) => a.user_id));
    const names = new Set(
      attending.map((a) => a.user_name.trim().toLowerCase()).filter(Boolean)
    );
    return { ids, names };
  }, [attending]);

  const options = useMemo(() => {
    return contacts
      .filter((c) => c.kind !== "company")
      .filter((c) => {
        const name = c.name.trim();
        if (!name) return false;
        const linkedId = (c.user_id ?? "").trim();
        if (linkedId && attendingIds.ids.has(linkedId)) return false;
        if (attendingIds.ids.has(c.id) || attendingIds.ids.has(`contact:${c.id}`)) {
          return false;
        }
        if (attendingIds.names.has(name.toLowerCase())) return false;
        return true;
      })
      .map((c) => ({
        value: c.id,
        label: c.organisation ? `${c.name} · ${c.organisation}` : c.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [contacts, attendingIds]);

  function openCreateModal(name = "") {
    setCreateForm(emptyNewContact(name.trim()));
    setCreateError("");
    setCreateOpen(true);
  }

  function closeCreateModal() {
    if (createSaving) return;
    setCreateOpen(false);
    setCreateError("");
  }

  useEffect(() => {
    if (!createOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (!createSaving) {
        setCreateOpen(false);
        setCreateError("");
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [createOpen, createSaving]);

  async function saveNewContact() {
    if (createSaving) return;
    setCreateSaving(true);
    setCreateError("");
    try {
      const item = await createPersonContact(createForm);
      onContactCreated(item);
      setCreateOpen(false);
      setPick("");
      onAddContact(item.id);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Could not add this person"
      );
    } finally {
      setCreateSaving(false);
    }
  }

  return (
    <div className={className}>
      <p className="label !mb-2">Attending ({attending.length})</p>
      {attending.length > 0 ? (
        <div className="space-y-2">
          <AttendeeInitials
            people={attending.map((p) => ({
              id: p.user_id,
              name: p.user_name,
            }))}
            max={8}
            size="md"
          />
          <ul className="space-y-1">
            {attending.map((person) => (
              <li
                key={person.id}
                className="flex items-center justify-between gap-2 text-sm text-foreground"
              >
                <span>
                  {person.user_name}
                  {person.user_id === currentUserId ? (
                    <span className="ml-1 text-xs text-muted">(you)</span>
                  ) : null}
                </span>
                {canManage ? (
                  <button
                    type="button"
                    className="btn-ghost shrink-0 px-2 py-0.5 text-xs"
                    disabled={saving}
                    onClick={() => onRemove(person.user_id)}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted">No one marked attending yet.</p>
      )}
      {canManage ? (
        <div className="mt-3">
          <SearchSelect
            className="field"
            value={pick}
            disabled={saving || !contactsLoaded || createSaving}
            aria-label="Add someone attending"
            placeholder={
              contactsLoaded ? "Add someone…" : "Loading people…"
            }
            searchPlaceholder="Search or add a person…"
            options={options}
            noResultsLabel="No matches — add them as a new contact"
            allowCreate
            createLabel={(name) => `Add “${name}” as a new contact…`}
            onCreate={(name) => {
              openCreateModal(name);
            }}
            onChange={(contactId) => {
              if (!contactId) return;
              setPick("");
              onAddContact(contactId);
            }}
          />
        </div>
      ) : null}

      {createOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 md:left-sidebar"
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-new-contact-title"
          onClick={closeCreateModal}
        >
          <div
            className="surface-card w-full max-w-md p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="event-new-contact-title"
              className="font-display text-xl text-brand"
            >
              New contact
            </h3>
            <p className="mt-1 text-sm text-muted">
              Add them to Contacts, then mark them attending this event.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="event-new-contact-name">
                  Name
                </label>
                <input
                  id="event-new-contact-name"
                  className="field"
                  autoFocus
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveNewContact();
                    }
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="event-new-contact-org">
                  Organisation
                </label>
                <input
                  id="event-new-contact-org"
                  className="field"
                  value={createForm.organisation}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      organisation: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="label" htmlFor="event-new-contact-role">
                  Role
                </label>
                <input
                  id="event-new-contact-role"
                  className="field"
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, role: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="label" htmlFor="event-new-contact-email">
                  Email
                </label>
                <input
                  id="event-new-contact-email"
                  className="field"
                  type="email"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="label" htmlFor="event-new-contact-phone">
                  Phone
                </label>
                <input
                  id="event-new-contact-phone"
                  className="field"
                  value={createForm.phone}
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            {createError ? (
              <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
                {createError}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={createSaving}
                onClick={closeCreateModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={createSaving || !createForm.name.trim()}
                onClick={() => void saveNewContact()}
              >
                {createSaving ? "Saving…" : "Save & add"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EventsClient({
  initialEvents,
  initialAttendance = [],
  currentUserId,
  currentUserName,
  fieldOptions: fieldOptionsProp,
}: {
  initialEvents: EventItem[];
  initialAttendance?: EventAttendance[];
  currentUserId: string | null;
  currentUserName: string | null;
  /** From Field Manager — drives select option order on this page. */
  fieldOptions?: Record<string, FieldOption[]>;
}) {
  const { view } = useHubView();
  const canDelete = view === "admin";
  const canManageAttendees = view !== "external";
  const showUndatedQueue = view === "admin";
  const showAdminChecks = view === "admin";

  const fieldOptions = useManagedFieldOptions("events", fieldOptionsProp);
  const eventTypeOptions = ensureFieldOption(
    ensureFieldOption(
      optionsForField(fieldOptions, "event_type", EVENT_TYPES),
      { value: "Boat show", label: "Boat show" },
      "Trade show"
    ),
    { value: "Race", label: "Race" },
    "Boat show"
  );
  const divisionOptions = optionsForField(
    fieldOptions,
    "division",
    DIVISIONS
  );

  const [events, setEvents] = useState(initialEvents);
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EventForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(() => todayDateKey());
  const [dateTo, setDateTo] = useState("");
  const [allAttendance, setAllAttendance] =
    useState<EventAttendance[]>(initialAttendance);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [peopleContacts, setPeopleContacts] = useState<Contact[]>([]);
  const [peopleContactsLoaded, setPeopleContactsLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/events");
    const data = await res.json();
    setEvents(data.events ?? []);
    if (Array.isArray(data.attendance)) {
      setAllAttendance(data.attendance);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!canManageAttendees) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/contacts");
        if (!res.ok) return;
        const data = (await res.json()) as { contacts?: Contact[] };
        if (!cancelled) setPeopleContacts(data.contacts ?? []);
      } catch {
        /* keep empty list */
      } finally {
        if (!cancelled) setPeopleContactsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageAttendees]);

  // Keep selected in sync after refresh/edit
  useEffect(() => {
    if (!selected) return;
    const next = events.find((e) => e.id === selected.id) ?? null;
    setSelected(next);
    // Only re-sync when the list or selected id changes, not on every selected object update.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected intentionally omitted
  }, [events, selected?.id]);

  const attendance = useMemo(
    () =>
      selected?.id
        ? allAttendance
            .filter((a) => a.event_id === selected.id)
            .sort((a, b) => a.user_name.localeCompare(b.user_name))
        : [],
    [allAttendance, selected?.id]
  );

  const attendingByEventId = useMemo(() => {
    const map = new Map<string, EventAttendance[]>();
    for (const row of allAttendance) {
      if (row.attendance_status !== "attending") continue;
      const list = map.get(row.event_id);
      if (list) list.push(row);
      else map.set(row.event_id, [row]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.user_name.localeCompare(b.user_name));
    }
    return map;
  }, [allAttendance]);

  const myAttendanceStatus = useMemo(() => {
    if (!currentUserId) return null;
    return (
      attendance.find((a) => a.user_id === currentUserId)?.attendance_status ??
      null
    );
  }, [attendance, currentUserId]);

  const attendingPeople = useMemo(
    () => attendance.filter((a) => a.attendance_status === "attending"),
    [attendance]
  );

  const setMyAttendance = useCallback(
    async (status: EventAttendanceStatus) => {
      if (!selected?.id || !currentUserId || attendanceSaving) return;
      const eventId = selected.id;
      setAttendanceSaving(true);
      // Optimistic update across calendar + detail
      setAllAttendance((prev) => {
        const existing = prev.find(
          (a) => a.event_id === eventId && a.user_id === currentUserId
        );
        if (existing) {
          return prev.map((a) =>
            a.event_id === eventId && a.user_id === currentUserId
              ? {
                  ...a,
                  attendance_status: status,
                  user_name: currentUserName || a.user_name,
                  updated_at: new Date().toISOString(),
                }
              : a
          );
        }
        return [
          ...prev,
          {
            id: `att_temp_${currentUserId}`,
            event_id: eventId,
            user_id: currentUserId,
            user_name: currentUserName || "You",
            attendance_status: status,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      });
      try {
        const res = await fetch("/api/events/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, status }),
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.attendance)) {
          setAllAttendance((prev) => [
            ...prev.filter((a) => a.event_id !== eventId),
            ...data.attendance,
          ]);
        }
      } finally {
        setAttendanceSaving(false);
      }
    },
    [selected?.id, currentUserId, currentUserName, attendanceSaving]
  );

  const mergeEventAttendance = useCallback(
    (eventId: string, rows: EventAttendance[]) => {
      setAllAttendance((prev) => [
        ...prev.filter((a) => a.event_id !== eventId),
        ...rows,
      ]);
    },
    []
  );

  const addAttendeeFromContact = useCallback(
    async (eventId: string, contactId: string) => {
      if (!eventId || !contactId || attendanceSaving) return;
      setAttendanceSaving(true);
      try {
        const res = await fetch("/api/events/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            status: "attending",
            contactId,
          }),
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.attendance)) {
          mergeEventAttendance(eventId, data.attendance);
        }
      } finally {
        setAttendanceSaving(false);
      }
    },
    [attendanceSaving, mergeEventAttendance]
  );

  const removeAttendee = useCallback(
    async (eventId: string, userId: string) => {
      if (!eventId || !userId || attendanceSaving) return;
      setAttendanceSaving(true);
      try {
        const res = await fetch("/api/events/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            action: "remove",
            userId,
          }),
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.attendance)) {
          mergeEventAttendance(eventId, data.attendance);
        }
      } finally {
        setAttendanceSaving(false);
      }
    },
    [attendanceSaving, mergeEventAttendance]
  );

  const editingAttending = useMemo(
    () =>
      editingId
        ? allAttendance
            .filter(
              (a) =>
                a.event_id === editingId && a.attendance_status === "attending"
            )
            .sort((a, b) => a.user_name.localeCompare(b.user_name))
        : [],
    [allAttendance, editingId]
  );

  const eventTypes = useMemo(() => {
    const present = events.map((e) => e.event_type.trim()).filter(Boolean);
    return orderedFilterValues(eventTypeOptions, present);
  }, [events, eventTypeOptions]);

  const divisions = useMemo(() => {
    const present = events
      .map((e) => normalizeDivision(e.division))
      .filter(Boolean);
    return orderedFilterValues(divisionOptions, present);
  }, [events, divisionOptions]);

  const attendeePeople = useMemo(() => {
    const byId = new Map<string, string>();
    for (const row of allAttendance) {
      if (row.attendance_status !== "attending") continue;
      const id = row.user_id.trim();
      const name = row.user_name.trim();
      if (!id || !name) continue;
      if (!byId.has(id)) byId.set(id, name);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allAttendance]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (
        !matchesNonDateFilters(
          e,
          search,
          typeFilter,
          divisionFilter,
          personFilter,
          attendingByEventId
        )
      ) {
        return false;
      }
      if (!matchesDateRange(e, dateFrom, dateTo)) return false;
      return true;
    });
  }, [
    events,
    search,
    typeFilter,
    divisionFilter,
    personFilter,
    attendingByEventId,
    dateFrom,
    dateTo,
  ]);

  /** Calendar keeps historic events so past months stay populated. */
  const calendarFiltered = useMemo(() => {
    return events.filter((e) => {
      if (
        !matchesNonDateFilters(
          e,
          search,
          typeFilter,
          divisionFilter,
          personFilter,
          attendingByEventId
        )
      ) {
        return false;
      }
      if (
        !isDefaultUpcomingDateRange(dateFrom, dateTo) &&
        !matchesDateRange(e, dateFrom, dateTo)
      ) {
        return false;
      }
      return true;
    });
  }, [
    events,
    search,
    typeFilter,
    divisionFilter,
    personFilter,
    attendingByEventId,
    dateFrom,
    dateTo,
  ]);

  const dated = useMemo(
    () => filtered.filter((e) => hasValidStart(e)),
    [filtered]
  );
  const calendarDated = useMemo(
    () => calendarFiltered.filter((e) => hasValidStart(e)),
    [calendarFiltered]
  );
  const undated = useMemo(
    () =>
      filtered
        .filter((e) => !hasValidStart(e))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [filtered]
  );

  useEffect(() => {
    return onTourPrepare((action) => {
      if (action.type === "events-list-view") {
        setViewMode("list");
        return;
      }
      if (action.type === "events-select-first") {
        setViewMode("list");
        const first = dated[0] ?? undated[0] ?? filtered[0] ?? null;
        setSelected(first);
      }
    });
  }, [dated, undated, filtered]);

  const calendarEvents = useMemo(
    () =>
      calendarDated.map((e) => {
        const color = eventTypeColor(e.event_type);
        const startIso = e.starts_at!;
        const allDay = isDateOnlyIso(startIso);
        let end: string | undefined;
        if (e.ends_at) {
          if (allDay || isDateOnlyIso(e.ends_at)) {
            end = format(
              addDays(parseISO(e.ends_at.slice(0, 10)), 1),
              "yyyy-MM-dd"
            );
          } else {
            end = e.ends_at;
          }
        }
        const attendees = (attendingByEventId.get(e.id) ?? []).map((a) => ({
          id: a.user_id,
          name: a.user_name,
        }));
        return {
          id: e.id,
          title: e.title,
          start: allDay ? startIso.slice(0, 10) : startIso,
          end,
          allDay,
          backgroundColor: color.bg,
          borderColor: color.border,
          textColor: color.text,
          extendedProps: {
            eventType: e.event_type,
            attendees,
          },
        };
      }),
    [calendarDated, attendingByEventId]
  );

  const typeLegend = useMemo(() => {
    const fromData = new Set(
      events.map((e) => normalizeEventTypeLabel(e.event_type)).filter(Boolean)
    );
    const known = Object.keys(EVENT_TYPE_COLORS);
    const ordered = [
      ...known.filter((k) => fromData.has(k)),
      ...Array.from(fromData)
        .filter((k) => !known.includes(k))
        .sort(),
    ];
    return ordered.length ? ordered : known;
  }, [events]);

  const flashSyncNotice = useCallback((message: string) => {
    setSyncNotice(message);
    window.setTimeout(() => setSyncNotice(null), 3500);
  }, []);

  const handleDownloadFilteredIcs = useCallback(() => {
    setSyncMenuOpen(false);
    const count = downloadCalendarIcs(filtered, "marketing-events.ics");
    if (count === 0) {
      flashSyncNotice("No dated events to export for the current filters.");
      return;
    }
    flashSyncNotice(`Downloaded ${count} event${count === 1 ? "" : "s"} (.ics).`);
  }, [filtered, flashSyncNotice]);

  const handleCopyCalendarFeed = useCallback(() => {
    setSyncMenuOpen(false);
    const webcal = eventsFeedWebcalUrl(window.location.origin);
    void navigator.clipboard?.writeText(webcal).then(
      () =>
        flashSyncNotice(
          "Calendar feed URL copied — paste into Google Calendar, Outlook, or Apple Calendar."
        ),
      () => flashSyncNotice(`Feed URL: ${webcal}`)
    );
  }, [flashSyncNotice]);

  async function createEvent() {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        starts_at: form.starts_at
          ? new Date(form.starts_at).toISOString()
          : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      }),
    });
    setShowForm(false);
    setForm(emptyForm);
    await refresh();
  }

  function openEdit(event: EventItem) {
    setEditingId(event.id);
    setEdit(toEditForm(event));
  }

  function closeEdit() {
    setEditingId(null);
    setEdit(null);
  }

  async function saveEdit() {
    if (!editingId || !edit) return;
    setSaving(true);
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingId,
          patch: {
            title: edit.title.trim() || "Untitled event",
            starts_at: edit.starts_at
              ? new Date(edit.starts_at).toISOString()
              : null,
            ends_at: edit.ends_at ? new Date(edit.ends_at).toISOString() : null,
            location: edit.location,
            event_type: edit.event_type || "Event",
            division: edit.division || "",
            notes: edit.notes,
            link_url: edit.link_url,
            ...(showAdminChecks
              ? {
                  social_media_post_completed: edit.social_media_post_completed,
                  personal_social_media_graphics_completed:
                    edit.personal_social_media_graphics_completed,
                  reached_out_for_pr_to_organisers:
                    edit.reached_out_for_pr_to_organisers,
                }
              : {}),
          },
        }),
      });
      closeEdit();
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function patchEventAdminChecks(
    eventId: string,
    patch: Partial<
      Pick<
        EventItem,
        | "social_media_post_completed"
        | "personal_social_media_graphics_completed"
        | "reached_out_for_pr_to_organisers"
      >
    >
  ) {
    if (!showAdminChecks) return;
    setSaving(true);
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: eventId,
          patch,
        }),
      });
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, ...patch } : e))
      );
      setSelected((prev) =>
        prev?.id === eventId ? { ...prev, ...patch } : prev
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(id: string) {
    if (!canDelete) return;
    if (!window.confirm("Delete this event?")) return;
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    if (editingId === id) closeEdit();
    setSelected(null);
    await refresh();
  }

  async function rescheduleEvent(
    id: string,
    startsAt: string,
    endsAt: string | null
  ) {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              starts_at: startsAt,
              ends_at: endsAt,
              updated_at: new Date().toISOString(),
            }
          : e
      )
    );
    setSelected((s) =>
      s && s.id === id ? { ...s, starts_at: startsAt, ends_at: endsAt } : s
    );
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id,
        patch: { starts_at: startsAt, ends_at: endsAt },
      }),
    });
  }

  const editingEvent = editingId
    ? events.find((e) => e.id === editingId) ?? null
    : null;

  const selectedGoogleUrl =
    selected && hasValidStart(selected)
      ? googleCalendarAddUrl(selected)
      : null;
  const selectedOutlookUrl =
    selected && hasValidStart(selected)
      ? outlookCalendarAddUrl(selected)
      : null;

  return (
    <div>
      <FullCalendarStyles />
      <style>{`
        .hub-events-fc .fc-list-event td {
          border-color: transparent !important;
          background: transparent !important;
          vertical-align: middle;
        }
        .hub-events-fc .fc-list-event:hover td {
          background: transparent !important;
        }
        .hub-events-fc .fc-list-event-title {
          padding-top: 4px !important;
          padding-bottom: 4px !important;
        }
        .hub-events-fc .fc-list-event-title a {
          color: inherit !important;
        }
        .hub-events-fc .fc-daygrid-event {
          border: none !important;
        }
        .hub-events-fc .fc-event-main {
          padding: 0 !important;
        }
      `}</style>
      <PageHeader
        title="Events"
        description="Add and edit shows and meetings. Mark whether you're attending, and add who else is going."
        actions={
          <>
            <div className="relative">
              <button
                type="button"
                className="btn-secondary"
                aria-expanded={syncMenuOpen}
                aria-haspopup="menu"
                onClick={() => setSyncMenuOpen((open) => !open)}
              >
                Sync calendar
              </button>
              {syncMenuOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default md:left-sidebar"
                    aria-label="Close sync menu"
                    onClick={() => setSyncMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-border bg-white p-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-sand"
                      onClick={handleDownloadFilteredIcs}
                    >
                      Download filtered events (.ics)
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-sand"
                      onClick={handleCopyCalendarFeed}
                    >
                      Copy calendar feed URL
                    </button>
                    <a
                      role="menuitem"
                      href="/api/events/feed"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-sand"
                      onClick={() => setSyncMenuOpen(false)}
                    >
                      Open / download full feed
                    </a>
                  </div>
                </>
              ) : null}
            </div>
            <button
              type="button"
              className="btn-secondary"
              data-tour="events-view-toggle"
              onClick={() =>
                setViewMode(viewMode === "calendar" ? "list" : "calendar")
              }
            >
              {viewMode === "calendar" ? "List view" : "Calendar view"}
            </button>
            <button
              type="button"
              className="btn-primary"
              data-tour="events-add"
              onClick={() => setShowForm(true)}
            >
              Add event
            </button>
          </>
        }
      />

      {syncNotice ? (
        <p
          className="mb-4 rounded-lg border border-border bg-accent-soft/40 px-3 py-2 text-sm text-foreground"
          role="status"
        >
          {syncNotice}
        </p>
      ) : null}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search events, location, notes…"
        resultCount={filtered.length}
        totalCount={events.length}
        dateRange={{
          from: dateFrom,
          to: dateTo,
          onFromChange: setDateFrom,
          onToChange: setDateTo,
          clearFrom: todayDateKey(),
          clearTo: "",
        }}
        selects={[
          {
            id: "type",
            label: "Type",
            value: typeFilter,
            onChange: setTypeFilter,
            options: [
              { value: "all", label: "All types" },
              ...eventTypes.map((t) => ({ value: t, label: t })),
            ],
          },
          {
            id: "division",
            label: "Division",
            value: divisionFilter,
            onChange: setDivisionFilter,
            options: [
              { value: "all", label: "All divisions" },
              ...divisions.map((d) => ({ value: d, label: d })),
            ],
          },
          {
            id: "person",
            label: "Attending",
            value: personFilter,
            onChange: setPersonFilter,
            options: [
              { value: "all", label: "Anyone" },
              ...attendeePeople.map((p) => ({
                value: p.id,
                label: p.name,
              })),
            ],
          },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="font-medium text-foreground">Type (calendar colour)</span>
        {typeLegend.map((name) => {
          const color = eventTypeColor(name);
          return (
            <span key={name} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color.bg }}
                aria-hidden
              />
              {name}
            </span>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-accent-soft/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          Stay up to date — subscribe to the event calendar feed, or download a
          filtered .ics file.
        </p>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            className="btn-secondary !px-2.5 !py-1.5 text-xs"
            onClick={handleCopyCalendarFeed}
          >
            Get calendar feed
          </button>
          <button
            type="button"
            className="btn-secondary !px-2.5 !py-1.5 text-xs"
            onClick={handleDownloadFilteredIcs}
          >
            Download .ics
          </button>
        </div>
      </div>

      {showForm ? (
        <div className="surface-card mb-6 p-5">
          <EventFields
            form={form}
            onChange={setForm}
            eventTypeOptions={eventTypeOptions}
            divisionOptions={divisionOptions}
            showAdminChecks={showAdminChecks}
          />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void createEvent()}
            >
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

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div
          className="hub-events-fc surface-card p-4"
          data-tour="events-calendar"
        >
          {viewMode === "calendar" ? (
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin, listPlugin]}
              initialView="dayGridMonth"
              height="auto"
              firstDay={1}
              editable
              eventStartEditable
              eventDurationEditable={false}
              events={calendarEvents}
              eventClick={(info) => {
                const found = events.find((e) => e.id === info.event.id);
                setSelected(found ?? null);
              }}
              eventDrop={(info) => {
                const id = info.event.id;
                const existing = events.find((e) => e.id === id);
                if (!existing?.starts_at) {
                  info.revert();
                  return;
                }
                const newStartDay = info.event.startStr.slice(0, 10);
                const oldStartDay = existing.starts_at.slice(0, 10);
                const dayDelta = differenceInCalendarDays(
                  parseISO(newStartDay),
                  parseISO(oldStartDay)
                );
                const dateOnly = isDateOnlyIso(existing.starts_at);
                const starts_at = dateOnly
                  ? `${newStartDay}T00:00:00.000Z`
                  : info.event.start
                    ? info.event.start.toISOString()
                    : existing.starts_at;
                let ends_at: string | null = existing.ends_at;
                if (existing.ends_at) {
                  if (isDateOnlyIso(existing.ends_at)) {
                    ends_at = `${format(
                      addDays(parseISO(existing.ends_at.slice(0, 10)), dayDelta),
                      "yyyy-MM-dd"
                    )}T00:00:00.000Z`;
                  } else {
                    ends_at = addDays(
                      new Date(existing.ends_at),
                      dayDelta
                    ).toISOString();
                  }
                }
                void rescheduleEvent(id, starts_at, ends_at).catch(() =>
                  info.revert()
                );
              }}
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,listMonth",
              }}
              eventClassNames="!border-0 cursor-grab active:cursor-grabbing"
              eventContent={(arg) => {
                const eventType = String(
                  arg.event.extendedProps.eventType ?? ""
                );
                const attendees = (
                  Array.isArray(arg.event.extendedProps.attendees)
                    ? arg.event.extendedProps.attendees
                    : []
                ) as { id: string; name: string }[];
                const color = eventTypeColor(eventType);
                const isList = arg.view.type.startsWith("list");
                return (
                  <div
                    className={
                      isList
                        ? "flex w-full min-w-0 items-center gap-1.5 rounded px-2 py-1.5"
                        : "flex w-full min-w-0 flex-col gap-0.5 px-1 py-0.5"
                    }
                    style={
                      isList
                        ? {
                            backgroundColor: color.bg,
                            color: color.text,
                          }
                        : undefined
                    }
                  >
                    <span
                      className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight"
                      style={{ color: color.text }}
                    >
                      {arg.event.title}
                    </span>
                    <AttendeeInitials people={attendees} max={isList ? 5 : 3} />
                  </div>
                );
              }}
            />
          ) : (
            <ul className="divide-y divide-border">
              {dated.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    data-tour="events-list-item"
                    className={`flex w-full items-start justify-between gap-3 py-3 text-left hover:bg-sand ${
                      selected?.id === e.id ? "bg-accent-soft/50" : ""
                    }`}
                    onClick={() => setSelected(e)}
                  >
                    <div>
                      <p className="font-medium">{e.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <TypeSwatch eventType={e.event_type} />
                        {e.division ? (
                          <DivisionSwatch division={e.division} />
                        ) : null}
                        {e.location ? <span>{e.location}</span> : null}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">
                      {format(new Date(e.starts_at!), "d MMM yyyy")}
                    </span>
                  </button>
                </li>
              ))}
              {dated.length === 0 ? (
                <li className="py-6 text-sm text-muted">
                  No dated events match your filters.
                </li>
              ) : null}
            </ul>
          )}
        </div>

        <aside className="flex flex-col gap-4" data-tour="events-detail">
          <div className="surface-card p-5">
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-xl text-brand">
                    {selected.title}
                  </h2>
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
                    <dt className="label !mb-0.5">When</dt>
                    <dd
                      className={
                        hasValidStart(selected)
                          ? "text-foreground"
                          : "font-medium text-amber-800"
                      }
                    >
                      {formatEventWhen(selected)}
                    </dd>
                  </div>
                  <div>
                    <dt className="label !mb-0.5">Type</dt>
                    <dd>
                      <TypeSwatch eventType={selected.event_type || "Event"} />
                    </dd>
                  </div>
                  <div>
                    <dt className="label !mb-0.5">Division</dt>
                    <dd>
                      {selected.division ? (
                        <DivisionSwatch division={selected.division} />
                      ) : (
                        <span className="text-muted">Unassigned</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="label !mb-0.5">Location</dt>
                    <dd>{selected.location || "—"}</dd>
                  </div>
                  {selected.link_url ? (
                    <div>
                      <dt className="label !mb-0.5">Link</dt>
                      <dd>
                        <a
                          href={selected.link_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand underline-offset-2 hover:underline"
                        >
                          Open link
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="label !mb-0.5">Notes</dt>
                    <dd>
                      <RichTextView html={selected.notes} />
                    </dd>
                  </div>
                </dl>

                {showAdminChecks ? (
                  <div className="mt-4 space-y-2 rounded-lg border border-border bg-sand/40 px-3 py-3">
                    <p className="label !mb-1">Admin checklist</p>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        disabled={saving}
                        checked={Boolean(selected.social_media_post_completed)}
                        onChange={(e) =>
                          void patchEventAdminChecks(selected.id, {
                            social_media_post_completed: e.target.checked,
                          })
                        }
                      />
                      Social media post completed
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        disabled={saving}
                        checked={Boolean(
                          selected.personal_social_media_graphics_completed
                        )}
                        onChange={(e) =>
                          void patchEventAdminChecks(selected.id, {
                            personal_social_media_graphics_completed:
                              e.target.checked,
                          })
                        }
                      />
                      Personal social media graphics completed
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        disabled={saving}
                        checked={Boolean(
                          selected.reached_out_for_pr_to_organisers
                        )}
                        onChange={(e) =>
                          void patchEventAdminChecks(selected.id, {
                            reached_out_for_pr_to_organisers: e.target.checked,
                          })
                        }
                      />
                      Reached out for PR to event organisers
                    </label>
                  </div>
                ) : null}

                <RelatedTasksPanel
                  className="mt-4"
                  relatedType="event"
                  relatedId={selected.id}
                />

                {currentUserId ? (
                  <div
                    className="border-t border-border pt-3"
                    data-tour="events-attendance"
                  >
                    <p className="label !mb-2">Your attendance</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ATTENDANCE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          data-tour={`events-attendance-${opt.value}`}
                          disabled={attendanceSaving}
                          className={
                            myAttendanceStatus === opt.value
                              ? "btn-primary !px-2.5 !py-1.5 text-xs"
                              : "btn-secondary !px-2.5 !py-1.5 text-xs"
                          }
                          onClick={() => void setMyAttendance(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div
                  className="border-t border-border pt-3"
                  data-tour="events-attending-list"
                >
                  <EventAttendeeManager
                    attending={attendingPeople}
                    contacts={peopleContacts}
                    contactsLoaded={peopleContactsLoaded}
                    canManage={canManageAttendees}
                    currentUserId={currentUserId}
                    saving={attendanceSaving}
                    onContactCreated={(contact) => {
                      setPeopleContacts((prev) =>
                        prev.some((c) => c.id === contact.id)
                          ? prev
                          : [...prev, contact]
                      );
                    }}
                    onAddContact={(contactId) =>
                      void addAttendeeFromContact(selected.id, contactId)
                    }
                    onRemove={(userId) =>
                      void removeAttendee(selected.id, userId)
                    }
                  />
                </div>

                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => openEdit(selected)}
                  >
                    Edit event
                  </button>
                  {hasValidStart(selected) ? (
                    <>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          if (downloadEventIcs(selected)) {
                            flashSyncNotice("Event downloaded (.ics).");
                          }
                        }}
                      >
                        Download .ics
                      </button>
                      {selectedGoogleUrl ? (
                        <a
                          href={selectedGoogleUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary"
                        >
                          Google Calendar
                        </a>
                      ) : null}
                      {selectedOutlookUrl ? (
                        <a
                          href={selectedOutlookUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary"
                        >
                          Outlook
                        </a>
                      ) : null}
                    </>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      className="btn-ghost text-[var(--danger)]"
                      onClick={() => void removeEvent(selected.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">
                Select an event on the calendar or from the list below to see
                details.
              </p>
            )}
          </div>

          {showUndatedQueue ? (
            <div className="surface-card flex max-h-[420px] flex-col overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-brand">
                  Needs a date
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  {undated.length} event{undated.length === 1 ? "" : "s"} not on
                  the calendar
                </p>
              </div>
              <ul className="flex-1 divide-y divide-border overflow-y-auto">
                {undated.map((e) => (
                  <li
                    key={e.id}
                    className={`flex items-stretch ${
                      selected?.id === e.id ? "bg-accent-soft/50" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3 text-left hover:bg-sand"
                      onClick={() => setSelected(e)}
                    >
                      <span className="text-sm font-medium">{e.title}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <TypeSwatch eventType={e.event_type} />
                        {e.division ? (
                          <DivisionSwatch division={e.division} />
                        ) : null}
                        {e.location ? <span>{e.location}</span> : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn-ghost shrink-0 self-center px-3 py-1 text-xs"
                      onClick={() => {
                        setSelected(e);
                        openEdit(e);
                      }}
                    >
                      Edit
                    </button>
                  </li>
                ))}
                {undated.length === 0 ? (
                  <li className="px-4 py-6 text-sm text-muted">
                    All matching events have dates.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      {edit && editingEvent ? (
        <RecordDrawer
          open
          onClose={closeEdit}
          title="Edit event"
          ariaLabel="Edit event"
          footer={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => void saveEdit()}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeEdit}
              >
                Cancel
              </button>
              {canDelete ? (
                <button
                  type="button"
                  className="btn-ghost text-[var(--danger)]"
                  disabled={saving}
                  onClick={() => void removeEvent(editingEvent.id)}
                >
                  Delete
                </button>
              ) : null}
            </div>
          }
        >
          <EventFields
            form={edit}
            onChange={setEdit}
            eventTypeOptions={eventTypeOptions}
            divisionOptions={divisionOptions}
            showAdminChecks={showAdminChecks}
          />
          {editingId ? (
            <EventAttendeeManager
              className="mt-4"
              attending={editingAttending}
              contacts={peopleContacts}
              contactsLoaded={peopleContactsLoaded}
              canManage={canManageAttendees}
              currentUserId={currentUserId}
              saving={attendanceSaving}
              onContactCreated={(contact) => {
                setPeopleContacts((prev) =>
                  prev.some((c) => c.id === contact.id)
                    ? prev
                    : [...prev, contact]
                );
              }}
              onAddContact={(contactId) =>
                void addAttendeeFromContact(editingId, contactId)
              }
              onRemove={(userId) => void removeAttendee(editingId, userId)}
            />
          ) : null}
          <RelatedTasksPanel
            className="mt-4"
            relatedType="event"
            relatedId={editingId}
          />
        </RecordDrawer>
      ) : null}
    </div>
  );
}
