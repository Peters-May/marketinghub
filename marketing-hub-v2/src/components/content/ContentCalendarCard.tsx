"use client";

import { Check, FileText, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentItem, ContentStatus } from "@/lib/types";
import {
  formatChannels,
  imageAssetUrls,
  isSocialContentItem,
  parseChannels,
  primaryCanvaUrl,
} from "@/lib/data/normalize";
import { CompactMultiImageThumb } from "@/components/social/PlatformPostPreview";
import { PLATFORM_META, platformKey } from "@/lib/social/platforms";
import { plainTextFromHtml } from "@/lib/plain-text";
import { statusChipClass } from "@/lib/ui/statusTokens";

const STATUS_LABEL: Record<ContentStatus, string> = {
  idea: "Idea",
  draft: "Draft",
  review: "Approved",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  cancelled: "Cancelled",
};

function statusTone(status: ContentStatus) {
  return statusChipClass(status);
}

function PlatformDot({ channel }: { channel: string }) {
  const meta = PLATFORM_META[platformKey(channel)];
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-bold leading-none"
      style={{ backgroundColor: meta.bg, color: meta.fg }}
      title={channel || meta.label}
    >
      {meta.short}
    </span>
  );
}

/** Planable-style card for Content & Social calendar cells. */
export function ContentCalendarCard({
  item,
  compact = true,
}: {
  item: ContentItem;
  compact?: boolean;
}) {
  const social = isSocialContentItem(item);
  const channels = parseChannels(item.channel);
  const images = imageAssetUrls(item.asset_url);
  const canva = images.length === 0 ? primaryCanvaUrl(item.asset_url) : "";
  const notesPreview = plainTextFromHtml(item.notes).slice(0, 120);
  const preview = item.title?.trim() || notesPreview || "Untitled";

  return (
    <div
      className={cn(
        "hub-cal-card flex w-full flex-col overflow-hidden rounded-lg border border-slate-200/90 bg-white text-left shadow-sm",
        compact ? "gap-1 p-1.5" : "gap-1.5 p-2"
      )}
    >
      <div className="flex flex-wrap items-center gap-1">
        {social ? (
          channels.map((ch) => <PlatformDot key={ch} channel={ch} />)
        ) : (
          <span className="inline-flex h-4 items-center rounded bg-slate-700 px-1 text-[8px] font-bold uppercase tracking-wide text-white">
            {item.content_type?.slice(0, 3) || "Cnt"}
          </span>
        )}
        <span className="text-[9px] font-medium leading-snug text-slate-500">
          {formatChannels(channels) || (social ? "Social" : "Content")}
        </span>
      </div>

      {images.length > 0 || canva ? (
        <CompactMultiImageThumb images={images} canvaUrl={canva || null} />
      ) : (
        <div
          className={cn(
            "flex aspect-[16/10] w-full items-center justify-center rounded-md",
            social
              ? "bg-gradient-to-br from-sky-50 to-slate-100 text-sky-200"
              : "bg-gradient-to-br from-slate-100 to-sand text-slate-300"
          )}
        >
          {social ? (
            <ImageIcon className="h-5 w-5" />
          ) : (
            <FileText className="h-5 w-5" />
          )}
        </div>
      )}

      <p className="line-clamp-2 text-[10px] font-medium leading-snug text-slate-800">
        {preview}
      </p>

      <div className="mt-auto flex items-center">
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-0.5 truncate rounded-full border px-1.5 py-0.5 text-[9px] font-medium",
            statusTone(item.status)
          )}
        >
          {item.status === "published" || item.status === "scheduled" ? (
            <Check className="h-2.5 w-2.5 shrink-0" />
          ) : null}
          {STATUS_LABEL[item.status] ?? item.status}
        </span>
      </div>
    </div>
  );
}

/** Shared FullCalendar day-grid CSS for card-style hubs. */
export const HUB_CALENDAR_CSS = `
  .hub-fc .fc-daygrid-day-frame { min-height: 150px; }
  .hub-fc .fc-daygrid-event {
    background: transparent !important;
    border: none !important;
    margin: 3px 4px !important;
  }
  .hub-fc .fc-daygrid-event-harness { margin-top: 2px; }
  .hub-fc .fc-event-main {
    padding: 0 !important;
    overflow: visible !important;
  }
  .hub-fc .fc-daygrid-day-number {
    font-size: 12px;
    color: #64748b;
    padding: 6px 8px;
  }
  .hub-fc .fc-day-today { background: #f8fafc !important; }
  .hub-fc .fc-day-today .fc-daygrid-day-number {
    background: #c43c3c;
    color: #fff;
    border-radius: 999px;
    width: 1.5rem;
    height: 1.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin: 4px 6px;
  }
  .hub-fc .fc-col-header-cell-cushion {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .hub-fc .fc-scrollgrid,
  .hub-fc td,
  .hub-fc th { border-color: #e8ecf0 !important; }
  .hub-fc .fc-event { cursor: grab; }
  .hub-fc .fc-event:active { cursor: grabbing; }
  .hub-fc.hub-fc--day-create .fc-daygrid-day-frame { cursor: pointer; }
  .hub-fc.hub-fc--day-create .fc-daygrid-day-frame:hover {
    background: #f1f5f9;
  }
  .hub-fc.hub-fc--day-create .fc-day-today .fc-daygrid-day-frame:hover {
    background: #f1f5f9 !important;
  }
  /* "+N more" popover: keep card stack readable (no full-bleed images) */
  .hub-fc .fc-more-popover {
    max-width: min(280px, 90vw) !important;
    width: 260px !important;
    max-height: min(70vh, 520px) !important;
    z-index: 50 !important;
  }
  .hub-fc .fc-more-popover .fc-popover-body {
    max-height: min(60vh, 440px);
    overflow-y: auto;
    padding: 6px !important;
  }
  .hub-fc .fc-more-popover .fc-daygrid-event {
    margin: 4px 0 !important;
  }
  .hub-fc .fc-more-popover .hub-cal-card {
    max-width: 100%;
  }
  .hub-fc .fc-more-popover .hub-cal-card img {
    max-height: 96px;
    object-fit: cover;
  }
`;
