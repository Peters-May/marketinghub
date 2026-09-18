"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  Contact,
  ContentItem,
  MediaList,
  NewsroomSettings,
  PrCoverage,
  PrMonitorMention,
  PrMonitorQuery,
  PrPitch,
} from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { useHubView } from "@/lib/hub-view";
import { cn } from "@/lib/utils";
import {
  applyPitchMerge,
  buildEml,
  downloadEmlBlob,
  isPressContact,
  mailtoHref,
} from "@/lib/pr/pitch-eml";
import { plainTextFromHtml } from "@/lib/plain-text";

export type PrSection =
  | "contacts"
  | "database"
  | "lists"
  | "releases"
  | "emails"
  | "pitches"
  | "coverage"
  | "monitor"
  | "monitoring"
  | "newsroom"
  | "reporting"
  | "statistics";

type TabId =
  | "contacts"
  | "lists"
  | "releases"
  | "pitches"
  | "coverage"
  | "monitor"
  | "newsroom"
  | "reporting"
  | "statistics";

const TABS: { id: TabId; label: string }[] = [
  { id: "contacts", label: "Press contacts" },
  { id: "lists", label: "Media lists" },
  { id: "releases", label: "Releases" },
  { id: "pitches", label: "Emails / pitches" },
  { id: "coverage", label: "Coverage" },
  { id: "monitor", label: "Monitoring" },
  { id: "newsroom", label: "Newsroom" },
  { id: "reporting", label: "Reporting" },
  { id: "statistics", label: "Statistics" },
];

function sectionToTab(section?: PrSection | null): TabId {
  switch (section) {
    case "database":
    case "contacts":
      return "contacts";
    case "lists":
      return "lists";
    case "releases":
      return "releases";
    case "emails":
    case "pitches":
      return "pitches";
    case "coverage":
      return "coverage";
    case "monitor":
    case "monitoring":
      return "monitor";
    case "newsroom":
      return "newsroom";
    case "reporting":
      return "reporting";
    case "statistics":
      return "statistics";
    default:
      return "contacts";
  }
}

type Props = {
  initialContacts: Contact[];
  initialLists: MediaList[];
  initialPitches: PrPitch[];
  initialCoverage: PrCoverage[];
  initialContent: ContentItem[];
  initialQueries: PrMonitorQuery[];
  initialMentions: PrMonitorMention[];
  initialNewsroom: NewsroomSettings;
  newsApiConfigured: boolean;
  initialSection?: PrSection | null;
};

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

