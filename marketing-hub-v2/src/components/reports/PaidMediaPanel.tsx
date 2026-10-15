"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import type { PaidCampaign, PaidCampaignStatus } from "@/lib/types";
import {
  PAID_CAMPAIGN_PLATFORMS,
  optionsForField,
  type FieldOption,
} from "@/lib/data/collections";
import { useManagedFieldOptions } from "@/lib/data/useManagedFieldOptions";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { cn } from "@/lib/utils";
import { PaidCampaignLinkFields } from "@/components/reports/PaidCampaignLinkFields";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { removeById, rowFromResponse, upsertById } from "@/lib/data/list-patch";

const STATUS_OPTIONS: FieldOption[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "complete", label: "Complete" },
];

const PLATFORM_FILTER = [
  { value: "all", label: "All platforms" },
  ...PAID_CAMPAIGN_PLATFORMS,
];

function emptyForm(): Omit<PaidCampaign, "id" | "created_at" | "updated_at"> {
  return {
    name: "",
    platform: "LinkedIn",
    status: "draft",
    external_id: "",
    external_url: "",
    starts_at: null,
    ends_at: null,
    spent: null,
    goal: "",
    key_results: "",
    cost_per_result: null,
    impressions: null,
    clicks: null,
    ctr: "",
    landing_clicks: null,
    engagement_rate: "",
    notes: "",
    theme_id: null,
    content_id: null,
    event_id: null,
  };
}

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB").format(value);
}

