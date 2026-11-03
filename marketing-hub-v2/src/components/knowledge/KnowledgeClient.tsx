"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Audience = "public" | "internal";

type Overview = {
  pages_indexed: number;
  pages_active: number;
  documents_active: number;
  suggestions_pending: number;
  last_sync_hint: string;
};

type DocRow = {
  id: string;
  title: string;
  source_url?: string;
  active?: boolean;
  body?: string;
};

type Suggestion = {
  id: string;
  question: string;
  sample_answer: string;
  hit_count: number;
  status: string;
};

export function KnowledgeClient({
  canEditInternal,
}: {
  canEditInternal: boolean;
}) {
  const [audience, setAudience] = useState<Audience>("public");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [toolCoverage, setToolCoverage] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [overviewRes, docsRes, sugRes] = await Promise.all([
        fetch(`/api/knowledge?audience=${audience}&view=overview`),
        fetch(`/api/knowledge?audience=${audience}&view=documents`),
        audience === "public"
          ? fetch(`/api/knowledge?audience=public&view=suggestions&status=pending`)
          : Promise.resolve(null),
      ]);
      const overviewData = await overviewRes.json();
      const docsData = await docsRes.json();
      if (!overviewRes.ok) throw new Error(overviewData.error ?? "Failed");
      if (!docsRes.ok) throw new Error(docsData.error ?? "Failed");
      setOverview(overviewData.overview ?? null);
      setDocuments(docsData.documents ?? []);
      setToolCoverage(docsData.tool_coverage ?? []);
      if (sugRes) {
        const sugData = await sugRes.json();
        if (sugRes.ok) setSuggestions(sugData.suggestions ?? []);
      } else {
        setSuggestions([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load knowledge");
    } finally {
      setBusy(false);
    }
  }, [audience]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveDocument() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_document",
          audience,
          title,
          body,
          source_url: sourceUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setTitle("");
      setBody("");
      setSourceUrl("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function resolveSuggestion(
    id: string,
    status: "approved" | "dismissed",
    sample_answer?: string
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_suggestion",
          audience: "public",
          id,
          status,
          sample_answer,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  const sitePages = documents.filter((d) => d.id.startsWith("kb_site_"));
  const manualDocs = documents.filter((d) => !d.id.startsWith("kb_site_"));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#0B2545]">Knowledge</h1>
          <p className="mt-1 text-sm text-[#5b6472]">
            See what the assistants know, train corrections, and keep public
            and internal knowledge separate.
          </p>
        </div>
        <Link
          href="/app/chat"
          className="text-sm font-semibold text-[#007DC5] underline-offset-2 hover:underline"
        >
          Website chat inbox
        </Link>
      </div>

      <div className="flex gap-2 rounded-lg border border-[#d8dde3] bg-white p-1">
        {(
          [
            ["public", "Public (Online Chat)"],
            ["internal", "Internal (Hub Assistant)"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            disabled={id === "internal" && !canEditInternal}
            onClick={() => setAudience(id)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-semibold",
              audience === id
                ? "bg-[#0B2545] text-white"
                : "text-[#5b6472] hover:bg-[#f4f6f7]",
              id === "internal" && !canEditInternal && "opacity-40"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {overview ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            audience === "public"
              ? ["Pages indexed", overview.pages_indexed]
              : ["How-to topics", overview.documents_active],
            audience === "public"
              ? ["Pages active", overview.pages_active]
              : ["Tools available", toolCoverage.length],
            ["Documents active", overview.documents_active],
            audience === "public"
              ? ["Gaps pending", overview.suggestions_pending]
              : ["Last update", overview.last_sync_hint],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-lg border border-[#d8dde3] bg-white px-4 py-3"
            >
              <div className="text-xs uppercase tracking-wide text-[#5b6472]">
                {label}
              </div>
              <div className="mt-1 text-xl font-semibold text-[#0B2545]">
                {value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {audience === "public" ? (
        <section className="rounded-lg border border-[#d8dde3] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[#0B2545]">
              Indexed website pages
            </h2>
            <button
              type="button"
              className="text-sm font-semibold text-[#007DC5]"
              onClick={() => void load()}
              disabled={busy}
            >
              Refresh
            </button>
          </div>
          <p className="mt-1 text-sm text-[#5b6472]">
            Synced from petersandmay.com. Run Update from website on Chat →
            Train to refresh.
          </p>
          <ul className="mt-3 max-h-64 space-y-2 overflow-auto text-sm">
            {sitePages.slice(0, 80).map((doc) => (
              <li key={doc.id} className="flex justify-between gap-2 border-b border-[#eef1f4] py-1">
                <span className="font-medium text-[#1f2937]">{doc.title}</span>
                {doc.source_url ? (
                  <a
                    href={doc.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-[#007DC5]"
                  >
                    Open
                  </a>
                ) : null}
              </li>
            ))}
            {sitePages.length === 0 ? (
              <li className="text-[#5b6472]">No site pages indexed yet.</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {audience === "internal" && toolCoverage.length > 0 ? (
        <section className="rounded-lg border border-[#d8dde3] bg-white p-4">
          <h2 className="text-lg font-semibold text-[#0B2545]">
            Live Hub tools the assistant can call
          </h2>
          <p className="mt-1 text-sm text-[#5b6472]">
            Private CRM and spend data stay behind these permissioned tools —
            not in the public knowledge base.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {toolCoverage.map((name) => (
              <li
                key={name}
                className="rounded-md bg-[#f4f6f7] px-2 py-1 text-xs font-medium text-[#1f2937]"
              >
                {name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-[#d8dde3] bg-white p-4">
        <h2 className="text-lg font-semibold text-[#0B2545]">
          {audience === "public" ? "Approved public documents" : "Internal help documents"}
        </h2>
        <p className="mt-1 text-sm text-[#5b6472]">
          Add FAQs, PDF text, or corrections without changing code.{" "}
          {audience === "public"
            ? "Online Chat only."
            : "Hub Assistant how-to only."}
        </p>
        <ul className="mt-3 max-h-48 space-y-2 overflow-auto text-sm">
          {(audience === "public" ? manualDocs : documents).map((doc) => (
            <li key={doc.id} className="border-b border-[#eef1f4] py-1">
              <span className="font-medium">{doc.title}</span>
              {doc.active === false ? (
                <span className="ml-2 text-xs text-[#5b6472]">inactive</span>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2">
          <input
            className="rounded-md border border-[#c7ccd1] px-3 py-2 text-sm"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="rounded-md border border-[#c7ccd1] px-3 py-2 text-sm"
            placeholder="Source URL (optional)"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
          <textarea
            className="min-h-[120px] rounded-md border border-[#c7ccd1] px-3 py-2 text-sm"
            placeholder="Paste document or PDF text here"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !title.trim() || !body.trim()}
            onClick={() => void saveDocument()}
            className="justify-self-start rounded-md bg-[#007DC5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save document
          </button>
        </div>
      </section>

      {audience === "public" ? (
        <section className="rounded-lg border border-[#d8dde3] bg-white p-4">
          <h2 className="text-lg font-semibold text-[#0B2545]">
            Needs more information
          </h2>
          <p className="mt-1 text-sm text-[#5b6472]">
            Questions the chat could not ground in knowledge. Approve with an
            answer to publish into the public KB, or dismiss.
          </p>
          <ul className="mt-3 space-y-3">
            {suggestions.map((s) => (
              <li
                key={s.id}
                className="rounded-md border border-[#eef1f4] p-3 text-sm"
              >
                <div className="font-medium text-[#1f2937]">{s.question}</div>
                <div className="mt-1 text-xs text-[#5b6472]">
                  Asked {s.hit_count} time{s.hit_count === 1 ? "" : "s"}
                </div>
                <textarea
                  className="mt-2 w-full rounded-md border border-[#c7ccd1] px-2 py-1 text-sm"
                  placeholder="Sample answer to publish"
                  defaultValue={s.sample_answer}
                  id={`ans-${s.id}`}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-[#1f7a4c] px-3 py-1.5 text-xs font-semibold text-white"
                    onClick={() => {
                      const el = document.getElementById(
                        `ans-${s.id}`
                      ) as HTMLTextAreaElement | null;
                      void resolveSuggestion(
                        s.id,
                        "approved",
                        el?.value ?? s.sample_answer
                      );
                    }}
                  >
                    Approve to KB
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[#c7ccd1] px-3 py-1.5 text-xs font-semibold"
                    onClick={() => void resolveSuggestion(s.id, "dismissed")}
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
            {suggestions.length === 0 ? (
              <li className="text-sm text-[#5b6472]">No pending gaps.</li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