export function PrClient({
  initialContacts,
  initialLists,
  initialPitches,
  initialCoverage,
  initialContent,
  initialQueries,
  initialMentions,
  initialNewsroom,
  newsApiConfigured: initialNewsApi,
  initialSection,
}: Props) {
  const { canToggleAdminView } = useHubView();
  const canDelete = canToggleAdminView;

  const [tab, setTab] = useState<TabId>(() => sectionToTab(initialSection));
  const [contacts, setContacts] = useState(initialContacts);
  const [lists, setLists] = useState(initialLists);
  const [pitches, setPitches] = useState(initialPitches);
  const [coverage, setCoverage] = useState(initialCoverage);
  const [content, setContent] = useState(initialContent);
  const [queries, setQueries] = useState(initialQueries);
  const [mentions, setMentions] = useState(initialMentions);
  const [newsroom, setNewsroom] = useState(initialNewsroom);
  const [newsApiConfigured, setNewsApiConfigured] = useState(initialNewsApi);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [newsroomForm, setNewsroomForm] = useState({
    title: initialNewsroom.title,
    language: initialNewsroom.language,
    homepage_greetings: initialNewsroom.homepage_greetings,
    description: initialNewsroom.description,
    seo_title: initialNewsroom.seo_title,
    seo_keywords: initialNewsroom.seo_keywords,
    seo_description: initialNewsroom.seo_description,
    theme_color: initialNewsroom.theme_color,
  });

  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    organisation: "",
    outlet: "",
    beat: "",
    country: "",
    role: "",
    preferred_topics: "",
  });
  const [csvText, setCsvText] = useState("");
  const [importListId, setImportListId] = useState("");

  const [listForm, setListForm] = useState({ name: "", description: "" });
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const [pitchForm, setPitchForm] = useState({
    title: "",
    subject: "Pitch from Peters & May",
    body: "Dear {{name}},\n\nI thought this might interest {{outlet}}.\n\nBest regards,\nMarketing\nPeters & May",
    media_list_id: "",
    content_id: "",
  });
  const [selectedPitchId, setSelectedPitchId] = useState<string | null>(null);

  const [clipForm, setClipForm] = useState({
    title: "",
    url: "",
    outlet: "",
    published_at: "",
    notes: "",
  });

  const [queryForm, setQueryForm] = useState({
    name: "",
    keywords: "Peters & May",
    exclusions: "",
  });

  const refreshAll = useCallback(async () => {
    const [c, l, p, cov, cont, mon, nr] = await Promise.all([
      fetch("/api/contacts").then((r) => r.json()),
      fetch("/api/pr/media-lists").then((r) => r.json()),
      fetch("/api/pr/pitches").then((r) => r.json()),
      fetch("/api/pr/coverage").then((r) => r.json()),
      fetch("/api/content").then((r) => r.json()),
      fetch("/api/pr/monitor").then((r) => r.json()),
      fetch("/api/pr/newsroom").then((r) => r.json()),
    ]);
    setContacts(c.contacts ?? []);
    setLists(l.media_lists ?? []);
    setPitches(p.pitches ?? []);
    setCoverage(cov.coverage ?? []);
    setContent(cont.content ?? cont.items ?? []);
    setQueries(mon.queries ?? []);
    setMentions(mon.mentions ?? []);
    setNewsApiConfigured(Boolean(mon.news_api_configured));
    if (nr.settings) {
      setNewsroom(nr.settings);
      setNewsroomForm({
        title: nr.settings.title,
        language: nr.settings.language,
        homepage_greetings: nr.settings.homepage_greetings,
        description: nr.settings.description,
        seo_title: nr.settings.seo_title,
        seo_keywords: nr.settings.seo_keywords,
        seo_description: nr.settings.seo_description,
        theme_color: nr.settings.theme_color,
      });
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const pressContacts = useMemo(
    () => contacts.filter(isPressContact),
    [contacts]
  );

  const filteredPress = useMemo(() => {
    return pressContacts.filter((c) =>
      matchesSearch(search, [
        c.name,
        c.organisation,
        c.outlet,
        c.beat,
        c.country,
        c.email,
        c.role,
        c.preferred_topics,
        c.tags.join(" "),
      ])
    );
  }, [pressContacts, search]);

  const releases = useMemo(
    () => content.filter(isPressRelease),
    [content]
  );

  const selectedList = lists.find((l) => l.id === selectedListId) ?? null;
  const selectedPitch = pitches.find((p) => p.id === selectedPitchId) ?? null;

  const contactById = useMemo(() => {
    const m = new Map(contacts.map((c) => [c.id, c]));
    return m;
  }, [contacts]);

  async function createPressContact() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contactForm,
          is_press: true,
          tags: ["Press"],
          kind: "person",
        }),
      });
      if (!res.ok) throw new Error("Could not create contact");
      setContactForm({
        name: "",
        email: "",
        organisation: "",
        outlet: "",
        beat: "",
        country: "",
        role: "",
        preferred_topics: "",
      });
      await refreshAll();
      setMessage("Press contact added.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function importCsv() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/pr/import-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: csvText,
          media_list_id: importListId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setCsvText("");
      await refreshAll();
      setMessage(
        `Import: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped.`
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function createList() {
    setBusy(true);
    try {
      const res = await fetch("/api/pr/media-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listForm),
      });
      if (!res.ok) throw new Error("Could not create list");
      setListForm({ name: "", description: "" });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function toggleListMember(listId: string, contactId: string) {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    const has = list.contact_ids.includes(contactId);
    const contact_ids = has
      ? list.contact_ids.filter((id) => id !== contactId)
      : [...list.contact_ids, contactId];
    await fetch("/api/pr/media-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: listId,
        patch: { contact_ids },
      }),
    });
    await refreshAll();
  }

  async function createPitch() {
    setBusy(true);
    try {
      const res = await fetch("/api/pr/pitches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...pitchForm,
          media_list_id: pitchForm.media_list_id || null,
          content_id: pitchForm.content_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create pitch");
      setSelectedPitchId(data.item?.id ?? null);
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  function resolvePitchRecipients(pitch: PrPitch): Contact[] {
    const ids = new Set(pitch.recipient_ids);
    if (pitch.media_list_id) {
      const list = lists.find((l) => l.id === pitch.media_list_id);
      list?.contact_ids.forEach((id) => ids.add(id));
    }
    return Array.from(ids)
      .map((id) => contactById.get(id))
      .filter((c): c is Contact => Boolean(c));
  }

  async function exportPitchOutlook(mode: "bcc" | "per_contact") {
    if (!selectedPitch) return;
    const recipients = resolvePitchRecipients(selectedPitch);
    if (!recipients.length) {
      setMessage("Add recipients via a media list first.");
      return;
    }

    if (mode === "bcc") {
      const emails = recipients.map((c) => c.email).filter(Boolean);
      const first = recipients[0];
      const subject = applyPitchMerge(selectedPitch.subject, first);
      const body = applyPitchMerge(selectedPitch.body, first);
      const eml = buildEml({
        to: [],
        bcc: emails,
        subject,
        body,
      });
      downloadEmlBlob(selectedPitch.title || "pitch", eml);
    } else {
      for (const c of recipients) {
        if (!c.email) continue;
        const subject = applyPitchMerge(selectedPitch.subject, c);
        const body = applyPitchMerge(selectedPitch.body, c);
        const eml = buildEml({
          to: [c.email],
          subject,
          body,
        });
        downloadEmlBlob(`${selectedPitch.title}-${c.name}`, eml);
      }
    }

    await fetch("/api/pr/pitches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_exported", id: selectedPitch.id }),
    });
    await refreshAll();
    setMessage("Downloaded .eml for Outlook. Open the file to send.");
  }

  async function createClip() {
    setBusy(true);
    try {
      await fetch("/api/pr/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...clipForm,
          published_at: clipForm.published_at || null,
        }),
      });
      setClipForm({
        title: "",
        url: "",
        outlet: "",
        published_at: "",
        notes: "",
      });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function createQuery() {
    setBusy(true);
    try {
      await fetch("/api/pr/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_query", ...queryForm }),
      });
      setQueryForm({ name: "", keywords: "Peters & May", exclusions: "" });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function runQuery(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/pr/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_query", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run failed");
      await refreshAll();
      if (!data.news_api_configured) {
        setMessage(
          "No NEWS_API_KEY configured — add it to env to fetch live mentions. Coverage can still be logged manually."
        );
      } else {
        setMessage(`Added ${data.added} new mention(s).`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  async function promoteMention(id: string) {
    await fetch("/api/pr/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "promote_mention", id }),
    });
    await refreshAll();
    setTab("coverage");
  }

  async function dismissMention(id: string) {
    await fetch("/api/pr/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss_mention", id }),
    });
    await refreshAll();
  }

  async function saveNewsroom() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/pr/newsroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch: newsroomForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save newsroom");
      setNewsroom(data.settings);
      setMessage("Newsroom settings saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="PR"
        description="Press contacts, media lists, releases, Outlook pitches, coverage, and monitoring."
        actions={
          <>
            <Link
              href="/app/pr"
              className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand hover:bg-mist"
            >
              PR home
            </Link>
            <Link
              href="/newsroom"
              target="_blank"
              className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand hover:bg-mist"
            >
              Open newsroom
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setSearch("");
              setMessage("");
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              tab === t.id
                ? "bg-brand text-white"
                : "bg-mist text-brand hover:bg-accent-soft"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message ? (
        <p className="mb-4 rounded-lg border border-brand/15 bg-mist px-3 py-2 text-sm text-brand">
          {message}
        </p>
      ) : null}

      {tab === "contacts" ? (
        <div className="space-y-6">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search press contacts…"
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="surface-card space-y-3 p-4">
              <h2 className="font-display text-lg text-brand">Add press contact</h2>
              {(
                [
                  ["name", "Name"],
                  ["email", "Email"],
                  ["organisation", "Organisation"],
                  ["outlet", "Outlet"],
                  ["beat", "Beat"],
                  ["country", "Country"],
                  ["role", "Role"],
                  ["preferred_topics", "Preferred topics"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="text-muted">{label}</span>
                  <input
                    className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                    value={contactForm[key]}
                    onChange={(e) =>
                      setContactForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <button
                type="button"
                disabled={busy || !contactForm.name.trim()}
                onClick={() => void createPressContact()}
                className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Save contact
              </button>
            </div>
            <div className="surface-card space-y-3 p-4">
              <h2 className="font-display text-lg text-brand">
                Import journalist CSV
              </h2>
              <p className="text-sm text-muted">
                Paste CSV/TSV with columns such as name, email, outlet, beat,
                country. Contacts are tagged Press and flagged as press.
              </p>
              <textarea
                className="h-40 w-full rounded-md border border-brand/15 px-3 py-2 font-mono text-xs"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="name,email,outlet,beat,country"
              />
              <label className="block text-sm">
                <span className="text-muted">Add to media list (optional)</span>
                <select
                  className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                  value={importListId}
                  onChange={(e) => setImportListId(e.target.value)}
                >
                  <option value="">—</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !csvText.trim()}
                onClick={() => void importCsv()}
                className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Import
              </button>
            </div>
          </div>
          {filteredPress.length === 0 ? (
            <EmptyState
              title="No press contacts yet"
              description="Add contacts or import a CSV from a purchased journalist list."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-brand/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-mist text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Outlet</th>
                    <th className="px-3 py-2 font-medium">Beat</th>
                    <th className="px-3 py-2 font-medium">Country</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPress.map((c) => (
                    <tr key={c.id} className="border-t border-brand/10">
                      <td className="px-3 py-2">{c.name}</td>
                      <td className="px-3 py-2">
                        {c.outlet || c.organisation}
                      </td>
                      <td className="px-3 py-2">{c.beat}</td>
                      <td className="px-3 py-2">{c.country}</td>
                      <td className="px-3 py-2">
                        {c.email ? (
                          <a
                            className="text-accent underline"
                            href={`mailto:${c.email}`}
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
            </div>
          )}
        </div>
      ) : null}

      {tab === "lists" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="surface-card space-y-3 p-4">
              <h2 className="font-display text-lg text-brand">New media list</h2>
              <input
                className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                placeholder="List name"
                value={listForm.name}
                onChange={(e) =>
                  setListForm((f) => ({ ...f, name: e.target.value }))
                }
              />
              <textarea
                className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                placeholder="Description"
                value={listForm.description}
                onChange={(e) =>
                  setListForm((f) => ({ ...f, description: e.target.value }))
                }
              />
              <button
                type="button"
                disabled={busy || !listForm.name.trim()}
                onClick={() => void createList()}
                className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Create list
              </button>
            </div>
            <ul className="space-y-2">
              {lists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedListId(l.id)}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3 text-left",
                      selectedListId === l.id
                        ? "border-accent bg-accent-soft"
                        : "border-brand/10 bg-white hover:border-brand/25"
                    )}
                  >
                    <div className="font-medium text-brand">{l.name}</div>
                    <div className="text-xs text-muted">
                      {l.contact_ids.length} contact
                      {l.contact_ids.length === 1 ? "" : "s"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="surface-card p-4">
            {selectedList ? (
              <>
                <h2 className="font-display text-lg text-brand">
                  {selectedList.name}
                </h2>
                <p className="mb-4 text-sm text-muted">
                  {selectedList.description || "Toggle press contacts on this list."}
                </p>
                <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
                  {pressContacts.map((c) => {
                    const on = selectedList.contact_ids.includes(c.id);
                    return (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-2 border-b border-brand/5 py-2 text-sm"
                      >
                        <span>
                          {c.name}
                          <span className="text-muted">
                            {" "}
                            — {c.outlet || c.organisation}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void toggleListMember(selectedList.id, c.id)
                          }
                          className={cn(
                            "rounded px-2 py-1 text-xs",
                            on
                              ? "bg-brand text-white"
                              : "bg-mist text-brand"
                          )}
                        >
                          {on ? "On list" : "Add"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {canDelete ? (
                  <button
                    type="button"
                    className="mt-4 text-sm text-muted underline"
                    onClick={async () => {
                      await fetch("/api/pr/media-lists", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "delete",
                          id: selectedList.id,
                        }),
                      });
                      setSelectedListId(null);
                      await refreshAll();
                    }}
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
      ) : null}

      {tab === "releases" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Press releases live in{" "}
            <Link href="/app/content" className="text-accent underline">
              Content & Social
            </Link>{" "}
            (type PR / category Press release). Published items appear on the{" "}
            <Link href="/newsroom" className="text-accent underline">
              public newsroom
            </Link>
            .
          </p>
          {releases.length === 0 ? (
            <EmptyState
              title="No PR releases"
              description="Create a content item with type PR or category Press release."
              action={
                <Link
                  href="/app/content"
                  className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
                >
                  Open Content
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2">
              {releases.map((r) => (
                <li
                  key={r.id}
                  className="surface-card flex flex-wrap items-center justify-between gap-2 p-4"
                >
                  <div>
                    <div className="font-medium text-brand">{r.title}</div>
                    <div className="text-xs text-muted">
                      {r.status} · {r.category || r.content_type}
                    </div>
                  </div>
                  <Link
                    href="/app/content"
                    className="text-sm text-accent underline"
                  >
                    Edit in Content
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "pitches" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="surface-card space-y-3 p-4">
            <h2 className="font-display text-lg text-brand">New pitch</h2>
            <p className="text-xs text-muted">
              Merge fields: {"{{name}}"}, {"{{outlet}}"}, {"{{organisation}}"},{" "}
              {"{{email}}"}, {"{{beat}}"}, {"{{country}}"}. Download .eml and
              open in Outlook to send — Hub does not send mail.
            </p>
            <input
              className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
              placeholder="Internal title"
              value={pitchForm.title}
              onChange={(e) =>
                setPitchForm((f) => ({ ...f, title: e.target.value }))
              }
            />
            <input
              className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
              placeholder="Email subject"
              value={pitchForm.subject}
              onChange={(e) =>
                setPitchForm((f) => ({ ...f, subject: e.target.value }))
              }
            />
            <textarea
              className="h-40 w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
              value={pitchForm.body}
              onChange={(e) =>
                setPitchForm((f) => ({ ...f, body: e.target.value }))
              }
            />
            <label className="block text-sm">
              <span className="text-muted">Media list</span>
              <select
                className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                value={pitchForm.media_list_id}
                onChange={(e) =>
                  setPitchForm((f) => ({
                    ...f,
                    media_list_id: e.target.value,
                  }))
                }
              >
                <option value="">—</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted">Linked release (optional)</span>
              <select
                className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                value={pitchForm.content_id}
                onChange={(e) =>
                  setPitchForm((f) => ({ ...f, content_id: e.target.value }))
                }
              >
                <option value="">—</option>
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !pitchForm.title.trim()}
              onClick={() => void createPitch()}
              className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Save pitch
            </button>
          </div>
          <div className="space-y-3">
            <ul className="space-y-2">
              {pitches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPitchId(p.id)}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3 text-left",
                      selectedPitchId === p.id
                        ? "border-accent bg-accent-soft"
                        : "border-brand/10 bg-white"
                    )}
                  >
                    <div className="font-medium text-brand">{p.title}</div>
                    <div className="text-xs text-muted">
                      {p.status}
                      {p.exported_at
                        ? ` · exported ${p.exported_at.slice(0, 10)}`
                        : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {selectedPitch ? (
              <div className="surface-card space-y-3 p-4">
                <h3 className="font-display text-lg text-brand">
                  {selectedPitch.title}
                </h3>
                <p className="text-sm text-muted">{selectedPitch.subject}</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-mist p-3 text-xs">
                  {plainTextFromHtml(selectedPitch.body)}
                </pre>
                <p className="text-xs text-muted">
                  Recipients: {resolvePitchRecipients(selectedPitch).length}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void exportPitchOutlook("bcc")}
                    className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
                  >
                    Download .eml (BCC all)
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportPitchOutlook("per_contact")}
                    className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand"
                  >
                    Download one .eml each
                  </button>
                  {(() => {
                    const first = resolvePitchRecipients(selectedPitch)[0];
                    if (!first?.email) return null;
                    return (
                      <a
                        className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand"
                        href={mailtoHref(
                          first.email,
                          applyPitchMerge(selectedPitch.subject, first),
                          applyPitchMerge(selectedPitch.body, first)
                        )}
                      >
                        Open mailto (first)
                      </a>
                    );
                  })()}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "coverage" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="surface-card space-y-3 p-4">
            <h2 className="font-display text-lg text-brand">Log coverage</h2>
            {(
              [
                ["title", "Title"],
                ["url", "URL"],
                ["outlet", "Outlet"],
                ["published_at", "Published date"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="text-muted">{label}</span>
                <input
                  type={key === "published_at" ? "date" : "text"}
                  className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                  value={clipForm[key]}
                  onChange={(e) =>
                    setClipForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <textarea
              className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
              placeholder="Notes"
              value={clipForm.notes}
              onChange={(e) =>
                setClipForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
            <button
              type="button"
              disabled={busy || !clipForm.title.trim()}
              onClick={() => void createClip()}
              className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Save clip
            </button>
          </div>
          <ul className="space-y-2">
            {coverage.length === 0 ? (
              <EmptyState
                title="No coverage yet"
                description="Log clippings manually or promote items from Monitoring."
              />
            ) : (
              coverage.map((c) => (
                <li key={c.id} className="surface-card p-4 text-sm">
                  <div className="font-medium text-brand">{c.title}</div>
                  <div className="text-muted">
                    {c.outlet}
                    {c.published_at ? ` · ${c.published_at.slice(0, 10)}` : ""}
                  </div>
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline"
                    >
                      Open article
                    </a>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {tab === "monitor" ? (
        <div className="space-y-6">
          {!newsApiConfigured ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-brand">
              Set <code className="font-mono">NEWS_API_KEY</code> in the
              environment to fetch live news. Until then, use Coverage to log
              clips by hand.
            </p>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="surface-card space-y-3 p-4">
              <h2 className="font-display text-lg text-brand">New query</h2>
              <input
                className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                placeholder="Name"
                value={queryForm.name}
                onChange={(e) =>
                  setQueryForm((f) => ({ ...f, name: e.target.value }))
                }
              />
              <textarea
                className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                placeholder="Keywords (comma-separated)"
                value={queryForm.keywords}
                onChange={(e) =>
                  setQueryForm((f) => ({ ...f, keywords: e.target.value }))
                }
              />
              <textarea
                className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                placeholder="Exclusions (optional)"
                value={queryForm.exclusions}
                onChange={(e) =>
                  setQueryForm((f) => ({ ...f, exclusions: e.target.value }))
                }
              />
              <button
                type="button"
                disabled={busy || !queryForm.name.trim()}
                onClick={() => void createQuery()}
                className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Save query
              </button>
            </div>
            <ul className="space-y-2">
              {queries.map((q) => (
                <li
                  key={q.id}
                  className="surface-card flex flex-wrap items-center justify-between gap-2 p-4"
                >
                  <div>
                    <div className="font-medium text-brand">{q.name}</div>
                    <div className="text-xs text-muted">{q.keywords}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runQuery(q.id)}
                    className="rounded-lg bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Run now
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 font-display text-lg text-brand">Inbox</h2>
            <ul className="space-y-2">
              {mentions.filter((m) => m.status === "new").length === 0 ? (
                <p className="text-sm text-muted">No new mentions.</p>
              ) : (
                mentions
                  .filter((m) => m.status === "new")
                  .map((m) => (
                    <li
                      key={m.id}
                      className="surface-card flex flex-wrap items-start justify-between gap-3 p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-brand">{m.title}</div>
                        <div className="text-xs text-muted">
                          {m.outlet}
                          {m.published_at
                            ? ` · ${m.published_at.slice(0, 10)}`
                            : ""}
                        </div>
                        {m.snippet ? (
                          <p className="mt-1 text-sm text-muted">{m.snippet}</p>
                        ) : null}
                        {m.url ? (
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-accent underline"
                          >
                            View
                          </a>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void promoteMention(m.id)}
                          className="rounded-lg bg-brand px-2 py-1 text-xs text-white"
                        >
                          Promote
                        </button>
                        <button
                          type="button"
                          onClick={() => void dismissMention(m.id)}
                          className="rounded-lg bg-mist px-2 py-1 text-xs text-brand"
                        >
                          Dismiss
                        </button>
                      </div>
                    </li>
                  ))
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "newsroom" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="surface-card space-y-4 p-5">
            <div>
              <h2 className="font-display text-xl text-brand">
                Newsroom&apos;s information
              </h2>
              <p className="mt-1 text-sm text-muted">
                Change your newsroom title to describe its purpose. Select the
                interface language, add a description and a home page welcome
                message.
              </p>
            </div>
            <label className="block text-sm">
              <span className="text-muted">
                Newsroom title (required) · {newsroomForm.title.length}/150
              </span>
              <input
                className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                maxLength={150}
                value={newsroomForm.title}
                onChange={(e) =>
                  setNewsroomForm((f) => ({ ...f, title: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Language</span>
              <select
                className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                value={newsroomForm.language}
                onChange={(e) =>
                  setNewsroomForm((f) => ({
                    ...f,
                    language: e.target.value === "pl" ? "pl" : "en",
                  }))
                }
              >
                <option value="en">English</option>
                <option value="pl">Polish</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted">Homepage greetings</span>
              <textarea
                className="mt-1 h-28 w-full rounded-md border border-brand/15 px-3 py-2"
                value={newsroomForm.homepage_greetings}
                onChange={(e) =>
                  setNewsroomForm((f) => ({
                    ...f,
                    homepage_greetings: e.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">About / description</span>
              <textarea
                className="mt-1 h-28 w-full rounded-md border border-brand/15 px-3 py-2"
                value={newsroomForm.description}
                onChange={(e) =>
                  setNewsroomForm((f) => ({
                    ...f,
                    description: e.target.value,
                  }))
                }
              />
            </label>
            <button
              type="button"
              disabled={busy || !newsroomForm.title.trim()}
              onClick={() => void saveNewsroom()}
              className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Save newsroom information
            </button>
          </div>
          <div className="space-y-4">
            <div className="surface-card space-y-3 p-5">
              <h2 className="font-display text-lg text-brand">SEO &amp; Analytics</h2>
              <label className="block text-sm">
                <span className="text-muted">SEO title</span>
                <input
                  className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                  value={newsroomForm.seo_title}
                  onChange={(e) =>
                    setNewsroomForm((f) => ({ ...f, seo_title: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted">SEO keywords</span>
                <input
                  className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                  value={newsroomForm.seo_keywords}
                  onChange={(e) =>
                    setNewsroomForm((f) => ({
                      ...f,
                      seo_keywords: e.target.value,
                    }))
                  }
                />
                <span className="mt-1 block text-xs text-muted">
                  Separate keywords with commas.
                </span>
              </label>
              <label className="block text-sm">
                <span className="text-muted">
                  Description for search engines ·{" "}
                  {newsroomForm.seo_description.length}/150
                </span>
                <textarea
                  className="mt-1 h-24 w-full rounded-md border border-brand/15 px-3 py-2"
                  maxLength={150}
                  value={newsroomForm.seo_description}
                  onChange={(e) =>
                    setNewsroomForm((f) => ({
                      ...f,
                      seo_description: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted">Theme colour</span>
                <input
                  type="color"
                  className="mt-1 h-10 w-20 cursor-pointer rounded border border-brand/15"
                  value={newsroomForm.theme_color || "#007DC5"}
                  onChange={(e) =>
                    setNewsroomForm((f) => ({
                      ...f,
                      theme_color: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="surface-card p-5 text-sm text-muted">
              <p>
                Public page:{" "}
                <Link href="/newsroom" className="text-accent underline" target="_blank">
                  /newsroom
                </Link>
              </p>
              <p className="mt-2">
                Current title: <strong className="text-brand">{newsroom.title}</strong>
              </p>
              <p className="mt-1">
                Published releases on the site:{" "}
                {releases.filter((r) => r.status === "published").length}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "reporting" ? (
        <EmptyState
          title="Reporting — coming soon"
          description="Interactive coverage reports (clips, pitch activity, share of voice) will land here after enough coverage data is logged. Use Coverage and Monitoring for now."
          action={
            <button
              type="button"
              className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
              onClick={() => setTab("coverage")}
            >
              Open coverage
            </button>
          }
        />
      ) : null}

      {tab === "statistics" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Lightweight overview of Hub PR activity. Open/click tracking for
            Outlook pitches is not available yet.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Press contacts", value: pressContacts.length },
              { label: "Media lists", value: lists.length },
              { label: "Pitch drafts", value: pitches.length },
              { label: "Coverage clips", value: coverage.length },
              {
                label: "Published releases",
                value: releases.filter((r) => r.status === "published").length,
              },
              {
                label: "Monitor queries",
                value: queries.length,
              },
              {
                label: "New mentions",
                value: mentions.filter((m) => m.status === "new").length,
              },
              {
                label: "Exported pitches",
                value: pitches.filter((p) => p.status === "exported").length,
              },
            ].map((s) => (
              <div key={s.label} className="surface-card px-4 py-3">
                <div className="font-display text-2xl text-brand">{s.value}</div>
                <div className="text-xs text-muted">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
