import Link from "next/link";
import type { ReactNode } from "react";
import type { NewsroomSettings } from "@/lib/types";

export function NewsroomHeader({
  settings,
  trailing,
  heading = false,
}: {
  settings: NewsroomSettings;
  trailing: ReactNode;
  /** The newsroom index uses a heading. Story pages keep the article title as the heading. */
  heading?: boolean;
}) {
  const title = heading ? (
    <h1 className="font-display text-2xl tracking-tight md:text-3xl">
      {settings.title}
    </h1>
  ) : (
    <Link href="/newsroom" className="font-display text-2xl tracking-tight">
      {settings.title}
    </Link>
  );

  return (
    <header className="border-b border-brand/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-4">
          {settings.logo_url ? (
            <Link href="/newsroom" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={settings.logo_url}
                alt="Peters & May"
                className="h-10 w-auto"
              />
            </Link>
          ) : (
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Peters &amp; May
            </p>
          )}
          {title}
        </div>
        {trailing}
      </div>
    </header>
  );
}
