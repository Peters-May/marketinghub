"use client";

import { format, parseISO } from "date-fns";
import { previewAssetUrls } from "@/lib/data/normalize";
import type { ContentItem } from "@/lib/types";

function ideaTitle(idea: ContentItem): string {
  const title = idea.title.trim();
  if (title && title !== "Untitled idea") return title;
  const caption = idea.caption.trim();
  if (caption) return caption;
  return "Untitled idea";
}

export function MemberIdeasColumn({
  ideas,
  onOpen,
}: {
  ideas: ContentItem[];
  onOpen: (idea: ContentItem) => void;
}) {
  const ordered = [...ideas].sort((a, b) =>
    (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at)
  );

  return (
    <aside
      className="surface-card flex max-h-[28rem] w-full shrink-0 flex-col overflow-hidden max-lg:order-first lg:sticky lg:top-4 lg:h-[calc(100vh-11rem)] lg:max-h-[calc(100vh-11rem)]"
      aria-label="Your ideas"
    >
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-brand">Your ideas</h2>
          <span className="text-[11px] text-muted">{ordered.length}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Ideas you have sent to marketing. Other members cannot see this list.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {ordered.length === 0 ? (
          <p className="px-1 py-3 text-xs text-muted">
            Nothing suggested yet. Use Suggest a post to send an idea.
          </p>
        ) : (
          ordered.map((idea) => {
            const image = previewAssetUrls(idea.asset_url)[0];
            const when = idea.created_at
              ? format(parseISO(idea.created_at), "d MMM yyyy")
              : "";
            return (
              <button
                key={idea.id}
                type="button"
                className="flex w-full items-start gap-2 rounded-xl border border-dashed border-slate-300 bg-sand/40 px-2.5 py-2 text-left"
                onClick={() => onOpen(idea)}
              >
                {image ? (
                  <img
                    src={image}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                  />
                ) : null}
                <span className="min-w-0">
                  <span className="block line-clamp-2 text-xs font-medium leading-snug text-slate-800">
                    {ideaTitle(idea)}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted">
                    {[when, idea.channel.filter(Boolean).join(" · ")]
                      .filter(Boolean)
                      .join(" · ") || "Idea"}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
