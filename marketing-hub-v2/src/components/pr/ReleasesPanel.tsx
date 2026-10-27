"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ContentItem } from "@/lib/types";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  ReleaseEditor,
  type ReleaseSpokesperson,
} from "@/components/pr/ReleaseEditor";
import { compileEmailDesign } from "@/lib/email/design";
import { plainTextFromHtml } from "@/lib/plain-text";
import {
  PRESS_PITCH_TEMPLATE_ID,
  pressPitchFromRelease,
} from "@/lib/pr/pitch-email";
import {
  isFiledOnNewsroom,
  isPublicReleasePage,
  releaseStatusLabel,
} from "@/lib/pr/release-document";
import { formatCreatedAgo, formatLondonStamp } from "@/lib/email/display";

function storyTime(item: ContentItem): string {
  const iso = item.due_date || item.updated_at;
  return formatLondonStamp(iso);
}

export function ReleasesPanel({
  releases,
  newsroomTitle,
  newsroomDescription,
  spokespeople,
  startNew = false,
  onRelease,
}: {
  releases: ContentItem[];
  newsroomTitle: string;
  newsroomDescription: string;
  spokespeople: ReleaseSpokesperson[];
  startNew?: boolean;
  onRelease: (item: ContentItem) => void;
}) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(true);
  const [editing, setEditing] = useState<ContentItem | "new" | null>(
    startNew ? "new" : null
  );

  const stories = useMemo(() => {
    const rows = showAll
      ? releases
      : releases.filter((r) => r.status === "published");
    return [...rows].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [releases, showAll]);

  async function place(
    item: ContentItem,
    patch: {
      pin_homepage?: boolean;
      in_slider?: boolean;
      newsroom_name?: string;
    }
  ) {
    setBusyId(item.id);
    setError("");
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "newsroom_placement", id: item.id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update the story");
      onRelease(data.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the story");
    } finally {
      setBusyId("");
    }
  }

  async function pitchStory(item: ContentItem) {
    setBusyId(item.id);
    setError("");
    try {
      const design = pressPitchFromRelease(
        item,
        releases,
        window.location.origin
      );
      const res = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          subject: item.title,
          preview_text: plainTextFromHtml(item.caption || "").slice(0, 140),
          from_name: "Peters & May Marketing",
          from_email: "marketing@petersandmay.com",
          design,
          html_body: compileEmailDesign(design),
          template_id: PRESS_PITCH_TEMPLATE_ID,
          content_id: item.id,
          folder: "Press",
          category: "pitch",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open the pitch");
      window.location.assign(`/app/email/design/campaign/${data.item.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the pitch");
      setBusyId("");
    }
  }

  if (editing) {
    const current = editing === "new" ? null : editing;
    return (
      <ReleaseEditor
        item={current}
        newsroomTitle={newsroomTitle}
        newsroomDescription={newsroomDescription}
        spokespeople={spokespeople}
        onClose={() => setEditing(null)}
        onSaved={onRelease}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-brand">Press release editor</h2>
          <p className="mt-1 text-sm text-muted">
            Write the story here, then publish it to the newsroom.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
        >
          New press release
        </button>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg text-brand">Releases</h2>
          <button
            type="button"
            className="text-sm text-accent underline"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Published only" : "Show all releases"}
          </button>
        </div>
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
          {stories.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted">
              No press releases yet. Use New press release to write one.
            </li>
          ) : (
            stories.map((item) => {
              const assigned = isFiledOnNewsroom(item);
              const room = assigned ? item.newsroom_name : newsroomTitle;
              const pinned = item.pin_homepage === true;
              const sliding = item.in_slider === true;
              return (
                <li key={item.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      status={item.status}
                      label={releaseStatusLabel(item.status)}
                    />
                    <span className="text-xs text-muted">{storyTime(item)}</span>
                  </div>
                  <h3 className="mt-2 font-medium text-brand">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => setEditing(item)}
                    >
                      {item.title}
                    </button>
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    {assigned ? (
                      <span className="max-w-[12rem] truncate">{room}</span>
                    ) : (
                      <button
                        type="button"
                        className="text-accent underline disabled:opacity-50"
                        disabled={busyId === item.id}
                        onClick={() =>
                          void place(item, { newsroom_name: newsroomTitle })
                        }
                      >
                        Assign to a Newsroom
                      </button>
                    )}
                    {item.category ? <span>{item.category}</span> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-brand/15 px-2.5 py-1 text-xs text-brand disabled:opacity-50"
                      disabled={busyId === item.id}
                      onClick={() =>
                        void place(item, { pin_homepage: !pinned })
                      }
                    >
                      {pinned ? "Unpin from homepage" : "Pin to homepage"}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-brand/15 px-2.5 py-1 text-xs text-brand disabled:opacity-50"
                      disabled={busyId === item.id}
                      onClick={() => void place(item, { in_slider: !sliding })}
                    >
                      {sliding ? "Remove from slider" : "Add to slider"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {formatCreatedAgo(item.created_at)}
                    {item.owner ? ` by ${item.owner}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    <button
                      type="button"
                      className="text-accent underline"
                      onClick={() => setEditing(item)}
                    >
                      Edit
                    </button>
                    {isPublicReleasePage(item) ? (
                      <Link
                        href={`/newsroom/${item.id}`}
                        target="_blank"
                        className="text-accent underline"
                      >
                        {assigned ? "View on newsroom" : "View release"}
                      </Link>
                    ) : (
                      <Link
                        href={`/newsroom/preview/${item.id}`}
                        target="_blank"
                        className="text-accent underline"
                      >
                        Preview
                      </Link>
                    )}
                    <button
                      type="button"
                      className="text-accent underline disabled:opacity-50"
                      disabled={busyId === item.id}
                      onClick={() => void pitchStory(item)}
                    >
                      Pitch the story
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </div>
  );
}
