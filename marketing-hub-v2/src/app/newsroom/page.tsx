import Link from "next/link";
import type { Metadata } from "next";
import {
  getNewsroomSettings,
  listContacts,
  listPublishedPressReleases,
} from "@/lib/data/repos";
import { COLORS } from "@/lib/brand/tokens";
import { plainTextFromHtml } from "@/lib/plain-text";
import { isPressContact } from "@/lib/pr/pitch-eml";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getNewsroomSettings();
  return {
    title: settings.seo_title || settings.title,
    description: settings.seo_description,
    keywords: settings.seo_keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  };
}

export default async function NewsroomPage() {
  const [settings, releases, contacts] = await Promise.all([
    getNewsroomSettings(),
    listPublishedPressReleases(),
    listContacts(),
  ]);

  const featured = releases[0] ?? null;
  const rest = releases.slice(1);
  const spokespeople = contacts
    .filter(isPressContact)
    .filter((c) => c.email || c.phone)
    .slice(0, 6);

  const accent = settings.theme_color || COLORS.pmBlue.hex;

  return (
    <div className="min-h-screen bg-white text-brand">
      <header className="border-b border-brand/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Peters &amp; May
            </p>
            <h1 className="font-display text-2xl tracking-tight md:text-3xl">
              {settings.title}
            </h1>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <a href="#news" className="text-muted hover:text-brand">
              News
            </a>
            <Link href="/media" className="text-muted hover:text-brand">
              Media kit
            </Link>
          </nav>
        </div>
      </header>

      {featured ? (
        <section
          className="relative overflow-hidden"
          style={{
            background: settings.background_url
              ? undefined
              : `linear-gradient(135deg, ${COLORS.deepNavy.hex}, ${COLORS.ensignNavy.hex})`,
            backgroundImage: settings.background_url
              ? `url(${settings.background_url})`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
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
            </div>
          </div>
        </section>
      ) : null}

      <main className="mx-auto max-w-5xl px-6 py-12">
        <section id="news">
          <h2 className="font-display text-2xl">Latest releases</h2>
          {rest.length === 0 && !featured ? (
            <p className="mt-4 text-sm text-muted">
              No published press releases yet.
            </p>
          ) : (
            <ul className="mt-6 grid gap-6 sm:grid-cols-2">
              {(featured ? rest : releases).map((r) => (
                <li
                  key={r.id}
                  className="overflow-hidden rounded-xl border border-brand/10 bg-mist/40"
                >
                  <div
                    className="px-4 py-8 text-white"
                    style={{ background: accent }}
                  >
                    <h3 className="font-display text-lg leading-snug">
                      {r.title}
                    </h3>
                  </div>
                  <div className="p-4 text-sm text-muted">
                    {(r.due_date || r.updated_at || "").slice(0, 10)}
                  </div>
                </li>
              ))}
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
              {settings.description}
            </p>
          ) : null}
        </section>

        {spokespeople.length > 0 ? (
          <section className="mt-16">
            <h2 className="font-display text-2xl">Media contacts</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {spokespeople.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-brand/10 p-4 text-sm"
                >
                  <div className="font-medium text-brand">{c.name}</div>
                  <div className="text-muted">
                    {[c.role, c.organisation || c.outlet]
                      .filter(Boolean)
                      .join(" at ")}
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
        Peters &amp; May — Group Marketing ·{" "}
        <Link href="/login" className="underline">
          Staff login
        </Link>
      </footer>
    </div>
  );
}
