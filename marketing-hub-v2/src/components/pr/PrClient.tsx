"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  Contact,
  ContentItem,
  EmailCampaign,
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
import { mentionsToCsv } from "@/lib/pr/mentions-csv";
import { mentionMatchNote } from "@/lib/pr/mention-match";
import { HighlightedKeywords } from "@/components/pr/HighlightedKeywords";
import { downloadTextFile, isPressContact } from "@/lib/pr/pitch-eml";
import { isContactSegment } from "@/lib/contacts/segments";
import { EmailsClient } from "@/components/pr/emails/EmailsClient";
import { PitchesPanel } from "@/components/pr/PitchesPanel";
import { isPitchTabCampaign } from "@/lib/email/category";
import { ReleasesPanel } from "@/components/pr/ReleasesPanel";

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
  | "newsroom";

type TabId =
  | "contacts"
  | "lists"
  | "releases"
  | "pitches"
  | "coverage"
  | "monitor"
  | "newsroom";

const TABS: { id: TabId; label: string }[] = [
  { id: "contacts", label: "Press contacts" },
  { id: "lists", label: "Media lists" },
  { id: "releases", label: "Releases" },
  { id: "pitches", label: "Pitches" },
  { id: "coverage", label: "Coverage" },
  { id: "monitor", label: "Monitoring" },
  { id: "newsroom", label: "Newsroom" },
];

const TAB_PATH: Record<TabId, string> = {
  contacts: "/app/pr/contacts",
  lists: "/app/pr/lists",
  releases: "/app/pr/releases",
  pitches: "/app/pr/pitches",
  coverage: "/app/pr/coverage",
  monitor: "/app/pr/monitoring",
  newsroom: "/app/pr/newsroom",
};

function tabFromPathname(pathname: string): TabId | null {
  const match = (Object.entries(TAB_PATH) as [TabId, string][]).find(
    ([, href]) => pathname === href
  );
  return match?.[0] ?? null;
}

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
  initialCampaigns: EmailCampaign[];
  initialQueries: PrMonitorQuery[];
  initialMentions: PrMonitorMention[];
  initialNewsroom: NewsroomSettings;
  newsApiConfigured: boolean;
  suppressedEmails?: string[];
  initialSection?: PrSection | null;
  prefillContentId?: string | null;
  openNewRelease?: boolean;
};

