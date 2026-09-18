"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  Contact,
  ContentItem,
  EmailChannel,
  MediaList,
  PrPitch,
} from "@/lib/types";
import { EmptyState } from "@/components/ui/PageHeader";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { cn } from "@/lib/utils";
import {
  applyPitchMerge,
  buildEml,
  downloadEmlBlob,
  downloadTextFile,
  DEFAULT_HUBSPOT_URL,
  hasMarketingConsent,
  insertNewsroomLink,
  insertReleaseBlock,
  mailtoHref,
  MERGE_TOKEN_HELP,
  recipientsToCsv,
} from "@/lib/email/compose";
import { plainTextFromHtml } from "@/lib/plain-text";

type WizardStep = "write" | "recipients" | "personalize" | "export";
type ViewMode = "dashboard" | "wizard" | "detail";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "recipients", label: "Recipients" },
  { id: "personalize", label: "Personalise" },
  { id: "export", label: "Export" },
];

function isPressRelease(c: ContentItem): boolean {
  const type = (c.content_type || "").toLowerCase();
  const cat = (c.category || "").toLowerCase();
  const channels = (c.channel || []).map((x) => x.toLowerCase());
  return (
    type === "pr" ||
    type === "press" ||
    cat === "press release" ||
    channels.includes("pr")
  );
}

function isNewsletter(c: ContentItem): boolean {
  const type = (c.content_type || "").toLowerCase();
  const channels = (c.channel || []).map((x) => x.toLowerCase());
  return type === "newsletter" || channels.includes("newsletter");
}

type Props = {
  initialPitches: PrPitch[];
  initialLists: MediaList[];
  initialContacts: Contact[];
  initialContent: ContentItem[];
  /** Prefill from release / newsletter deep-link. */
  prefillContentId?: string | null;
  onListsChanged?: () => void;
};

