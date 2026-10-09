"use client";

import {
  PLANNER_CATEGORIES,
  PLANNER_DATE_STATUSES,
  PLANNER_PRIORITIES,
  PLANNER_REGIONS,
  type PlannerFields,
} from "@/lib/events/planner";

export type PlannerFormFields = PlannerFields & {
  recommended_arrival_start: string | null;
  recommended_arrival_end: string | null;
};

export const emptyPlannerForm = {
  transport_relevant: false,
  show_in_transport_planner: false,
  planner_category: "",
  recommended_arrival_start: "",
  recommended_arrival_end: "",
  transport_destination_region: "",
  transport_destination_port: "",
  transport_origin_regions: [] as string[],
  planner_priority: "standard",
  date_status: "confirmed",
  recurring_event: false,
  event_series_id: "",
  planner_slug: "",
  pm_attendance: "",
};

type FormShape = typeof emptyPlannerForm;

export function EventPlannerFields<T extends FormShape>({
  form,
  onChange,
}: {
  form: T;
  onChange: (next: T) => void;
}) {
  function toggleOrigin(value: string) {
    const has = form.transport_origin_regions.includes(value);
    onChange({
      ...form,
      transport_origin_regions: has
        ? form.transport_origin_regions.filter((v) => v !== value)
        : [...form.transport_origin_regions, value],
    });
  }

  return (
    <div className="md:col-span-2 space-y-3 rounded-lg border border-border px-3 py-3">
      <p className="label !mb-1">Yacht Transport Planner</p>
      <p className="text-xs text-muted">
        An event appears on the public planner only when both options below are ticked. Existing event types are unchanged.
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="rounded border-border"
          checked={form.transport_relevant}
          onChange={(e) => onChange({ ...form, transport_relevant: e.target.checked })}
        />
        Relevant to yacht transport?
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="rounded border-border"
          checked={form.show_in_transport_planner}
          onChange={(e) =>
            onChange({ ...form, show_in_transport_planner: e.target.checked })
          }
        />
        Show in Yacht Transport Planner?
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="label">Planner category</span>
          <select
            className="field"
            value={form.planner_category}
            onChange={(e) => onChange({ ...form, planner_category: e.target.value })}
          >
            <option value="">Use existing type</option>
            {PLANNER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Date status</span>
          <select
            className="field"
            value={form.date_status}
            onChange={(e) => onChange({ ...form, date_status: e.target.value })}
          >
            {PLANNER_DATE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Recommended arrival start</span>
          <input
            className="field"
            type="date"
            value={form.recommended_arrival_start || ""}
            onChange={(e) =>
              onChange({ ...form, recommended_arrival_start: e.target.value })
            }
          />
        </label>
        <label className="text-sm">
          <span className="label">Recommended arrival end</span>
          <input
            className="field"
            type="date"
            value={form.recommended_arrival_end || ""}
            onChange={(e) =>
              onChange({ ...form, recommended_arrival_end: e.target.value })
            }
          />
        </label>
        <label className="text-sm">
          <span className="label">Destination region</span>
          <select
            className="field"
            value={form.transport_destination_region}
            onChange={(e) =>
              onChange({ ...form, transport_destination_region: e.target.value })
            }
          >
            <option value="">None</option>
            {PLANNER_REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Destination port</span>
          <input
            className="field"
            value={form.transport_destination_port}
            onChange={(e) =>
              onChange({ ...form, transport_destination_port: e.target.value })
            }
            placeholder="e.g. Antigua"
          />
        </label>
        <label className="text-sm">
          <span className="label">Planner priority</span>
          <select
            className="field"
            value={form.planner_priority}
            onChange={(e) => onChange({ ...form, planner_priority: e.target.value })}
          >
            {PLANNER_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Public URL slug</span>
          <input
            className="field"
            value={form.planner_slug}
            onChange={(e) => onChange({ ...form, planner_slug: e.target.value })}
            placeholder="Filled from the title if left blank"
          />
        </label>
      </div>
      <fieldset>
        <legend className="label">Relevant origin regions</legend>
        <div className="flex flex-wrap gap-3">
          {PLANNER_REGIONS.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-border"
                checked={form.transport_origin_regions.includes(r.value)}
                onChange={() => toggleOrigin(r.value)}
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={form.recurring_event}
            onChange={(e) => onChange({ ...form, recurring_event: e.target.checked })}
          />
          Recurring event series
        </label>
        <label className="text-sm">
          <span className="label">Event series id</span>
          <input
            className="field"
            value={form.event_series_id}
            onChange={(e) => onChange({ ...form, event_series_id: e.target.value })}
            placeholder="e.g. antigua-sailing-week"
          />
        </label>
        <label className="text-sm">
          <span className="label">Peters & May attendance (internal)</span>
          <input
            className="field"
            value={form.pm_attendance}
            onChange={(e) => onChange({ ...form, pm_attendance: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
