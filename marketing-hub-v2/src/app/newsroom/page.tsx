import Link from "next/link";
import { listPublishedPressReleases } from "@/lib/data/repos";
import { COLORS, BRAND_PROMISE } from "@/lib/brand/tokens";
import { plainTextFromHtml } from "@/lib/plain-text";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Newsroom | Peters & May",
  description:
    "Press releases and media resources from Peters & May — bespoke logistics.",
};

export default async function NewsroomPage() {
  const releases = await listPublishedPressReleases();

  return (
    <div
      className="min-h-screen"
      style={{
        background: `linear-gradient(180deg, ${COLORS.deepNavy.hex} 0%, ${COLORS.ensignNavy.hex} 42%, ${COLORS.mist.hex} 42%)`,
        color: COLORS.ensignNavy.hex,
      }}
    >
      <header className="mx-auto max-w-3xl px-6 pb-16 pt-14 text-white">
        <p className="text-sm uppercase tracking-[0.2em] text-white/70">
          Peters &amp; May
        </p>
        <h1
          className="mt-3 font-display text-4xl tracking-tight md:text-5xl"
          style={{ fontFamily: "var(--font-display), League Spartan, sans-serif" }}
        >
          Newsroom
        </h1>
        <p className="mt-4 max-w-xl text-base text-white/85">
          {BRAND_PROMISE}. Press releases and media contacts for journalists.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/media"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-[color:var(--brand,#0B2545)]"
            style={{ color: COLORS.ensignNavy.hex }}
          >
            Media kit &amp; gallery
          </Link>
          <a
            href="mailto:marketing@petersandmay.com"
            className="rounded-lg border border-white/40 px-4 py-2 text-sm text-white"
          >
            marketing@petersandmay.com
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20">
        <section className="rounded-2xl bg-white p-6 shadow-sm md:p-8">
          <h2 className="font-display text-2xl text-brand">Press releases</h2>
          {releases.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              No published press releases yet. Staff can publish PR content from
              the Marketing Hub.
            </p>
          ) : (
            <ul className="mt-6 space-y-6">
              {releases.map((r) => (
                <li
                  key={r.id}
                  className="border-t border-brand/10 pt-6 first:border-t-0 first:pt-0"
                >
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {(r.due_date || r.updated_at || "").slice(0, 10)}
                  </p>
                  <h3 className="mt-1 font-display text-xl text-brand">
                    {r.title}
                  </h3>
                  {r.caption ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-brand/90">
                      {plainTextFromHtml(r.caption)}
                    </p>
                  ) : null}
                  {r.website ? (
                    <a
                      href={r.website}
                      className="mt-2 inline-block text-sm text-accent underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Related link
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-8 text-center text-xs text-brand/60">
          Peters &amp; May — Group Marketing ·{" "}
          <Link href="/login" className="underline">
            Staff login
          </Link>
        </p>
      </main>
    </div>
  );
}