export function EmailsClient({
  initialPitches,
  initialLists,
  initialContacts,
  initialContent,
  prefillContentId,
}: Props) {
  const [pitches, setPitches] = useState(initialPitches);
  const [lists, setLists] = useState(initialLists);
  const [contacts, setContacts] = useState(initialContacts);
  const [content] = useState(initialContent);
  const [view, setView] = useState<ViewMode>("dashboard");
  const [step, setStep] = useState<WizardStep>("write");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | EmailChannel>(
    "all"
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewContactId, setPreviewContactId] = useState("");

  const [form, setForm] = useState({
    title: "",
    subject: "",
    body: "{{greeting}},\n\nI thought this might interest {{outlet}}.\n\nBest regards,\nMarketing\nPeters & May",
    preview_text: "",
    channel: "pr" as EmailChannel,
    from_name: "Peters & May Marketing",
    from_email: "marketing@petersandmay.com",
    campaign_tag: "",
    list_ids: [] as string[],
    content_id: "",
    hubspot_url: DEFAULT_HUBSPOT_URL,
  });

  const refresh = useCallback(async () => {
    const [p, l, c] = await Promise.all([
      fetch("/api/pr/pitches").then((r) => r.json()),
      fetch("/api/pr/media-lists").then((r) => r.json()),
      fetch("/api/contacts").then((r) => r.json()),
    ]);
    setPitches(p.pitches ?? []);
    setLists(l.media_lists ?? []);
    setContacts(c.contacts ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!prefillContentId) return;
    const piece = content.find((x) => x.id === prefillContentId);
    if (!piece) return;
    const channel: EmailChannel = isNewsletter(piece) ? "marketing" : "pr";
    setForm((f) => ({
      ...f,
      channel,
      title: piece.title,
      subject: piece.title,
      content_id: piece.id,
      preview_text: plainTextFromHtml(piece.caption || "").slice(0, 140),
      body: insertReleaseBlock(
        f.body,
        { title: piece.title, caption: piece.caption, id: piece.id },
        typeof window !== "undefined" ? window.location.origin : ""
      ),
    }));
    setView("wizard");
    setStep("write");
  }, [prefillContentId, content]);

  const contactById = useMemo(() => {
    const m = new Map(contacts.map((c) => [c.id, c]));
    return m;
  }, [contacts]);

  const releases = useMemo(
    () => content.filter((c) => isPressRelease(c) || isNewsletter(c)),
    [content]
  );

  const selected = pitches.find((p) => p.id === selectedId) ?? null;

  function resolveRecipients(pitch: {
    list_ids?: string[];
    media_list_id?: string | null;
    recipient_ids: string[];
    channel?: EmailChannel;
  }): Contact[] {
    const ids = new Set(pitch.recipient_ids || []);
    const listIds =
      pitch.list_ids?.length
        ? pitch.list_ids
        : pitch.media_list_id
          ? [pitch.media_list_id]
          : [];
    for (const lid of listIds) {
      const list = lists.find((l) => l.id === lid);
      list?.contact_ids.forEach((id) => ids.add(id));
    }
    let people = Array.from(ids)
      .map((id) => contactById.get(id))
      .filter((c): c is Contact => Boolean(c));
    if (pitch.channel === "marketing") {
      people = people.filter(hasMarketingConsent);
    }
    return people;
  }

  const filtered = useMemo(() => {
    return pitches.filter((p) => {
      if (channelFilter !== "all" && p.channel !== channelFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      return matchesSearch(search, [
        p.title,
        p.subject,
        p.campaign_tag,
        p.created_by,
        p.status,
        p.channel,
      ]);
    });
  }, [pitches, search, channelFilter, statusFilter]);

  const stats = useMemo(() => {
    const now = Date.now();
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recent = pitches.filter(
      (p) => new Date(p.updated_at).getTime() >= monthAgo
    );
    return {
      drafts: pitches.filter((p) => p.status === "draft").length,
      exported: pitches.filter((p) => p.status === "exported").length,
      sentExternal: pitches.filter((p) => p.status === "sent_external").length,
      recent: recent.length,
      pr: pitches.filter((p) => p.channel === "pr").length,
      marketing: pitches.filter((p) => p.channel === "marketing").length,
    };
  }, [pitches]);

  const listsForChannel = useMemo(() => {
    return lists.filter((l) => {
      if (form.channel === "pr")
        return l.list_kind === "press" || l.list_kind === "mixed";
      return l.list_kind === "marketing" || l.list_kind === "mixed";
    });
  }, [lists, form.channel]);

  const previewContact =
    contactById.get(previewContactId) ||
    resolveRecipients({
      list_ids: form.list_ids,
      recipient_ids: [],
      channel: form.channel,
    })[0] ||
    contacts[0];

  function startNew(channel: EmailChannel = "pr") {
    setForm({
      title: "",
      subject: channel === "pr" ? "Pitch from Peters & May" : "Peters & May update",
      body:
        channel === "pr"
          ? "{{greeting}},\n\nI thought this might interest {{outlet}}.\n\nBest regards,\nMarketing\nPeters & May"
          : "{{greeting}},\n\nHere is the latest from Peters & May.\n\nBest regards,\nMarketing",
      preview_text: "",
      channel,
      from_name: "Peters & May Marketing",
      from_email: "marketing@petersandmay.com",
      campaign_tag: "",
      list_ids: [],
      content_id: "",
      hubspot_url: DEFAULT_HUBSPOT_URL,
    });
    setSelectedId(null);
    setStep("write");
    setView("wizard");
    setMessage("");
  }

  function openDetail(id: string) {
    setSelectedId(id);
    setView("detail");
    setMessage("");
  }

  async function saveDraft() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/pr/pitches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          media_list_id: form.list_ids[0] || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      await refresh();
      setSelectedId(data.item.id);
      setMessage("Draft saved.");
      setStep("export");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function exportOutlook(mode: "bcc" | "each") {
    const pitch =
      selected ||
      pitches.find((p) => p.id === selectedId) ||
      null;
    if (!pitch && !form.title) {
      await saveDraft();
      return;
    }
    const draft = pitch ?? {
      ...form,
      id: selectedId || "",
      recipient_ids: [] as string[],
      media_list_id: form.list_ids[0] || null,
      list_ids: form.list_ids,
      status: "draft" as const,
    };
    let id = draft.id;
    if (!id) {
      setBusy(true);
      const res = await fetch("/api/pr/pitches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          media_list_id: form.list_ids[0] || null,
        }),
      });
      const data = await res.json();
      setBusy(false);
      if (!res.ok || !data.item) {
        setMessage(data.error || "Save failed");
        return;
      }
      id = data.item.id;
      setSelectedId(id);
      await refresh();
    }

    const full = (await fetch("/api/pr/pitches").then((r) => r.json()))
      .pitches as PrPitch[];
    const current = full.find((p) => p.id === id);
    if (!current) return;

    const recipients = resolveRecipients(current);
    if (!recipients.length) {
      setMessage(
        current.channel === "marketing"
          ? "No recipients with marketing consent on the selected lists."
          : "Add a list with contacts first."
      );
      return;
    }

    const from = `${current.from_name} <${current.from_email}>`;
    if (mode === "bcc") {
      const first = recipients[0];
      downloadEmlBlob(
        current.title,
        buildEml({
          from,
          to: [],
          bcc: recipients.map((c) => c.email).filter(Boolean),
          subject: applyPitchMerge(current.subject, first),
          body: applyPitchMerge(current.body, first),
        })
      );
    } else {
      for (const c of recipients) {
        if (!c.email) continue;
        downloadEmlBlob(
          `${current.title}-${c.name}`,
          buildEml({
            from,
            to: [c.email],
            subject: applyPitchMerge(current.subject, c),
            body: applyPitchMerge(current.body, c),
          })
        );
      }
    }

    await fetch("/api/pr/pitches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_exported", id }),
    });
    await refresh();
    setMessage("Downloaded .eml for Outlook.");
  }

  async function exportHubSpot() {
    let id = selectedId;
    if (!id) {
      await saveDraft();
      id = selectedId;
    }
    const full = pitches.find((p) => p.id === id) || selected;
    const draft = full || {
      list_ids: form.list_ids,
      media_list_id: form.list_ids[0] || null,
      recipient_ids: [] as string[],
      channel: "marketing" as const,
    };
    const recipients = resolveRecipients(draft);
    if (!recipients.length) {
      setMessage("No consented marketing recipients to export.");
      return;
    }
    const csv = recipientsToCsv(recipients, { requireMarketingConsent: true });
    downloadTextFile("hubspot-recipients.csv", csv, "text/csv");
    const emails = recipients.map((c) => c.email).join("; ");
    try {
      await navigator.clipboard.writeText(emails);
    } catch {
      /* ignore */
    }
    if (id) {
      await fetch("/api/pr/pitches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_sent_external",
          id,
          hubspot_url: form.hubspot_url || DEFAULT_HUBSPOT_URL,
        }),
      });
      await refresh();
    }
    window.open(form.hubspot_url || DEFAULT_HUBSPOT_URL, "_blank");
    setMessage(
      `CSV downloaded and ${recipients.length} emails copied. HubSpot opened — paste/import there to send.`
    );
  }

  async function createFollowUp(id: string) {
    const res = await fetch("/api/pr/pitches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "follow_up", id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Follow-up failed");
      return;
    }
    await refresh();
    setSelectedId(data.item.id);
    setView("detail");
    setMessage("Follow-up draft created.");
  }

  function embedRelease(contentId: string) {
    const piece = content.find((c) => c.id === contentId);
    if (!piece) return;
    setForm((f) => ({
      ...f,
      content_id: contentId,
      body: insertReleaseBlock(f.body, {
        title: piece.title,
        caption: piece.caption,
        id: piece.id,
      }),
    }));
  }

  function embedNewsroom() {
    setForm((f) => ({
      ...f,
      body: insertNewsroomLink(
        f.body,
        typeof window !== "undefined" ? window.location.origin : ""
      ),
    }));
  }

  if (view === "wizard") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="text-sm text-accent underline"
            onClick={() => setView("dashboard")}
          >
            ← Back to Emails
          </button>
          <div className="flex flex-wrap gap-2">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  step === s.id
                    ? "bg-brand text-white"
                    : "bg-mist text-brand"
                )}
              >
                {i + 1}. {s.label}
              </button>
            ))}
          </div>
        </div>

        {message ? (
          <p className="rounded-lg border border-brand/15 bg-mist px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}

        {step === "write" ? (
          <div className="surface-card space-y-3 p-5">
            <label className="block text-sm">
              <span className="text-muted">Channel</span>
              <select
                className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                value={form.channel}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    channel: e.target.value === "marketing" ? "marketing" : "pr",
                    list_ids: [],
                  }))
                }
              >
                <option value="pr">PR pitch (Outlook)</option>
                <option value="marketing">Marketing (HubSpot)</option>
              </select>
            </label>
            <input
              className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
              placeholder="Internal title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <input
              className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
              placeholder="Subject"
              value={form.subject}
              onChange={(e) =>
                setForm((f) => ({ ...f, subject: e.target.value }))
              }
            />
            <input
              className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
              placeholder="Preview text"
              value={form.preview_text}
              onChange={(e) =>
                setForm((f) => ({ ...f, preview_text: e.target.value }))
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="rounded-md border border-brand/15 px-3 py-2 text-sm"
                placeholder="From name"
                value={form.from_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, from_name: e.target.value }))
                }
              />
              <input
                className="rounded-md border border-brand/15 px-3 py-2 text-sm"
                placeholder="From email"
                value={form.from_email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, from_email: e.target.value }))
                }
              />
            </div>
            <input
              className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
              placeholder="Campaign tag (e.g. Forwarding)"
              value={form.campaign_tag}
              onChange={(e) =>
                setForm((f) => ({ ...f, campaign_tag: e.target.value }))
              }
            />
            <p className="text-xs text-muted">Tokens: {MERGE_TOKEN_HELP}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-brand/20 px-2 py-1 text-xs"
                onClick={embedNewsroom}
              >
                Add newsroom link
              </button>
              <select
                className="rounded border border-brand/20 px-2 py-1 text-xs"
                value=""
                onChange={(e) => {
                  if (e.target.value) embedRelease(e.target.value);
                }}
              >
                <option value="">Add press release / newsletter…</option>
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="h-48 w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
            <button
              type="button"
              className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
              onClick={() => setStep("recipients")}
            >
              Next: Recipients
            </button>
          </div>
        ) : null}

        {step === "recipients" ? (
          <div className="surface-card space-y-3 p-5">
            <p className="text-sm text-muted">
              {form.channel === "marketing"
                ? "Only marketing lists and contacts with marketing consent are used."
                : "Select press / mixed media lists."}
            </p>
            <ul className="space-y-2">
              {listsForChannel.map((l) => {
                const on = form.list_ids.includes(l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          list_ids: on
                            ? f.list_ids.filter((id) => id !== l.id)
                            : [...f.list_ids, l.id],
                        }))
                      }
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-sm",
                        on
                          ? "border-accent bg-accent-soft"
                          : "border-brand/10"
                      )}
                    >
                      {l.name}{" "}
                      <span className="text-muted">
                        ({l.list_kind} · {l.contact_ids.length})
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {listsForChannel.length === 0 ? (
              <p className="text-sm text-muted">
                No matching lists. Create one under Media lists / Contacts.
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-brand/20 px-3 py-2 text-sm"
                onClick={() => setStep("write")}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
                onClick={() => setStep("personalize")}
              >
                Next: Personalise
              </button>
            </div>
          </div>
        ) : null}

        {step === "personalize" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="surface-card space-y-3 p-5">
              <label className="block text-sm">
                <span className="text-muted">Preview as contact</span>
                <select
                  className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                  value={previewContactId}
                  onChange={(e) => setPreviewContactId(e.target.value)}
                >
                  <option value="">First recipient / any</option>
                  {contacts.slice(0, 80).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-brand/20 px-3 py-2 text-sm"
                  onClick={() => setStep("recipients")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
                  onClick={() => setStep("export")}
                >
                  Next: Export
                </button>
              </div>
            </div>
            <div className="surface-card p-5">
              <p className="text-xs text-muted">Desktop preview</p>
              <h3 className="mt-2 font-display text-xl">
                {previewContact
                  ? applyPitchMerge(form.subject, previewContact)
                  : form.subject}
              </h3>
              {form.preview_text ? (
                <p className="mt-1 text-xs text-muted">{form.preview_text}</p>
              ) : null}
              <pre className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
                {previewContact
                  ? applyPitchMerge(form.body, previewContact)
                  : form.body}
              </pre>
            </div>
          </div>
        ) : null}

        {step === "export" ? (
          <div className="surface-card space-y-4 p-5">
            <p className="text-sm text-muted">
              Hub does not send blasts. PR → Outlook .eml. Marketing → CSV +
              HubSpot.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveDraft()}
                className="rounded-lg border border-brand/20 px-3 py-2 text-sm"
              >
                Save draft
              </button>
              {form.channel === "pr" ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void exportOutlook("bcc")}
                    className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
                  >
                    Download .eml (BCC)
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void exportOutlook("each")}
                    className="rounded-lg border border-brand/20 px-3 py-2 text-sm"
                  >
                    One .eml each
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void exportHubSpot()}
                  className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
                >
                  Export CSV + open HubSpot
                </button>
              )}
            </div>
            <button
              type="button"
              className="text-sm text-accent underline"
              onClick={() => setStep("personalize")}
            >
              Back
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (view === "detail" && selected) {
    const recipients = resolveRecipients(selected);
    const first = recipients[0];
    return (
      <div className="space-y-4">
        <button
          type="button"
          className="text-sm text-accent underline"
          onClick={() => setView("dashboard")}
        >
          ← Back to Emails
        </button>
        {message ? (
          <p className="rounded-lg border border-brand/15 bg-mist px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}
        <div className="surface-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-brand">
                {selected.title}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {selected.status} · {selected.channel}
                {selected.campaign_tag ? ` · ${selected.campaign_tag}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-brand/20 px-3 py-2 text-sm"
                onClick={() => void createFollowUp(selected.id)}
              >
                Create follow-up
              </button>
              {selected.channel === "pr" ? (
                <button
                  type="button"
                  className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
                  onClick={() => void exportOutlook("bcc")}
                >
                  Download .eml
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
                  onClick={() => void exportHubSpot()}
                >
                  HubSpot export
                </button>
              )}
            </div>
          </div>
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Subject</dt>
              <dd>{selected.subject}</dd>
            </div>
            <div>
              <dt className="text-muted">From</dt>
              <dd>
                {selected.from_name} &lt;{selected.from_email}&gt;
              </dd>
            </div>
            <div>
              <dt className="text-muted">Recipients</dt>
              <dd>{recipients.length}</dd>
            </div>
            <div>
              <dt className="text-muted">Created by</dt>
              <dd>{selected.created_by || "—"}</dd>
            </div>
          </dl>
          <pre className="mt-6 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-mist p-4 text-sm">
            {first
              ? applyPitchMerge(selected.body, first)
              : plainTextFromHtml(selected.body)}
          </pre>
          {first?.email ? (
            <a
              className="mt-3 inline-block text-sm text-accent underline"
              href={mailtoHref(
                first.email,
                applyPitchMerge(selected.subject, first),
                applyPitchMerge(selected.body, first)
              )}
            >
              Open mailto (first recipient)
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-brand">Emails</h2>
          <p className="text-sm text-muted">
            PR pitches (Outlook) and marketing drafts (HubSpot). Shared contacts
            and lists.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => startNew("pr")}
            className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
          >
            New PR pitch
          </button>
          <button
            type="button"
            onClick={() => startNew("marketing")}
            className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand"
          >
            New marketing email
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Drafts", value: stats.drafts },
          { label: "Exported (Outlook)", value: stats.exported },
          { label: "Sent external (HubSpot)", value: stats.sentExternal },
          { label: "Updated (30 days)", value: stats.recent },
        ].map((s) => (
          <div key={s.label} className="surface-card px-4 py-3">
            <div className="font-display text-2xl text-brand">{s.value}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {content.filter(isNewsletter).length > 0 ? (
        <div className="surface-card space-y-3 p-4">
          <h3 className="font-display text-lg text-brand">
            Draft from newsletter
          </h3>
          <ul className="space-y-2">
            {content.filter(isNewsletter).slice(0, 6).map((n) => (
              <li
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="text-brand">{n.title}</span>
                <button
                  type="button"
                  className="rounded-lg border border-brand/20 px-3 py-1.5 text-brand"
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      channel: "marketing",
                      title: n.title,
                      subject: n.title,
                      content_id: n.id,
                      preview_text: plainTextFromHtml(n.caption || "").slice(
                        0,
                        140
                      ),
                      body: insertReleaseBlock(
                        f.body,
                        { title: n.title, caption: n.caption, id: n.id },
                        typeof window !== "undefined"
                          ? window.location.origin
                          : ""
                      ),
                    }));
                    setView("wizard");
                    setStep("write");
                  }}
                >
                  Draft email
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search emails…"
        selects={[
          {
            id: "channel",
            label: "Channel",
            value: channelFilter,
            onChange: (v) =>
              setChannelFilter(v as "all" | EmailChannel),
            options: [
              { value: "all", label: "All channels" },
              { value: "pr", label: "PR" },
              { value: "marketing", label: "Marketing" },
            ],
          },
          {
            id: "status",
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "all", label: "All statuses" },
              { value: "draft", label: "Draft" },
              { value: "exported", label: "Exported" },
              { value: "sent_external", label: "Sent external" },
              { value: "archived", label: "Archived" },
            ],
          },
        ]}
      />

      {message ? (
        <p className="rounded-lg border border-brand/15 bg-mist px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="No emails yet"
          description="Create a PR pitch for Outlook, or a marketing draft to export into HubSpot."
          action={
            <button
              type="button"
              className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
              onClick={() => startNew("pr")}
            >
              New PR pitch
            </button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => openDetail(p.id)}
                className="surface-card w-full px-4 py-3 text-left hover:border-accent"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    {p.campaign_tag ? (
                      <span className="text-xs text-muted">{p.campaign_tag}</span>
                    ) : null}
                    <div className="font-medium text-brand">{p.title}</div>
                    <div className="text-xs text-muted">
                      {p.subject} · {p.created_by || "Staff"}
                      {p.exported_at
                        ? ` · ${p.exported_at.slice(0, 10)}`
                        : ""}
                    </div>
                  </div>
                  <span className="rounded-full bg-mist px-2 py-0.5 text-xs text-brand">
                    {p.channel} · {p.status}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">
        Linked newsletter content:{" "}
        <Link href="/app/content" className="text-accent underline">
          Content &amp; Social
        </Link>
        . Open tracking is not available for Outlook exports.
      </p>
    </div>
  );
}
