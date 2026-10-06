"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus } from "lucide-react";
import type {
  ContentItem,
  EmailAudience,
  EmailCampaign,
  EmailTemplate,
  QuarterlyTheme,
} from "@/lib/types";
import type { EmailDesign } from "@/lib/email/design";
import { EmptyState } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { cn } from "@/lib/utils";
import {
  campaignClickRateLabel,
  campaignMetaLine,
  campaignOpenRateLabel,
} from "@/lib/email/display";

const STATUS_LABEL: Record<EmailCampaign["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

type FormState = {
  title: string;
  subject: string;
  preview_text: string;
  from_name: string;
  from_email: string;
  html_body: string;
  design: EmailDesign | null;
  template_id: string;
  audience_id: string;
  brief: string;
  hubspot_url: string;
  theme_id: string;
  content_id: string;
  folder: string;
  scheduled_at: string;
};

const emptyForm = (): FormState => ({
  title: "",
  subject: "",
  preview_text: "",
  from_name: "Peters & May Marketing",
  from_email: "marketing@petersandmay.com",
  html_body: "",
  design: null,
  template_id: "",
  audience_id: "",
  brief: "",
  hubspot_url: "",
  theme_id: "",
  content_id: "",
  folder: "",
  scheduled_at: "",
});

function toForm(c: EmailCampaign): FormState {
  return {
    title: c.title,
    subject: c.subject,
    preview_text: c.preview_text,
    from_name: c.from_name,
    from_email: c.from_email,
    html_body: c.html_body,
    design: c.design,
    template_id: c.template_id ?? "",
    audience_id: c.audience_id ?? "",
    brief: c.brief,
    hubspot_url: c.hubspot_url,
    theme_id: c.theme_id ?? "",
    content_id: c.content_id ?? "",
    folder: c.folder ?? "",
    scheduled_at: c.scheduled_at
      ? c.scheduled_at.slice(0, 16)
      : "",
  };
}

export function EmailCampaignsPanel({
  campaigns,
  setCampaigns,
  templates,
  audiences,
  themes,
  newsletters,
  focusId,
  onFocusHandled,
  onRefresh,
}: {
  campaigns: EmailCampaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<EmailCampaign[]>>;
  templates: EmailTemplate[];
  audiences: EmailAudience[];
  themes: QuarterlyTheme[];
  newsletters: ContentItem[];
  focusId: string | null;
  onFocusHandled: () => void;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<EmailCampaign | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncingPortal, setSyncingPortal] = useState(false);
  const [portalNote, setPortalNote] = useState("");
  const [error, setError] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!focusId) return;
    const found = campaigns.find((c) => c.id === focusId) ?? null;
    if (found) {
      setSelected(found);
      setEditing(true);
      setCreating(false);
      setForm(toForm(found));
    }
    onFocusHandled();
  }, [focusId, campaigns, onFocusHandled]);

  useEffect(() => {
    if (!selected) return;
    const next = campaigns.find((c) => c.id === selected.id) ?? null;
    setSelected(next);
  }, [campaigns, selected?.id]);

  const previewRecipients = useCallback(async (audienceId: string) => {
    if (!audienceId) {
      setRecipientCount(null);
      return;
    }
    const res = await fetch("/api/email/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "preview_recipients",
        audience_id: audienceId,
      }),
    });
    const data = await res.json();
    setRecipientCount(typeof data.count === "number" ? data.count : null);
  }, []);

  useEffect(() => {
    if (editing || creating) {
      void previewRecipients(form.audience_id);
    }
  }, [form.audience_id, editing, creating, previewRecipients]);

  function applyTemplate(templateId: string) {
    const t = templates.find((x) => x.id === templateId);
    setForm((f) => ({
      ...f,
      template_id: templateId,
      subject: f.subject || t?.subject_default || "",
      preview_text: f.preview_text || t?.preview_text_default || "",
      html_body: t?.html_body || f.html_body,
      design: t ? t.design : f.design,
    }));
  }

  async function save(): Promise<EmailCampaign | null> {
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: form.title || "Untitled campaign",
        subject: form.subject,
        preview_text: form.preview_text,
        from_name: form.from_name,
        from_email: form.from_email,
        html_body: form.html_body,
        design: form.design,
        template_id: form.template_id || null,
        audience_id: form.audience_id || null,
        brief: form.brief,
        hubspot_url: form.hubspot_url,
        theme_id: form.theme_id || null,
        content_id: form.content_id || null,
        folder: form.folder,
      };

      if (creating) {
        const res = await fetch("/api/email/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Create failed");
        setCampaigns((prev) => [data.item, ...prev]);
        setSelected(data.item);
        setCreating(false);
        setEditing(true);
        setForm(toForm(data.item));
        return data.item as EmailCampaign;
      } else if (selected) {
        const res = await fetch("/api/email/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: selected.id,
            patch: payload,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Update failed");
        setCampaigns((prev) =>
          prev.map((c) => (c.id === data.item.id ? data.item : c))
        );
        setSelected(data.item);
        return data.item as EmailCampaign;
      }
      return null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function followUp(campaign: EmailCampaign) {
    setError("");
    try {
      const res = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "follow_up", id: campaign.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the follow-up");
      setCampaigns((prev) => [data.item, ...prev]);
      setSelected(data.item);
      setCreating(false);
      setEditing(true);
      setForm(toForm(data.item));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the follow-up");
    }
  }

  async function openDesigner() {
    const locked =
      selected?.status === "sent" || selected?.status === "sending";
    if (selected && locked) {
      router.push(`/app/email/design/campaign/${selected.id}`);
      return;
    }
    const saved = await save();
    if (!saved) return;
    router.push(`/app/email/design/campaign/${saved.id}`);
  }

  async function schedule() {
    if (!selected || !form.scheduled_at) {
      setError("Pick a schedule date/time first");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await save();
      const iso = new Date(form.scheduled_at).toISOString();
      const res = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          id: selected.id,
          scheduled_at: iso,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Schedule failed");
      setCampaigns((prev) =>
        prev.map((c) => (c.id === data.item.id ? data.item : c))
      );
      setSelected(data.item);
      setForm(toForm(data.item));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Schedule failed");
    } finally {
      setSaving(false);
    }
  }

  async function sendNow() {
    if (!selected) return;
    if (
      !window.confirm(
        `Send "${selected.title}" now to consented recipients? This cannot be undone.`
      )
    ) {
      return;
    }
    setSending(true);
    setError("");
    try {
      await save();
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: selected.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.campaign) {
          setCampaigns((prev) =>
            prev.map((c) => (c.id === data.campaign.id ? data.campaign : c))
          );
          setSelected(data.campaign);
        }
        throw new Error(data.error || "Send failed");
      }
      setCampaigns((prev) =>
        prev.map((c) => (c.id === data.campaign.id ? data.campaign : c))
      );
      setSelected(data.campaign);
      setForm(toForm(data.campaign));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this campaign?")) return;
    await fetch("/api/email/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    setSelected(null);
    setEditing(false);
  }

  const sorted = useMemo(
    () =>
      [...campaigns].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      ),
    [campaigns]
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Draft, schedule, and send e-shots. Sync Portal lists, then choose one
          as the audience. Portal customers is everyone who can receive general
          marketing. A list such as sailing schedules appears after you mark it
          for Marketing Hub.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={syncingPortal}
            onClick={() => {
              setSyncingPortal(true);
              setPortalNote("");
              setError("");
              void fetch("/api/email/audience/sync", { method: "POST" })
                .then(async (res) => {
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data.error || "Portal sync failed");
                  if (data.skipped) {
                    setPortalNote("Portal sync is not configured.");
                    return;
                  }
                  setPortalNote(
                    `Portal lists updated. ${data.upserted ?? 0} people, ${data.lists ?? 0} shared lists, ${data.removed ?? 0} removed.`
                  );
                  onRefresh();
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "Portal sync failed");
                })
                .finally(() => setSyncingPortal(false));
            }}
          >
            {syncingPortal ? "Syncing Portal…" : "Sync Portal list"}
          </button>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5"
            onClick={() => {
              setCreating(true);
              setEditing(true);
              setSelected(null);
              setForm(emptyForm());
              setError("");
            }}
          >
            <Plus className="h-4 w-4" />
            New campaign
          </button>
        </div>
      </div>
      {portalNote ? <p className="mb-3 text-sm text-muted">{portalNote}</p> : null}

      {sorted.length === 0 && !creating ? (
        <EmptyState
          title="No campaigns yet"
          description="Create an e-shot, attach an audience and template, then schedule or send."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Email name</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Recipients</th>
                <th className="px-3 py-3 font-medium">Open rate</th>
                <th className="px-3 py-3 font-medium">Click rate</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr
                  key={c.id}
                  className={cn(
                    "border-b border-border last:border-0",
                    selected?.id === c.id && "bg-slate-50"
                  )}
                >
                  <td className="px-4 py-3">
                    {c.folder ? (
                      <div className="text-xs text-muted">{c.folder}</div>
                    ) : null}
                    <button
                      type="button"
                      className="text-left font-medium text-brand hover:underline"
                      onClick={() => {
                        setSelected(c);
                        setEditing(true);
                        setCreating(false);
                        setForm(toForm(c));
                        setError("");
                      }}
                    >
                      {c.title}
                    </button>
                    <div className="text-xs text-muted">{campaignMetaLine(c)}</div>
                    {c.status === "sent" ? (
                      <button
                        type="button"
                        className="mt-1 text-xs text-accent underline"
                        onClick={() => void followUp(c)}
                      >
                        Create follow-up
                      </button>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={c.status} label={STATUS_LABEL[c.status]} />
                  </td>
                  <td className="px-3 py-3 tabular-nums">{c.stats.recipients}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {campaignOpenRateLabel(c)}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {campaignClickRateLabel(c)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordDrawer
        open={editing}
        onClose={() => {
          setEditing(false);
          setCreating(false);
          setSelected(null);
        }}
        title={creating ? "New campaign" : selected?.title || "Campaign"}
      >
        <div className="space-y-4">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <label className="block text-sm">
            <span className="text-muted">Title</span>
            <input
              className="input mt-1 w-full"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Subject</span>
            <input
              className="input mt-1 w-full"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Preview text</span>
            <input
              className="input mt-1 w-full"
              value={form.preview_text}
              onChange={(e) =>
                setForm({ ...form, preview_text: e.target.value })
              }
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-muted">From name</span>
              <input
                className="input mt-1 w-full"
                value={form.from_name}
                onChange={(e) =>
                  setForm({ ...form, from_name: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">From email</span>
              <input
                className="input mt-1 w-full"
                value={form.from_email}
                onChange={(e) =>
                  setForm({ ...form, from_email: e.target.value })
                }
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-muted">Template</span>
            <select
              className="input mt-1 w-full"
              value={form.template_id}
              onChange={(e) => applyTemplate(e.target.value)}
            >
              <option value="">— None —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-muted">Folder</span>
            <input
              className="input mt-1 w-full"
              value={form.folder}
              onChange={(e) => setForm({ ...form, folder: e.target.value })}
              placeholder="Commercial, Forwarding…"
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Audience</span>
            <select
              className="input mt-1 w-full"
              value={form.audience_id}
              onChange={(e) =>
                setForm({ ...form, audience_id: e.target.value })
              }
            >
              <option value="">— Select —</option>
              {audiences.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {recipientCount !== null ? (
              <span className="mt-1 block text-xs text-muted">
                {recipientCount} consented recipient
                {recipientCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </label>

          <div className="rounded-lg border border-border p-3">
            <p className="text-sm text-muted">
              Design the message with sections and blocks. Merge fields such as{" "}
              {"{{name}}"} stay in the text.
            </p>
            <button
              type="button"
              className="btn-secondary mt-3 text-sm"
              disabled={saving}
              onClick={() => void openDesigner()}
            >
              {selected?.status === "sent" || selected?.status === "sending"
                ? "View email"
                : "Design email"}
            </button>
          </div>

          <label className="block text-sm">
            <span className="text-muted">Brief</span>
            <textarea
              className="input mt-1 min-h-[80px] w-full"
              value={form.brief}
              onChange={(e) => setForm({ ...form, brief: e.target.value })}
              placeholder="Goal, offer, CTA, notes for the team…"
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">HubSpot URL (optional)</span>
            <input
              className="input mt-1 w-full"
              value={form.hubspot_url}
              onChange={(e) =>
                setForm({ ...form, hubspot_url: e.target.value })
              }
              placeholder="https://app.hubspot.com/…"
            />
            {form.hubspot_url ? (
              <a
                href={form.hubspot_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-brand"
              >
                Open in HubSpot <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-muted">Theme</span>
              <select
                className="input mt-1 w-full"
                value={form.theme_id}
                onChange={(e) =>
                  setForm({ ...form, theme_id: e.target.value })
                }
              >
                <option value="">— None —</option>
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted">Newsletter content</span>
              <select
                className="input mt-1 w-full"
                value={form.content_id}
                onChange={(e) =>
                  setForm({ ...form, content_id: e.target.value })
                }
              >
                <option value="">— None —</option>
                {newsletters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-muted">Schedule send</span>
            <input
              type="datetime-local"
              className="input mt-1 w-full"
              value={form.scheduled_at}
              onChange={(e) =>
                setForm({ ...form, scheduled_at: e.target.value })
              }
            />
          </label>

          {selected?.last_error ? (
            <p className="text-xs text-amber-800">Last error: {selected.last_error}</p>
          ) : null}

          {selected?.stats ? (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border border-border p-2">
                <div className="text-lg font-medium text-brand">
                  {selected.stats.recipients}
                </div>
                Recipients
              </div>
              <div className="rounded-lg border border-border p-2">
                <div className="text-lg font-medium text-brand">
                  {selected.stats.opened}
                </div>
                Opens
              </div>
              <div className="rounded-lg border border-border p-2">
                <div className="text-lg font-medium text-brand">
                  {selected.stats.clicked}
                </div>
                Clicks
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              type="button"
              className="btn-primary"
              disabled={saving || sending}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {!creating && selected ? (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={saving || sending || !form.scheduled_at}
                  onClick={() => void schedule()}
                >
                  Schedule
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={
                    saving ||
                    sending ||
                    selected.status === "sent" ||
                    selected.status === "sending"
                  }
                  onClick={() => void sendNow()}
                >
                  {sending ? "Sending…" : "Send now"}
                </button>
                <button
                  type="button"
                  className="btn-secondary text-red-700"
                  onClick={() => void remove(selected.id)}
                >
                  Delete
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              onClick={onRefresh}
            >
              Refresh
            </button>
          </div>
        </div>
      </RecordDrawer>
    </div>
  );
}
