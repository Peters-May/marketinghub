"use client";

import Link from "next/link";
import { HubTourProvider } from "@/components/tour/HubTour";
import { MediaSignOutButton } from "@/components/media/MediaSignOutButton";
import { NewsroomHeader } from "@/components/pr/NewsroomHeader";
import { NewsroomFooter } from "@/components/newsroom/NewsroomFooter";
import { CopyButton } from "@/components/newsroom/CopyButton";
import { COMPANY_BOILERPLATE } from "@/lib/brand/factsheet";
import { BRAND_GUIDELINES_PDF, MEDIA_DESK_EMAIL } from "@/lib/pr/newsroom-view";
import type { NewsroomSettings } from "@/lib/types";

/**
 * Public /media page: newsroom chrome, quick press resources and the gallery,
 * plus the first-login tour for signed-in external guests.
 */
export function MediaPageChrome({
  settings,
  canDownload,
  signedIn,
  userKey,
  isExternalGuest,
  children,
}: {
  settings: NewsroomSettings;
  canDownload: boolean;
  signedIn: boolean;
  userKey: string;
  isExternalGuest: boolean;
  children: React.ReactNode;
}) {
  const body = (
    <div className="min-h-screen bg-white text-[#0B2545]">
      <NewsroomHeader settings={settings} active="media" />

      <section data-tour="media-header" className="bg-[#0B2545] text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-8 px-6 py-12 md:py-16">
          <div>
            <h1 className="font-display text-4xl leading-[1.05] tracking-tight md:text-5xl">
              Media kit
            </h1>
            <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-white/80">
              Logos, photography and presentations for editorial use. Browse
              freely, then sign in to download full-resolution files.
            </p>
          </div>
          <div data-tour="media-auth" className="flex flex-wrap items-center gap-3">
            {!canDownload ? (
              <Link
                href="/login?intent=media&next=/media"
                className="inline-flex rounded-sm bg-white px-5 py-2.5 text-sm font-medium text-[#0B2545] hover:bg-[#E3E6E9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Sign in to download
              </Link>
            ) : (
              <p className="text-sm text-white/80">You can download files.</p>
            )}
            {signedIn ? <MediaSignOutButton /> : null}
          </div>
        </div>
      </section>

      <section aria-label="Press resources" className="mx-auto max-w-6xl px-6 py-10">
        <ul className="grid gap-8 md:grid-cols-3">
          <li className="border-t-2 border-[#0B2545] pt-4">
            <h2 className="font-display text-lg">Brand guidelines</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#4D5C6A]">
              How to use the Peters &amp; May logo, colours and type.
            </p>
            <a
              href={BRAND_GUIDELINES_PDF}
              className="mt-3 inline-block text-sm font-medium text-[#007DC5] underline-offset-4 hover:underline"
            >
              Download the guidelines (PDF)
            </a>
          </li>
          <li className="border-t-2 border-[#0B2545] pt-4">
            <h2 className="font-display text-lg">Company boilerplate</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#4D5C6A]">
              {COMPANY_BOILERPLATE}
            </p>
            <CopyButton
              text={COMPANY_BOILERPLATE}
              label="Copy boilerplate"
              copiedLabel="Boilerplate copied"
              className="mt-3"
            />
          </li>
          <li className="border-t-2 border-[#0B2545] pt-4">
            <h2 className="font-display text-lg">Press office</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#4D5C6A]">
              For other images, interviews or comment on a story.
            </p>
            <a
              href={`mailto:${MEDIA_DESK_EMAIL}`}
              className="mt-3 inline-block text-sm font-medium text-[#007DC5] underline underline-offset-4"
            >
              {MEDIA_DESK_EMAIL}
            </a>
          </li>
        </ul>
      </section>

      <div data-tour="media-gallery" className="mx-auto max-w-6xl px-6">
        {children}
      </div>

      <NewsroomFooter />
    </div>
  );

  if (!isExternalGuest || !userKey) {
    return body;
  }

  return (
    <HubTourProvider userKey={userKey} audience="external" accessRole="media_guest">
      {body}
    </HubTourProvider>
  );
}
