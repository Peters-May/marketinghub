"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Globe,
  Heart,
  ImageIcon,
  MessageCircle,
  MoreHorizontal,
  Play,
  Repeat2,
  Send,
  Share2,
  ThumbsUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLATFORM_META,
  isCanvaUrl,
  isVideoUrl,
  resolvePreviewPlatforms,
  type PlatformKey,
} from "@/lib/social/platforms";
import { CanvaPreviewTile } from "@/components/content/CanvaPreviewTile";
import { RichTextView } from "@/components/ui/RichTextView";
import { stripHtml } from "@/lib/data/normalize";

type LayoutMode = "carousel" | "collage" | "single";

function layoutForPlatform(platform: PlatformKey, count: number): LayoutMode {
  if (count <= 1) return "single";
  if (platform === "instagram" || platform === "tiktok") return "carousel";
  return "collage";
}

function MediaThumb({
  url,
  className,
  playback = "still",
}: {
  url: string;
  className?: string;
  /** still = poster frame; autoplay = muted loop; controls = player chrome. */
  playback?: "still" | "autoplay" | "controls";
}) {
  if (isVideoUrl(url)) {
    return (
      <video
        src={url}
        muted
        playsInline
        loop={playback === "autoplay"}
        autoPlay={playback === "autoplay"}
        controls={playback === "controls"}
        preload="metadata"
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt=""
      className={cn("h-full w-full object-cover", className)}
      loading="lazy"
    />
  );
}

function Caption({
  html,
  text,
  className,
}: {
  html?: string | null;
  text: string;
  className?: string;
}) {
  const body = html?.trim() || text.trim();
  if (!body) return null;
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(body);
  if (looksHtml) {
    return (
      <RichTextView
        html={body}
        className={cn("text-[13px] leading-snug text-slate-800", className)}
        empty=""
      />
    );
  }
  return (
    <p className={cn("whitespace-pre-wrap text-[13px] leading-snug text-slate-800", className)}>
      {body}
    </p>
  );
}

function CarouselMedia({
  images,
  aspectClass,
  playback = "still",
  insetControls = false,
}: {
  images: string[];
  aspectClass: string;
  playback?: "still" | "autoplay" | "controls";
  /** Keep arrows and dots clear of a side rail and bottom caption. */
  insetControls?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const total = images.length;
  const current = Math.min(index, total - 1);

  function go(next: number) {
    if (total <= 1) return;
    setIndex((next + total) % total);
  }

  return (
    <div className={cn("relative w-full overflow-hidden bg-slate-100", aspectClass)}>
      <MediaThumb url={images[current]} playback={playback} />
      {total > 1 ? (
        <>
          <button
            type="button"
            className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/60"
            aria-label="Previous image"
            onClick={(e) => {
              e.stopPropagation();
              go(current - 1);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(
              "absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/60",
              insetControls ? "right-12" : "right-2"
            )}
            aria-label="Next image"
            onClick={(e) => {
              e.stopPropagation();
              go(current + 1);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="absolute right-2 top-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
            {current + 1}/{total}
          </span>
          <div
            className={cn(
              "absolute left-0 right-0 flex justify-center gap-1",
              insetControls ? "bottom-28" : "bottom-2"
            )}
          >
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Image ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition",
                  i === current ? "w-3 bg-white" : "w-1.5 bg-white/55"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function CollageMedia({
  images,
  aspectClass,
  playback = "still",
}: {
  images: string[];
  aspectClass: string;
  playback?: "still" | "autoplay" | "controls";
}) {
  const shown = images.slice(0, 4);
  const extra = images.length - shown.length;
  const count = shown.length;

  if (count === 1) {
    return (
      <div className={cn("overflow-hidden bg-slate-100", aspectClass)}>
        <MediaThumb url={shown[0]} playback={playback} />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className={cn("grid grid-cols-2 gap-[2px] bg-white", aspectClass)}>
        {shown.map((src) => (
          <div key={src} className="relative min-h-0 overflow-hidden bg-slate-100">
            <MediaThumb url={src} />
          </div>
        ))}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className={cn("grid grid-cols-2 grid-rows-2 gap-[2px] bg-white", aspectClass)}>
        <div className="relative row-span-2 min-h-0 overflow-hidden bg-slate-100">
          <MediaThumb url={shown[0]} />
        </div>
        {shown.slice(1).map((src) => (
          <div key={src} className="relative min-h-0 overflow-hidden bg-slate-100">
            <MediaThumb url={src} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-2 grid-rows-2 gap-[2px] bg-white", aspectClass)}>
      {shown.map((src, i) => (
        <div key={src} className="relative min-h-0 overflow-hidden bg-slate-100">
          <MediaThumb url={src} />
          {i === 3 && extra > 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-lg font-semibold text-white">
              +{extra}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function CompactMultiImageThumb({
  images,
  canvaUrl,
  className,
}: {
  images: string[];
  canvaUrl?: string | null;
  className?: string;
}) {
  const uniqueImages: string[] = [];
  for (const src of images) {
    const u = (src ?? "").trim();
    if (u && !uniqueImages.includes(u)) uniqueImages.push(u);
  }
  const extraHidden = Math.max(0, uniqueImages.length - 2);
  if (uniqueImages.length === 0) {
    if (canvaUrl && isCanvaUrl(canvaUrl)) {
      return <CanvaPreviewTile url={canvaUrl} compact className={className} />;
    }
    return (
      <div
        className={cn(
          "flex aspect-[16/10] w-full items-center justify-center rounded-md bg-gradient-to-br from-sky-50 to-slate-100 text-sky-200",
          className
        )}
      >
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-[16/10] w-full overflow-hidden rounded-md bg-slate-100",
        className
      )}
    >
      {uniqueImages.length === 1 ? (
        <MediaThumb url={uniqueImages[0]} />
      ) : (
        <div className="grid h-full grid-cols-2 gap-[2px]">
          <MediaThumb url={uniqueImages[0]} />
          <div className="relative min-h-0">
            <MediaThumb url={uniqueImages[1]} />
            {extraHidden > 0 ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-[11px] font-semibold text-white">
                +{extraHidden}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** Profile stand-in. Initials only — the wordmark is not rebuilt here. */
function ProfileMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[#0B2545] text-[9px] font-semibold tracking-tight text-white",
        className
      )}
      aria-hidden
    >
      P&M
    </span>
  );
}

function IconRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center text-slate-700", className)} aria-hidden>
      {children}
    </div>
  );
}

type FrameProps = {
  captionHtml?: string | null;
  captionText: string;
  media: ReactNode;
  layout: LayoutMode;
  imageCount: number;
};

function InstagramFrame({ captionHtml, captionText, media }: FrameProps) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <ProfileMark className="h-8 w-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-slate-900">petersandmay</p>
        </div>
        <MoreHorizontal className="h-5 w-5 text-slate-800" aria-hidden />
      </header>
      {media}
      <IconRow className="justify-between px-3 py-2.5">
        <span className="flex items-center gap-3.5">
          <Heart className="h-6 w-6" strokeWidth={1.75} />
          <MessageCircle className="h-6 w-6" strokeWidth={1.75} />
          <Send className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <Bookmark className="h-6 w-6" strokeWidth={1.75} />
      </IconRow>
      {captionText ? (
        <div className="px-3 pb-3">
          {captionHtml ? (
            <>
              <p className="text-[13px] font-semibold text-slate-900">petersandmay</p>
              <Caption html={captionHtml} text={captionText} className="mt-0.5" />
            </>
          ) : (
            <p className="whitespace-pre-wrap text-[13px] leading-snug text-slate-900">
              <span className="font-semibold">petersandmay </span>
              {captionText}
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}

function FacebookFrame({ captionHtml, captionText, media }: FrameProps) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2.5 px-3 py-3">
        <ProfileMark className="h-10 w-10 text-[10px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-900">Peters &amp; May</p>
          <p className="flex items-center gap-1 text-[12px] text-slate-500">
            Preview
            <span aria-hidden>·</span>
            <Globe className="h-3 w-3" />
          </p>
        </div>
        <MoreHorizontal className="h-5 w-5 text-slate-500" aria-hidden />
      </header>
      {captionText ? (
        <div className="px-3 pb-2.5">
          <Caption html={captionHtml} text={captionText} className="text-[15px] leading-snug" />
        </div>
      ) : null}
      {media}
      <IconRow className="justify-around border-t border-slate-200 px-2 py-2 text-[13px] font-semibold text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <ThumbsUp className="h-[18px] w-[18px]" /> Like
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="h-[18px] w-[18px]" /> Comment
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Share2 className="h-[18px] w-[18px]" /> Share
        </span>
      </IconRow>
    </article>
  );
}

function LinkedInFrame({ captionHtml, captionText, media }: FrameProps) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start gap-2.5 px-3 py-3">
        <ProfileMark className="h-12 w-12 text-[11px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-slate-900">Peters &amp; May</p>
          <p className="text-[12px] text-slate-500">Bespoke logistics</p>
          <p className="text-[12px] text-slate-400">Preview</p>
        </div>
      </header>
      {captionText ? (
        <div className="px-3 pb-2.5">
          <Caption html={captionHtml} text={captionText} className="text-[14px] leading-snug" />
        </div>
      ) : null}
      {media}
      <IconRow className="justify-around border-t border-slate-200 px-1 py-2 text-[12px] font-semibold text-slate-600">
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="h-4 w-4" /> Like
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="h-4 w-4" /> Comment
        </span>
        <span className="inline-flex items-center gap-1">
          <Repeat2 className="h-4 w-4" /> Repost
        </span>
        <span className="inline-flex items-center gap-1">
          <Send className="h-4 w-4" /> Send
        </span>
      </IconRow>
    </article>
  );
}

function XFrame({ captionHtml, captionText, media }: FrameProps) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <ProfileMark className="h-10 w-10 text-[10px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-tight text-slate-900">
            Peters &amp; May
          </p>
          <p className="text-[13px] text-slate-500">@petersandmay</p>
          {captionText ? (
            <div className="mt-1">
              <Caption html={captionHtml} text={captionText} className="text-[15px] leading-snug" />
            </div>
          ) : null}
          <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200">{media}</div>
          <IconRow className="mt-2 justify-between pr-6 text-slate-500">
            <MessageCircle className="h-[18px] w-[18px]" />
            <Repeat2 className="h-[18px] w-[18px]" />
            <Heart className="h-[18px] w-[18px]" />
            <Bookmark className="h-[18px] w-[18px]" />
            <Share2 className="h-[18px] w-[18px]" />
          </IconRow>
        </div>
      </div>
    </article>
  );
}

function TikTokFrame({ captionText, media }: FrameProps) {
  return (
    <article className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-[1.6rem] bg-black shadow-md ring-1 ring-white/10">
      {media}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent px-3 pb-4 pt-20">
        <p className="text-[14px] font-semibold text-white">Peters &amp; May</p>
        {captionText ? (
          <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-[13px] leading-snug text-white/95">
            {captionText}
          </p>
        ) : null}
      </div>
      <div
        className="pointer-events-none absolute bottom-24 right-2 flex flex-col items-center gap-4 text-white"
        aria-hidden
      >
        <Heart className="h-7 w-7" />
        <MessageCircle className="h-7 w-7" />
        <Bookmark className="h-7 w-7" />
        <Share2 className="h-7 w-7" />
      </div>
    </article>
  );
}

function YouTubeFrame({
  captionHtml,
  captionText,
  media,
  showPlay,
}: FrameProps & { showPlay: boolean }) {
  return (
    <article className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="relative bg-black">
        {media}
        {showPlay ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/75 text-white">
              <Play className="ml-0.5 h-6 w-6 fill-white" />
            </span>
          </div>
        ) : null}
      </div>
      <div className="px-3 py-3">
        {captionText ? (
          <Caption
            html={captionHtml}
            text={captionText}
            className="text-[15px] font-semibold leading-snug text-slate-900"
          />
        ) : null}
        <div className="mt-3 flex items-center gap-2.5">
          <ProfileMark className="h-9 w-9 text-[10px]" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-slate-900">Peters &amp; May</p>
            <p className="text-[12px] text-slate-500">@Petersandmay</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function GenericFrame({
  captionHtml,
  captionText,
  media,
  layout,
  imageCount,
}: FrameProps) {
  const meta = PLATFORM_META.social;
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ backgroundColor: meta.bg, color: meta.fg }}
        >
          {meta.short}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-900">Peters &amp; May</p>
          <p className="text-[11px] text-slate-500">
            Social
            {imageCount > 1 ? (layout === "carousel" ? " · Carousel" : " · Collage") : ""}
          </p>
        </div>
      </header>
      {media}
      {captionText ? (
        <div className="px-3 py-2.5">
          <Caption html={captionHtml} text={captionText} />
        </div>
      ) : null}
    </article>
  );
}

function aspectFor(platform: PlatformKey, imageCount: number): string {
  if (platform === "instagram") return "aspect-square";
  if (platform === "tiktok") return "aspect-[9/16]";
  if (platform === "youtube" || platform === "x") {
    return imageCount > 1 ? "aspect-[4/3]" : "aspect-video";
  }
  if (platform === "linkedin") {
    return imageCount > 1 ? "aspect-[4/3]" : "aspect-[1.91/1]";
  }
  if (platform === "facebook") {
    return imageCount > 1 ? "aspect-[4/3]" : "aspect-[4/5]";
  }
  return "aspect-[4/5] sm:aspect-[16/10]";
}

const STAGE: Record<PlatformKey, string> = {
  instagram: "bg-[#fafafa]",
  facebook: "bg-[#f0f2f5]",
  linkedin: "bg-[#f3f2ef]",
  x: "bg-white",
  tiktok: "bg-[#111111]",
  youtube: "bg-[#f9f9f9]",
  social: "bg-white",
};

function PlatformStage({
  platform,
  label,
  caption,
  captionHtml,
  images,
  canvaUrl,
}: {
  platform: PlatformKey;
  label: string;
  caption: string;
  captionHtml?: string | null;
  images: string[];
  canvaUrl?: string | null;
}) {
  const meta = PLATFORM_META[platform];
  const layout = layoutForPlatform(platform, images.length);
  const aspectClass = aspectFor(platform, images.length);
  const captionText = caption || stripHtml(captionHtml ?? "");
  const playback =
    platform === "tiktok" ? "autoplay" : platform === "youtube" ? "controls" : "still";
  const primaryIsVideo = images.length === 1 && isVideoUrl(images[0]);

  const media =
    images.length > 0 ? (
      layout === "carousel" ? (
        <CarouselMedia
          images={images}
          aspectClass={aspectClass}
          playback={playback}
          insetControls={platform === "tiktok"}
        />
      ) : (
        <CollageMedia images={images} aspectClass={aspectClass} playback={playback} />
      )
    ) : canvaUrl && isCanvaUrl(canvaUrl) ? (
      <div className={cn("overflow-hidden bg-slate-50", aspectClass)}>
        <CanvaPreviewTile url={canvaUrl} compact={false} className="h-full" />
      </div>
    ) : (
      <div
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-sky-50 to-slate-100 text-sky-200",
          aspectClass
        )}
      >
        <ImageIcon className="h-10 w-10" />
      </div>
    );

  const frameProps: FrameProps = {
    captionHtml,
    captionText,
    media,
    layout,
    imageCount: images.length,
  };

  const frame =
    platform === "instagram" ? (
      <InstagramFrame {...frameProps} />
    ) : platform === "facebook" ? (
      <FacebookFrame {...frameProps} />
    ) : platform === "linkedin" ? (
      <LinkedInFrame {...frameProps} />
    ) : platform === "x" ? (
      <XFrame {...frameProps} />
    ) : platform === "tiktok" ? (
      <TikTokFrame {...frameProps} />
    ) : platform === "youtube" ? (
      <YouTubeFrame {...frameProps} showPlay={images.length === 1 && !primaryIsVideo} />
    ) : (
      <GenericFrame {...frameProps} />
    );

  return (
    <div className={cn("rounded-2xl p-3", STAGE[platform])}>
      <p
        className={cn(
          "mb-2 text-center text-[11px] font-medium uppercase tracking-[0.14em]",
          platform === "tiktok" ? "text-white/70" : "text-slate-500"
        )}
      >
        {label || meta.label} preview
      </p>
      {frame}
    </div>
  );
}

export function PlatformPostPreview({
  platforms,
  caption,
  captionHtml,
  images,
  canvaUrl,
}: {
  platforms: string[];
  caption: string;
  captionHtml?: string | null;
  images: string[];
  canvaUrl?: string | null;
}) {
  const resolved = useMemo(() => resolvePreviewPlatforms(platforms), [platforms]);

  return (
    <div className="space-y-4">
      {resolved.map((item) => (
        <PlatformStage
          key={`${item.key}:${item.label}`}
          platform={item.key}
          label={item.label}
          caption={caption}
          captionHtml={captionHtml}
          images={images}
          canvaUrl={canvaUrl}
        />
      ))}
    </div>
  );
}
