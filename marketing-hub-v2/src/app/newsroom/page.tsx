import Link from "next/link";
import type { Metadata } from "next";
import {
  getNewsroomSettings,
  listContacts,
  listPublishedPressReleases,
} from "@/lib/data/repos";
import { NewsroomHeader } from "@/components/pr/NewsroomHeader";
import { NewsroomFooter } from "@/components/newsroom/NewsroomFooter";
import { ReleaseRegister } from "@/components/newsroom/ReleaseRegister";
import { CopyButton } from "@/components/newsroom/CopyButton";
import { COMPANY_BOILERPLATE } from "@/lib/brand/factsheet";
import { primaryImageUrl } from "@/lib/data/normalize";
import {
  BRAND_GUIDELINES_PDF,
  MEDIA_DESK_EMAIL,
  newsroomSpokespeople,
  releaseDateIso,
  releaseSummary,
  releaseTopics,
  shortReleaseDate,
  topicIndex,
  topicSlug,
} from "@/lib/pr/newsroom-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getNewsroomSettings();
  const title = settings.seo_title || settings.title;
  return {
    title: { absolute: title },
    description: settings.seo_description,
    keywords: settings.seo_keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    icons: settings.favicon_url
      ? { icon: settings.favicon_url, apple: settings.favicon_url }
      : undefined,
  };
}

function linkifySite(text: string) {
  const site = "www.petersandmay.com";
  if (!text.includes(site)) return text;
  const [before, after] = text.split(site);
  return (
    <>
      {before}
      <a href="https://www.petersandmay.com" className="text-[#007DC5] underline underline-offset-4">
        {site}
      </a>
      {after}
    </>
  );
}

