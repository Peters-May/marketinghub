import { format, parseISO } from "date-fns";
import { PlatformPostPreview } from "@/components/social/PlatformPostPreview";
import type { PublicSocialPreview } from "@/lib/social/post-share";

function bannerCopy(status: PublicSocialPreview["previewStatus"]): string {
  if (status === "Published") {
    return "This is how the post appears on social media.";
  }
  if (status === "Scheduled") {
    return "Scheduled preview. This is how the post will appear once it goes live.";
  }
  if (status === "Cancelled") {
    return "This draft was cancelled. The preview is kept for reference.";
  }
  return "Draft preview for staff. This is how the post will look on social media. It has not been published.";
}

export function SharePostClient({
  preview,
}: {
  preview: PublicSocialPreview | null;
}) {
  const when = preview?.dueDate
    ? format(parseISO(`${preview.dueDate}T12:00:00`), "EEEE d MMMM yyyy")
    : null;

  return (
    <div className="min-h-screen bg-[var(--background)] text-foreground">
      <header className="border-b border-border bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-lg px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Peters &amp; May
          </p>
          <h1 className="mt-1 font-display text-3xl text-brand">Social preview</h1>
          <p className="mt-1 text-sm text-muted">
            Shared with staff. No Hub sign-in required.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8">
        {!preview ? (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <h2 className="font-display text-2xl text-brand">Link unavailable</h2>
            <p className="mt-2 text-sm text-muted">
              This share link is invalid or has been turned off.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {preview.previewStatus}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {bannerCopy(preview.previewStatus)}
              </p>
              {preview.title ? (
                <p className="mt-2 text-sm font-medium text-brand">{preview.title}</p>
              ) : null}
              {when ? <p className="mt-1 text-xs text-muted">{when}</p> : null}
            </div>
            <PlatformPostPreview
              platforms={preview.platforms.length ? preview.platforms : ["Social"]}
              caption={preview.caption}
              captionHtml={preview.captionHtml}
              images={preview.images}
              canvaUrl={preview.canvaUrl}
            />
            <p className="text-xs text-muted">
              Likes, comments and the live feed are not part of this preview.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