function statusLabel(status: PaidCampaignStatus) {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

function statusClass(status: PaidCampaignStatus) {
  if (status === "active") return "bg-emerald-50 text-emerald-800";
  if (status === "paused") return "bg-amber-50 text-amber-800";
  if (status === "complete") return "bg-slate-100 text-slate-700";
  return "bg-sand text-muted";
}

export function PaidMediaPanel({
  initial,
  fieldOptions: fieldOptionsProp,
}: {
  initial: PaidCampaign[];
  fieldOptions?: Record<string, FieldOption[]>;
}) {
  const fieldOptions = useManagedFieldOptions(
    "paid_campaigns",
    fieldOptionsProp
  );
  const platformOptions = optionsForField(
    fieldOptions,
    "platform",
    PAID_CAMPAIGN_PLATFORMS
  );

  const [items, setItems] = useState(initial);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/paid-campaigns");
    const data = await res.json();
    setItems(data.paid_campaigns ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (platformFilter === "all") return items;
    return items.filter((item) => item.platform === platformFilter);
  }, [items, platformFilter]);

  const totals = useMemo(() => {
    const spent = filtered.reduce((sum, item) => sum + (item.spent ?? 0), 0);
    const withSpend = filtered.filter((item) => item.spent != null).length;
    return { spent, count: filtered.length, withSpend };
  }, [filtered]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setDrawerOpen(true);
  }

  function openEdit(item: PaidCampaign) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      platform: item.platform,
      status: item.status,
      external_id: item.external_id,
      external_url: item.external_url,
      starts_at: item.starts_at,
      ends_at: item.ends_at,
      spent: item.spent,
      goal: item.goal,
      key_results: item.key_results,
      cost_per_result: item.cost_per_result,
      impressions: item.impressions,
      clicks: item.clicks,
      ctr: item.ctr,
      landing_clicks: item.landing_clicks,
      engagement_rate: item.engagement_rate,
      notes: item.notes,
      theme_id: item.theme_id,
      content_id: item.content_id,
      event_id: item.event_id,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
  }

  async function save() {
    const payload = {
      ...form,
      spent: form.spent === null ? null : Number(form.spent),
      cost_per_result:
        form.cost_per_result === null ? null : Number(form.cost_per_result),
      impressions:
        form.impressions === null ? null : Number(form.impressions),
      clicks: form.clicks === null ? null : Number(form.clicks),
      landing_clicks:
        form.landing_clicks === null ? null : Number(form.landing_clicks),
    };

    const res = await fetch("/api/paid-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        editingId
          ? { action: "update", id: editingId, patch: payload }
          : payload
      ),
    });
    const data = await res.json().catch(() => ({}));
    const item = rowFromResponse<PaidCampaign>(data);
    if (!res.ok || !item) return;
    setItems((prev) => upsertById(prev, item));
    closeDrawer();
  }

  async function remove(id: string) {
    const res = await fetch("/api/paid-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    if (!res.ok) return;
    setItems((prev) => removeById(prev, id));
    if (editingId === id) closeDrawer();
  }

  function numField(
    key:
      | "spent"
      | "cost_per_result"
      | "impressions"
      | "clicks"
      | "landing_clicks",
    label: string
  ) {
    return (
      <div>
        <label className="label">{label}</label>
        <input
          className="field"
          type="number"
          step="any"
          value={form[key] ?? ""}
          onChange={(e) =>
            setForm({
              ...form,
              [key]: e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      </div>
    );
  }

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-brand">Paid media</h2>
          <p className="mt-1 text-sm text-muted">
            Snapshot spend and results from LinkedIn, Google Ads, and other
            platforms. Paste end-of-run numbers — live metrics stay in each
            platform console.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add campaign
        </button>
      </div>

      <div className="surface-card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Campaigns
          </p>
          <p className="mt-1 text-2xl font-semibold text-brand">
            {totals.count}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Total spend
          </p>
          <p className="mt-1 text-2xl font-semibold text-brand">
            {formatMoney(totals.spent)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Google Ads enquiries
          </p>
          <p className="mt-1 text-sm text-muted">
            Conversion attribution lives in{" "}
            <Link
              href="/app/enquiries"
              className="text-brand underline-offset-2 hover:underline"
            >
              Enquiries
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PLATFORM_FILTER.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition",
              platformFilter === option.value
                ? "bg-brand text-white"
                : "bg-sand text-muted hover:text-foreground"
            )}
            onClick={() => setPlatformFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border bg-sand/50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Spent</th>
                <th className="px-4 py-3 font-medium">Key results</th>
                <th className="px-4 py-3 font-medium">CPR</th>
                <th className="px-4 py-3 font-medium">Impressions</th>
                <th className="px-4 py-3 font-medium">Clicks</th>
                <th className="px-4 py-3 font-medium">CTR</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-8 text-center text-muted"
                  >
                    No paid campaigns yet. Add your first LinkedIn or Google Ads
                    snapshot.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border/70 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                        <div>
                          <p className="font-medium text-foreground">
                            {item.name}
                          </p>
                          {item.external_id ? (
                            <p className="text-xs text-muted">
                              ID {item.external_id}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{item.platform}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          statusClass(item.status)
                        )}
                      >
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatMoney(item.spent)}</td>
                    <td className="px-4 py-3 text-muted">
                      {item.key_results || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {formatMoney(item.cost_per_result)}
                    </td>
                    <td className="px-4 py-3">
                      {formatNumber(item.impressions)}
                    </td>
                    <td className="px-4 py-3">{formatNumber(item.clicks)}</td>
                    <td className="px-4 py-3 text-muted">{item.ctr || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {item.external_url ? (
                          <a
                            href={item.external_url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-ghost px-2 py-1"
                            title="Open in platform"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1"
                          onClick={() => openEdit(item)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen ? (
        <RecordDrawer
          open
          onClose={closeDrawer}
          title={editingId ? "Edit paid campaign" : "Add paid campaign"}
          className="max-w-xl"
          footer={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void save()}
              >
                Save
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeDrawer}
              >
                Cancel
              </button>
              {editingId ? (
                <button
                  type="button"
                  className="btn-ghost ml-auto text-[var(--danger)]"
                  onClick={() => void remove(editingId)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              ) : null}
            </div>
          }
        >
            <div className="space-y-4">
              <div>
                <label className="label">Campaign name</label>
                <input
                  className="field"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label">Platform</label>
                  <SearchSelect
                    className="field"
                    value={form.platform}
                    onChange={(platform) => setForm({ ...form, platform })}
                    options={platformOptions}
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
                        status: status as PaidCampaignStatus,
                      })
                    }
                    options={STATUS_OPTIONS}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label">Platform campaign ID</label>
                  <input
                    className="field"
                    value={form.external_id}
                    onChange={(e) =>
                      setForm({ ...form, external_id: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">Platform URL</label>
                  <input
                    className="field"
                    value={form.external_url}
                    onChange={(e) =>
                      setForm({ ...form, external_url: e.target.value })
                    }
                    placeholder="https://…"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label">Start date</label>
                  <input
                    className="field"
                    type="date"
                    value={form.starts_at ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        starts_at: e.target.value || null,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">End date</label>
                  <input
                    className="field"
                    type="date"
                    value={form.ends_at ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        ends_at: e.target.value || null,
                      })
                    }
                  />
                </div>
              </div>

              <PaidCampaignLinkFields
                themeId={form.theme_id}
                contentId={form.content_id}
                eventId={form.event_id}
                onThemeChange={(theme_id) => setForm({ ...form, theme_id })}
                onContentChange={(content_id) =>
                  setForm({ ...form, content_id })
                }
                onEventChange={(event_id) => setForm({ ...form, event_id })}
              />

              <div className="grid gap-3 md:grid-cols-2">
                {numField("spent", "Spent (£)")}
                {numField("cost_per_result", "Cost per result (£)")}
                {numField("impressions", "Impressions")}
                {numField("clicks", "Clicks")}
                {numField("landing_clicks", "Landing page clicks")}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label">Goal</label>
                  <input
                    className="field"
                    value={form.goal}
                    onChange={(e) => setForm({ ...form, goal: e.target.value })}
                    placeholder="Website visits, leads, awareness…"
                  />
                </div>
                <div>
                  <label className="label">Key results</label>
                  <input
                    className="field"
                    value={form.key_results}
                    onChange={(e) =>
                      setForm({ ...form, key_results: e.target.value })
                    }
                    placeholder="139 website visits"
                  />
                </div>
                <div>
                  <label className="label">CTR</label>
                  <input
                    className="field"
                    value={form.ctr}
                    onChange={(e) => setForm({ ...form, ctr: e.target.value })}
                    placeholder="0.5%"
                  />
                </div>
                <div>
                  <label className="label">Engagement rate</label>
                  <input
                    className="field"
                    value={form.engagement_rate}
                    onChange={(e) =>
                      setForm({ ...form, engagement_rate: e.target.value })
                    }
                    placeholder="1.12%"
                  />
                </div>
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea
                  className="field min-h-[88px]"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
        </RecordDrawer>
      ) : null}
    </section>
  );
}