function exportMentionsCsv(
  rows: PrMonitorMention[],
  queries: PrMonitorQuery[]
) {
  const day = new Date().toISOString().slice(0, 10);
  downloadTextFile(
    `mentions-${day}.csv`,
    `\uFEFF${mentionsToCsv(rows, queries)}`,
    "text/csv;charset=utf-8"
  );
}

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
  initialCampaigns,
  initialQueries,
  initialMentions,
  initialNewsroom,
  newsApiConfigured: initialNewsApi,
  suppressedEmails = [],
  initialSection,
  prefillContentId = null,
  openNewRelease = false,
}: Props) {
  const { canToggleAdminView } = useHubView();
  const canDelete = canToggleAdminView;

  const [tab, setTab] = useState<TabId>(() => sectionToTab(initialSection));
  const [contacts, setContacts] = useState(initialContacts);
  const [lists, setLists] = useState(initialLists);
  const [pitches, setPitches] = useState(initialPitches);
  const [coverage, setCoverage] = useState(initialCoverage);
  const [content, setContent] = useState(initialContent);
  const [campaigns, setCampaigns] = useState(initialCampaigns);
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
  const newsroomDirty = useRef(false);
  const listsRef = useRef(lists);
  const memberDraft = useRef(new Map<string, string[]>());
  const memberChain = useRef(Promise.resolve());
  listsRef.current = lists;

  function touchNewsroom(
    updater: (current: typeof newsroomForm) => typeof newsroomForm
  ) {
    newsroomDirty.current = true;
    setNewsroomForm(updater);
  }

  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    organisation: "",
    outlet: "",
    beat: "",
    country: "",
    role: "",
    preferred_topics: "",
    marketing_consent: false,
  });
  const [csvText, setCsvText] = useState("");
  const [importListId, setImportListId] = useState("");

  const [listForm, setListForm] = useState({
    name: "",
    description: "",
  });
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listMemberSearch, setListMemberSearch] = useState("");

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
    try {
      const responses = await Promise.all([
        fetch("/api/contacts"),
        fetch("/api/pr/media-lists"),
        fetch("/api/pr/pitches"),
        fetch("/api/pr/coverage"),
        fetch("/api/content"),
        fetch("/api/pr/monitor"),
        fetch("/api/pr/newsroom"),
      ]);
      if (responses.some((res) => !res.ok)) {
        throw new Error("Could not refresh");
      }
      const [c, l, p, cov, cont, mon, nr] = await Promise.all(
        responses.map((res) => res.json())
      );
      if (!Array.isArray(c.contacts) || !Array.isArray(l.media_lists)) {
        throw new Error("Could not refresh");
      }
      setContacts(c.contacts);
      setLists(l.media_lists);
      listsRef.current = l.media_lists;
      memberDraft.current.clear();
      setPitches(p.pitches ?? []);
      setCoverage(cov.coverage ?? []);
      setContent(cont.content ?? cont.items ?? []);
      setQueries(Array.isArray(mon.queries) ? mon.queries : []);
      setMentions(Array.isArray(mon.mentions) ? mon.mentions : []);
      setNewsApiConfigured(Boolean(mon.news_api_configured));
      if (nr.settings) {
        setNewsroom(nr.settings);
        if (!newsroomDirty.current) {
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
      }
    } catch {
      setMessage("Could not refresh. The lists on screen are unchanged.");
    }
  }, []);

  useEffect(() => {
    setTab(sectionToTab(initialSection));
  }, [initialSection]);

  useEffect(() => {
    const onPop = () => {
      const next = tabFromPathname(window.location.pathname);
      if (!next) return;
      setTab(next);
      setSearch("");
      setMessage("");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const contactLists = useMemo(
    () => lists.filter(isContactSegment),
    [lists]
  );

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

  const publishedReleaseCount = useMemo(
    () => releases.filter((item) => item.status === "published").length,
    [releases]
  );

  function openTab(next: TabId) {
    setTab(next);
    setSearch("");
    setMessage("");
    const href = TAB_PATH[next];
    if (window.location.pathname !== href) {
      window.history.pushState({ prTab: next }, "", href);
    }
  }

  const spokespeople = useMemo(
    () =>
      contacts
        .filter((contact) => contact.is_spokesperson && !isPressContact(contact))
        .map((contact) => ({
          id: contact.id,
          name: contact.name,
          role: contact.role,
          organisation: contact.organisation,
          email: contact.email,
          phone: contact.phone,
        })),
    [contacts]
  );

  const selectedList = contactLists.find((l) => l.id === selectedListId) ?? null;

  const listMembers = useMemo(() => {
    if (!selectedList) return [];
    const onList = new Set(selectedList.contact_ids);
    const query = listMemberSearch.trim();
    const pool = query
      ? contacts.filter((contact) =>
          matchesSearch(query, [
            contact.name,
            contact.email,
            contact.organisation,
            contact.outlet,
            contact.role,
          ])
        )
      : contacts.filter((contact) => onList.has(contact.id));
    return pool.slice(0, 80);
  }, [contacts, listMemberSearch, selectedList]);

  async function createPressContact() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contactForm,
          marketing_consent: contactForm.marketing_consent ? true : null,
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
        marketing_consent: false,
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
        body: JSON.stringify({
          ...listForm,
          list_kind: "press",
          source: "contacts",
        }),
      });
      if (!res.ok) throw new Error("Could not create list");
      setListForm({ name: "", description: "" });
      await refreshAll();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not create list");
    } finally {
      setBusy(false);
    }
  }

  async function toggleListMember(listId: string, contactId: string) {
    const list = listsRef.current.find((l) => l.id === listId);
    if (!list) return;
    const base = memberDraft.current.get(listId) ?? list.contact_ids;
    const contact_ids = base.includes(contactId)
      ? base.filter((id) => id !== contactId)
      : [...base, contactId];
    memberDraft.current.set(listId, contact_ids);
    const nextLists = listsRef.current.map((row) =>
      row.id === listId ? { ...row, contact_ids } : row
    );
    listsRef.current = nextLists;
    setLists(nextLists);
    memberChain.current = memberChain.current.then(async () => {
      const ids = memberDraft.current.get(listId);
      if (!ids) return;
      const res = await fetch("/api/pr/media-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: listId,
          patch: { contact_ids: ids },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error || "Could not update the media list");
      }
    });
    await memberChain.current;
  }

  async function createClip() {
    setBusy(true);
    try {
      const res = await fetch("/api/pr/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...clipForm,
          published_at: clipForm.published_at || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not log the clip");
      setClipForm({
        title: "",
        url: "",
        outlet: "",
        published_at: "",
        notes: "",
      });
      await refreshAll();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not log the clip");
    } finally {
      setBusy(false);
    }
  }

  async function createQuery() {
    setBusy(true);
    try {
      const res = await fetch("/api/pr/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_query", ...queryForm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the search");
      setQueryForm({ name: "", keywords: "Peters & May", exclusions: "" });
      await refreshAll();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save the search");
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
    const res = await fetch("/api/pr/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "promote_mention", id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Could not log that mention as coverage");
      return;
    }
    await refreshAll();
    openTab("coverage");
  }

  async function dismissMention(id: string) {
    const res = await fetch("/api/pr/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss_mention", id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Could not dismiss that mention");
      return;
    }
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
      newsroomDirty.current = false;
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
        description="Press contacts, media lists, releases, pitches, coverage, and monitoring."
        actions={
          <Link
            href="/newsroom"
            target="_blank"
            className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand hover:bg-mist"
          >
            Open newsroom
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Press contacts", value: pressContacts.length },
          { label: "Media lists", value: contactLists.length },
          { label: "Published releases", value: publishedReleaseCount },
          { label: "Coverage clips", value: coverage.length },
        ].map((stat) => (
          <div key={stat.label} className="surface-card px-4 py-3">
            <div className="text-2xl font-display text-brand">{stat.value}</div>
            <div className="text-xs text-muted">{stat.label}</div>
          </div>
        ))}
      </div>

      <nav aria-label="PR sections" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => openTab(t.id)}
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
      </nav>

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
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={contactForm.marketing_consent}
                  onChange={(e) =>
                    setContactForm((f) => ({
                      ...f,
                      marketing_consent: e.target.checked,
                    }))
                  }
                />
                <span className="text-muted">
                  Marketing email consent (for marketing lists)
                </span>
              </label>
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
                aria-label="Journalist CSV"
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
                  {contactLists.map((l) => (
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
              <p className="text-sm text-muted">
                Members come from Contacts. Portal lists are not used here.
                You can also manage these lists under Contacts.
              </p>
              <input
                className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                aria-label="List name"
                placeholder="List name"
                value={listForm.name}
                onChange={(e) =>
                  setListForm((f) => ({ ...f, name: e.target.value }))
                }
              />
              <textarea
                className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                aria-label="List description"
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
              <Link
                href="/app/contacts?view=lists"
                className="inline-block text-sm text-accent underline"
              >
                Open lists in Contacts
              </Link>
            </div>
            <ul className="space-y-2">
              {contactLists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedListId(l.id);
                      setListMemberSearch("");
                    }}
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
                <p className="mb-3 text-sm text-muted">
                  {selectedList.description ||
                    "Search contacts to add them. An empty search shows who is already on the list."}
                </p>
                <input
                  className="mb-3 w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                  aria-label="Search contacts to add"
                  placeholder="Search contacts to add…"
                  value={listMemberSearch}
                  onChange={(e) => setListMemberSearch(e.target.value)}
                />
                {listMembers.length === 0 ? (
                  <p className="text-sm text-muted">
                    {listMemberSearch.trim()
                      ? "No contacts match that search."
                      : "This list is empty. Search for a contact to add them."}
                  </p>
                ) : (
                <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
                  {listMembers.map((c) => {
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
                            — {c.organisation || c.outlet || c.email || "No email"}
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
                )}
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
        <ReleasesPanel
          releases={releases}
          campaigns={campaigns}
          newsroomTitle={newsroom.title}
          newsroomDescription={newsroom.description}
          spokespeople={spokespeople}
          startNew={openNewRelease}
          onRelease={(item) =>
            setContent((prev) => {
              const without = prev.filter((c) => c.id !== item.id);
              if (item.pin_homepage) {
                return [
                  item,
                  ...without.map((c) =>
                    c.id === item.id ? c : { ...c, pin_homepage: false }
                  ),
                ];
              }
              return [item, ...without];
            })
          }
        />
      ) : null}

      {tab === "pitches" ? (
        <div className="space-y-10">
          <PitchesPanel
            campaigns={campaigns}
            content={content}
            match={isPitchTabCampaign}
            onCampaign={(item) =>
              setCampaigns((prev) => [item, ...prev.filter((c) => c.id !== item.id)])
            }
          />
          {pitches.length > 0 ? (
            <EmailsClient
              legacy
              initialPitches={pitches}
              initialLists={lists}
              initialContacts={contacts}
              initialContent={content}
              prefillContentId={prefillContentId}
              suppressedEmails={suppressedEmails}
              onListsChanged={() => void refreshAll()}
            />
          ) : null}
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
              aria-label="Coverage notes"
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
                aria-label="Search name"
                placeholder="Name"
                value={queryForm.name}
                onChange={(e) =>
                  setQueryForm((f) => ({ ...f, name: e.target.value }))
                }
              />
              <textarea
                className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                aria-label="Keywords"
                placeholder="Keywords (comma-separated)"
                value={queryForm.keywords}
                onChange={(e) =>
                  setQueryForm((f) => ({ ...f, keywords: e.target.value }))
                }
              />
              <textarea
                className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                aria-label="Exclusions"
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg text-brand">Inbox</h2>
                <p className="text-xs text-muted">
                  Highlighted text is the keyword that brought the article in.
                </p>
              </div>
              <button
                type="button"
                disabled={mentions.length === 0}
                onClick={() => exportMentionsCsv(mentions, queries)}
                className="rounded-lg bg-mist px-3 py-1.5 text-sm text-brand disabled:opacity-50"
              >
                Export mentions
              </button>
            </div>
            <ul className="space-y-2">
              {mentions.filter((m) => m.status === "new").length === 0 ? (
                <p className="text-sm text-muted">No new mentions.</p>
              ) : (
                mentions
                  .filter((m) => m.status === "new")
                  .map((m) => {
                    const keywords =
                      queries.find((q) => q.id === m.query_id)?.keywords ?? "";
                    const matchNote = mentionMatchNote(
                      keywords,
                      m.title,
                      m.snippet
                    );
                    return (
                    <li
                      key={m.id}
                      className="surface-card flex flex-wrap items-start justify-between gap-3 p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-brand">
                          <HighlightedKeywords
                            text={m.title}
                            keywords={keywords}
                          />
                        </div>
                        <div className="text-xs text-muted">
                          {m.outlet}
                          {m.published_at
                            ? ` · ${m.published_at.slice(0, 10)}`
                            : ""}
                        </div>
                        {m.snippet ? (
                          <p className="mt-1 text-sm text-muted">
                            <HighlightedKeywords
                              text={m.snippet}
                              keywords={keywords}
                            />
                          </p>
                        ) : null}
                        {matchNote ? (
                          <p className="mt-1 text-xs text-brand">{matchNote}</p>
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
                    );
                  })
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
                message. Spokespeople on the public page are Peters &amp; May
                contacts marked on their contact record, not press contacts.
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
                  touchNewsroom((f) => ({ ...f, title: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Language</span>
              <select
                className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                value={newsroomForm.language}
                onChange={(e) =>
                  touchNewsroom((f) => ({
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
                  touchNewsroom((f) => ({
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
                  touchNewsroom((f) => ({
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
                    touchNewsroom((f) => ({ ...f, seo_title: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted">SEO keywords</span>
                <input
                  className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                  value={newsroomForm.seo_keywords}
                  onChange={(e) =>
                    touchNewsroom((f) => ({
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
                    touchNewsroom((f) => ({
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
                    touchNewsroom((f) => ({
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
                Published releases on the site: {publishedReleaseCount}
              </p>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