export default async function NewsroomPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = (await searchParams) ?? {};
  const topicParam = typeof query.topic === "string" ? query.topic : "";

  const [settings, releases, contacts] = await Promise.all([
    getNewsroomSettings(),
    listPublishedPressReleases(),
    listContacts(),
  ]);

  const pinned = releases.filter((r) => r.pin_homepage);
  const lead = pinned[0] ?? releases[0] ?? null;
  const inFocus = releases
    .filter((r) => r.in_slider && r.id !== lead?.id)
    .slice(0, 3);
  const topics = topicIndex(releases);
  const activeTopic = topics.find((t) => t.slug === topicParam) ?? null;
  const register = activeTopic
    ? releases.filter((r) =>
        releaseTopics(r).some((t) => topicSlug(t) === activeTopic.slug)
      )
    : releases.filter((r) => r.id !== lead?.id);
  const spokespeople = newsroomSpokespeople(contacts);
  const leadImage =
    primaryImageUrl(lead?.asset_url) || settings.background_url || "";

  return (
    <div className="min-h-screen bg-white text-[#0B2545]">
      <NewsroomHeader settings={settings} active="news" />

      {/* Masthead: who we are, and how to reach the press office */}
      <section className="bg-[#0B2545] text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[minmax(0,1fr)_22rem] md:items-end md:py-20">
          <div>
            <h1 className="font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
              {settings.title}
            </h1>
            <p className="mt-5 max-w-[48ch] text-lg leading-relaxed text-white/80">
              {settings.homepage_greetings}
            </p>
          </div>
          <div className="border-l-2 border-[#007DC5] bg-white/[0.06] p-6">
            <h2 className="font-display text-xl">Press office</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              For interviews, comment, images and background on any release.
            </p>
            <a
              href={`mailto:${MEDIA_DESK_EMAIL}`}
              className="mt-4 inline-block font-medium text-white underline underline-offset-4 hover:text-white/80"
            >
              {MEDIA_DESK_EMAIL}
            </a>
            <div className="mt-5">
              <Link
                href="/media"
                className="inline-flex rounded-sm bg-white px-4 py-2 text-sm font-medium text-[#0B2545] hover:bg-[#E3E6E9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Open the media kit
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Lead release */}
      {lead && !activeTopic ? (
        <section aria-labelledby="lead-title" className="border-b border-[#E3E6E9]">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-2 md:items-center md:gap-12">
            {leadImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={leadImage}
                alt=""
                className="aspect-[3/2] w-full rounded-sm object-cover"
              />
            ) : (
              <div className="aspect-[3/2] w-full rounded-sm bg-[#1B3A5B]" aria-hidden />
            )}
            <div>
              <p className="text-sm text-[#4D5C6A]">
                Latest release,{" "}
                <time dateTime={releaseDateIso(lead)}>
                  {shortReleaseDate(releaseDateIso(lead))}
                </time>
              </p>
              <h2
                id="lead-title"
                className="mt-3 font-display text-3xl leading-tight md:text-4xl"
              >
                {lead.title}
              </h2>
              {releaseSummary(lead, 260) ? (
                <p className="mt-4 max-w-[60ch] leading-relaxed text-[#4D5C6A]">
                  {releaseSummary(lead, 260)}
                </p>
              ) : null}
              <Link
                href={`/newsroom/${lead.id}`}
                className="mt-6 inline-flex rounded-sm bg-[#0B2545] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1B3A5B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007DC5]"
              >
                Read the release
              </Link>
            </div>
          </div>
          {inFocus.length ? (
            <div className="mx-auto max-w-6xl px-6 pb-12">
              <h2 className="font-display text-lg">In focus</h2>
              <ul className="mt-4 grid gap-6 border-t border-[#E3E6E9] pt-4 sm:grid-cols-3">
                {inFocus.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/newsroom/${r.id}`}
                      className="block font-display text-lg leading-snug hover:text-[#007DC5]"
                    >
                      {r.title}
                    </Link>
                    <time
                      dateTime={releaseDateIso(r)}
                      className="mt-2 block text-sm text-[#4D5C6A]"
                    >
                      {shortReleaseDate(releaseDateIso(r))}
                    </time>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <main className="mx-auto grid max-w-6xl gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section id="releases" aria-labelledby="releases-title" className="scroll-mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[#0B2545] pb-3">
            <h2 id="releases-title" className="font-display text-2xl">
              {activeTopic ? activeTopic.topic : "Press releases"}
            </h2>
            <p className="text-sm text-[#4D5C6A]">
              {activeTopic
                ? `${register.length} ${register.length === 1 ? "release" : "releases"}`
                : `${releases.length} ${releases.length === 1 ? "release" : "releases"} in total`}
            </p>
          </div>

          {topics.length > 1 ? (
            <nav aria-label="Filter by topic" className="mt-5">
              <ul className="flex flex-wrap gap-2">
                <li>
                  <Link
                    href="/newsroom#releases"
                    aria-current={!activeTopic ? "true" : undefined}
                    className={`inline-flex rounded-sm border px-3 py-1.5 text-sm ${
                      !activeTopic
                        ? "border-[#0B2545] bg-[#0B2545] text-white"
                        : "border-[#D5D9DE] text-[#0B2545] hover:border-[#0B2545]"
                    }`}
                  >
                    All releases
                  </Link>
                </li>
                {topics.slice(0, 10).map((t) => {
                  const current = activeTopic?.slug === t.slug;
                  return (
                    <li key={t.slug}>
                      <Link
                        href={`/newsroom?topic=${t.slug}#releases`}
                        aria-current={current ? "true" : undefined}
                        className={`inline-flex rounded-sm border px-3 py-1.5 text-sm ${
                          current
                            ? "border-[#0B2545] bg-[#0B2545] text-white"
                            : "border-[#D5D9DE] text-[#0B2545] hover:border-[#0B2545]"
                        }`}
                      >
                        {t.topic}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}

          {register.length ? (
            <div className="mt-2">
              <ReleaseRegister releases={register} />
            </div>
          ) : (
            <p className="mt-8 max-w-[60ch] text-[#4D5C6A]">
              {releases.length
                ? "No other releases yet. The latest release is shown above."
                : `No press releases have been published yet. For news and comment, email ${MEDIA_DESK_EMAIL}.`}
            </p>
          )}
        </section>

        <aside className="space-y-8 lg:sticky lg:top-6 lg:self-start">
          <section aria-labelledby="kit-title" className="bg-[#E3E6E9]/50 p-6">
            <h2 id="kit-title" className="font-display text-lg">
              Media kit
            </h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link href="/media" className="font-medium text-[#007DC5] underline-offset-4 hover:underline">
                  Logos, images and presentations
                </Link>
              </li>
              <li>
                <a
                  href={BRAND_GUIDELINES_PDF}
                  className="font-medium text-[#007DC5] underline-offset-4 hover:underline"
                >
                  Brand guidelines (PDF)
                </a>
              </li>
              <li>
                <CopyButton
                  text={COMPANY_BOILERPLATE}
                  label="Copy company boilerplate"
                  copiedLabel="Boilerplate copied"
                />
              </li>
            </ul>
          </section>

          <section id="press-office" aria-labelledby="contacts-title" className="scroll-mt-6">
            <h2 id="contacts-title" className="font-display text-lg">
              Press contacts
            </h2>
            <div className="mt-4 border-t border-[#E3E6E9] pt-4 text-sm">
              <p className="font-medium">Media desk</p>
              <a
                href={`mailto:${MEDIA_DESK_EMAIL}`}
                className="mt-1 block text-[#007DC5] underline underline-offset-4"
              >
                {MEDIA_DESK_EMAIL}
              </a>
            </div>
            {spokespeople.map((c) => (
              <div key={c.id} className="mt-4 border-t border-[#E3E6E9] pt-4 text-sm">
                <p className="font-medium">{c.name}</p>
                {[c.role, c.organisation].filter(Boolean).length ? (
                  <p className="text-[#4D5C6A]">
                    {[c.role, c.organisation].filter(Boolean).join(", ")}
                  </p>
                ) : null}
                {c.email ? (
                  <a
                    href={`mailto:${c.email}`}
                    className="mt-1 block break-words text-[#007DC5] underline underline-offset-4"
                  >
                    {c.email}
                  </a>
                ) : null}
                {c.phone ? (
                  <a href={`tel:${c.phone}`} className="mt-1 block text-[#4D5C6A]">
                    {c.phone}
                  </a>
                ) : null}
              </div>
            ))}
          </section>
        </aside>
      </main>

      <section aria-labelledby="about-title" className="mx-auto max-w-6xl px-6">
        <div className="grid gap-6 border-t-2 border-[#0B2545] pt-8 md:grid-cols-[20rem_minmax(0,1fr)]">
          <h2 id="about-title" className="font-display text-2xl">
            About Peters &amp; May
          </h2>
          <div className="max-w-[65ch] space-y-4 leading-relaxed text-[#4D5C6A]">
            {settings.description ? (
              <p className="whitespace-pre-wrap">{linkifySite(settings.description)}</p>
            ) : (
              <p>{COMPANY_BOILERPLATE}</p>
            )}
          </div>
        </div>
      </section>

      <NewsroomFooter />
    </div>
  );
}
