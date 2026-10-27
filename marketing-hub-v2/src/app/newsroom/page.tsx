import Link from "next/link";
import type { Metadata } from "next";
import {
  getNewsroomSettings,
  listContacts,
  listPublishedPressReleases,
} from "@/lib/data/repos";
import { NewsroomHeader } from "@/components/pr/NewsroomHeader";
import { COLORS } from "@/lib/brand/tokens";
import { primaryImageUrl } from "@/lib/data/normalize";
import { plainTextFromHtml } from "@/lib/plain-text";
import { isPressContact } from "@/lib/pr/pitch-eml";

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

export default async function NewsroomPage() {
  const [settings, releases, contacts] = await Promise.all([
    getNewsroomSettings(),
    listPublishedPressReleases(),
    listContacts(),
  ]);

  const pinned = releases.filter((r) => r.pin_homepage);
  const featured = pinned[0] ?? releases[0] ?? null;
  const slider = releases.filter((r) => r.in_slider);
  const rest = releases.filter((r) => r.id !== featured?.id);
  const spokespeople = contacts
    .filter((c) => c.is_spokesperson && !isPressContact(c))
    .filter((c) => c.email || c.phone);

  const accent = settings.theme_color || COLORS.pmBlue.hex;
  const featuredImage =
    primaryImageUrl(featured?.asset_url) || settings.background_url || "";

  return (
    <div className="min-h-screen bg-white text-brand">
      <NewsroomHeader
        settings={settings}
        heading
        trailing={
          <nav className="flex items-center gap-4 text-sm">
            <a href="#news" className="text-muted hover:text-brand">
              News
            </a>
            <Link href="/media" className="text-muted hover:text-brand">
              Media kit
            </Link>
          </nav>
        }
      />

      {featured ? (
        <Link
          href={`/newsroom/${featured.id}`}
          className="relative block overflow-hidden"
          style={{
            background: featuredImage
              ? undefined
              : `linear-gradient(135deg, ${COLORS.deepNavy.hex}, ${COLORS.ensignNavy.hex})`,
            backgroundImage: featuredImage ? `url(${featuredImage})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {featuredImage ? <div className="absolute inset-0 bg-brand/25" /> : null}
          <div className="relative mx-auto max-w-5xl px-6 py-16 md:py-24">
            <div className="max-w-xl rounded-xl bg-white p-6 shadow-lg md:p-8">
              <span
                className="inline-block rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-white"
                style={{ background: accent }}
              >
                News
              </span>
              <h2 className="mt-3 font-display text-2xl leading-tight md:text-3xl">
                {featured.title}
              </h2>
              {featured.caption ? (
                <p className="mt-3 text-sm leading-relaxed text-brand/80">
                  {plainTextFromHtml(featured.caption).slice(0, 220)}
                  {plainTextFromHtml(featured.caption).length > 220 ? "…" : ""}
                </p>
              ) : null}
              <p className="mt-4 text-xs text-muted">
                Published{" "}
                {(featured.due_date || featured.updated_at || "").slice(0, 10)}
                {featured.owner ? ` · ${featured.owner}` : ""}
              </p>
              <p className="mt-4 text-sm font-medium text-accent">Read the release</p>
            </div>
          </div>
        </Link>
      ) : null}

      <main className="mx-auto max-w-5xl px-6 py-12">
        {slider.length > 0 ? (
          <section className="mb-12" aria-label="Slider">
            <h2 className="font-display text-2xl">Highlights</h2>
            <ul className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {slider.map((r) => (
                <li key={r.id} className="min-w-[16rem] max-w-xs flex-1">
                  <Link
                    href={`/newsroom/${r.id}`}
                    className="block h-full rounded-xl border border-brand/10 p-4 hover:border-accent"
                  >
                    <h3 className="font-display text-lg leading-snug">{r.title}</h3>
                    <p className="mt-2 text-xs text-muted">
                      {(r.due_date || r.updated_at || "").slice(0, 10)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section id="news">
          <h2 className="font-display text-2xl">Latest releases</h2>
          {rest.length === 0 && !featured ? (
            <p className="mt-4 text-sm text-muted">
              No published press releases yet.
            </p>
          ) : (
            <ul className="mt-6 grid gap-6 sm:grid-cols-2">
              {(featured ? rest : releases).map((r) => {
                const image = primaryImageUrl(r.asset_url);
                return (
                  <li key={r.id}>
                    <Link
                      href={`/newsroom/${r.id}`}
                      className="block overflow-hidden rounded-xl border border-brand/10 bg-mist/40 hover:border-accent"
                    >
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={image}
                          alt=""
                          className="aspect-[16/9] w-full object-cover"
                        />
                      ) : (
                        <div className="px-4 py-8" style={{ background: accent }} />
                      )}
                      <div className="p-4">
                        <h3 className="font-display text-lg leading-snug text-brand">
                          {r.title}
                        </h3>
                        <p className="mt-2 text-sm text-muted">
                          {(r.due_date || r.updated_at || "").slice(0, 10)}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-16 max-w-3xl">
          <h2 className="font-display text-2xl">{settings.title}</h2>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-brand/90">
            {settings.homepage_greetings}
          </p>
          {settings.description ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {settings.description.includes("www.petersandmay.com") ? (
                <>
                  {settings.description.split("www.petersandmay.com")[0]}
                  <a
                    href="https://www.petersandmay.com"
                    className="text-accent underline"
                  >
                    www.petersandmay.com
                  </a>
                  {settings.description.split("www.petersandmay.com")[1]}
                </>
              ) : (
                settings.description
              )}
            </p>
          ) : null}
        </section>

        {spokespeople.length > 0 ? (
          <section className="mt-16">
            <h2 className="font-display text-2xl">Spokespeople</h2>
            <p className="mt-2 text-sm text-muted">
              Peters &amp; May contacts for media enquiries.
            </p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {spokespeople.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-brand/10 p-4 text-sm"
                >
                  <div className="font-medium text-brand">{c.name}</div>
                  <div className="text-muted">
                    {[c.role, c.organisation].filter(Boolean).join(", ")}
                  </div>
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="mt-2 block text-accent underline"
                    >
                      {c.email}
                    </a>
                  ) : null}
                  {c.phone ? (
                    <a href={`tel:${c.phone}`} className="mt-1 block text-muted">
                      {c.phone}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-brand/10 py-8 text-center text-xs text-muted">
        <a
          href="https://www.petersandmay.com"
          className="text-accent underline"
        >
          www.petersandmay.com
        </a>
        <span> · </span>
        <Link href="/login" className="underline">
          Staff login
        </Link>
      </footer>
    </div>
  );
}
