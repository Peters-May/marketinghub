"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import type {
  ContentItem,
  EmailAudience,
  EmailCampaign,
  EmailTemplate,
  QuarterlyTheme,
} from "@/lib/types";
import { EmptyState } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { cn } from "@/lib/utils";

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
  template_id: string;
  audience_id: string;
  brief: string;
  hubspot_url: string;
  theme_id: string;
  content_id: string;
  scheduled_at: string;
};

const emptyForm = (): FormState => ({
  title: "",
  subject: "",
  preview_text: "",
  from_name: "Peters & May Marketing",
  from_email: "marketing@petersandmay.com",
  html_body: "",
  template_id: "",
  audience_id: "",
  brief: "",
  hubspot_url: "",
  theme_id: "",
  content_id: "",
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
    template_id: c.template_id ?? "",
    audience_id: c.audience_id ?? "",
    brief: c.brief,
    hubspot_url: c.hubspot_url,
    theme_id: c.theme_id ?? "",
    content_id: c.content_id ?? "",
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
    }));
  }

  async function save() {
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
        template_id: form.template_id || null,
        audience_id: form.audience_id || null,
        brief: form.brief,
        hubspot_url: form.hubspot_url,
        theme_id: form.theme_id || null,
        content_id: form.content_id || null,
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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
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
          Draft, schedule, and send e-shots. Choose the Portal customers audience
          for people who opted in on the Portal.
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
                    `Portal list updated. ${data.upserted ?? 0} opted in, ${data.removed ?? 0} removed.`
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
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
          {sorted.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50",
                  selected?.id === c.id && "bg-slate-50"
                )}
                onClick={() => {
                  setSelected(c);
                  setEditing(true);
                  setCreating(false);
                  setForm(toForm(c));
                  setError("");
                }}
              >
                <div>
                  <div className="font-medium text-brand">{c.title}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {c.subject || "No subject"}
                    {c.scheduled_at
                      ? ` · scheduled ${new Date(c.scheduled_at).toLocaleString()}`
                      : null}
                    {c.sent_at
                      ? ` · sent ${new Date(c.sent_at).toLocaleString()}`
                      : null}
                  </div>
                </div>
                <StatusPill status={c.status} label={STATUS_LABEL[c.status]} />
              </button>
            </li>
          ))}
        </ul>
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

          <label className="block text-sm">
            <span className="text-muted">HTML body</span>
            <textarea
              className="input mt-1 min-h-[160px] w-full font-mono text-xs"
              value={form.html_body}
              onChange={(e) => setForm({ ...form, html_body: e.target.value })}
            />
            <span className="mt-1 block text-xs text-muted">
              Merge fields: {"{{name}}"}, {"{{organisation}}"},{" "}
              {"{{unsubscribe_url}}"}
            </span>
          </label>

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
