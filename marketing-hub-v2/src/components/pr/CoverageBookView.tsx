import type { PrCoverageReport } from "@/lib/types";
import {
  formatCoverageMetric,
  groupCoverageReportItemsByChannel,
  summarizeCoverageReportItems,
} from "@/lib/pr/coverage-report";

function outletInitials(outlet: string, title: string): string {
  const source = (outlet || title || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function CoverageBookView({
  report,
  compact = false,
}: {
  report: PrCoverageReport;
  compact?: boolean;
}) {
  const items = [...report.items].sort((a, b) => a.sort_order - b.sort_order);
  const metrics = summarizeCoverageReportItems(items);
  const sections = groupCoverageReportItemsByChannel(items);
  const collage = items.filter((item) => item.screenshot_url).slice(0, 6);
  const collageFallback = items.slice(0, 6);

  return (
    <article
      className={`coverage-book bg-white text-[#0B2545] ${
        compact ? "text-sm" : ""
      }`}
    >
      <header className="relative overflow-hidden bg-[#0B2545] px-6 pb-16 pt-10 text-white md:px-10 md:pb-24 md:pt-14">
        <p className="text-xs uppercase tracking-[0.2em] text-white/70">
          Peters &amp; May · Coverage
        </p>
        <h1
          className={`mx-auto mt-6 max-w-4xl text-center font-display font-semibold leading-tight ${
            compact ? "text-2xl" : "text-3xl md:text-5xl"
          }`}
        >
          {report.title}
        </h1>
        {report.summary ? (
          <p className="mx-auto mt-4 max-w-2xl text-center text-white/80">
            {report.summary}
          </p>
        ) : null}

        <div
          className={`relative mx-auto mt-10 grid max-w-5xl gap-3 ${
            compact
              ? "grid-cols-3"
              : "grid-cols-2 sm:grid-cols-3 md:grid-cols-3"
          }`}
        >
          {(collage.length ? collage : collageFallback).map((item, index) => (
            <div
              key={`${item.coverage_id}-${index}`}
              className={`overflow-hidden rounded-xl bg-white/10 shadow-lg ring-1 ring-white/10 ${
                index === 0 && !compact ? "sm:row-span-2" : ""
              }`}
            >
              {item.screenshot_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.screenshot_url}
                  alt=""
                  className={`w-full object-cover ${
                    compact ? "h-24" : index === 0 ? "h-full min-h-48" : "h-40"
                  }`}
                />
              ) : (
                <div
                  className={`flex items-center justify-center bg-[#1B3A5B] font-display text-white/90 ${
                    compact ? "h-24 text-lg" : "h-40 text-2xl"
                  }`}
                >
                  {outletInitials(item.outlet, item.title)}
                </div>
              )}
            </div>
          ))}
        </div>
      </header>

      <section className="-mt-8 px-6 md:px-10">
        <div className="mx-auto grid max-w-5xl gap-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-black/5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              value: String(metrics.pieces),
              label: "Pieces of coverage",
              hint: "Online, offline and social clips in this report",
            },
            {
              value: formatCoverageMetric(metrics.estimatedViews),
              label: "Estimated views",
              hint: "Sum of estimated views entered for clips",
            },
            {
              value: formatCoverageMetric(metrics.audience),
              label: "Audience",
              hint: "Combined publication audience figures entered",
            },
            {
              value:
                metrics.avgDomainAuthority == null
                  ? "—"
                  : String(metrics.avgDomainAuthority),
              label: "Avg. domain authority",
              hint: "Average of domain authority scores entered",
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-[#E3E6E9]/40 px-4 py-3">
              <div className="font-display text-3xl text-[#0B2545]">
                {stat.value}
              </div>
              <div className="mt-1 text-sm font-medium">{stat.label}</div>
              <p className="mt-1 text-xs text-[#1B3A5B]/70">{stat.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-12 px-6 py-12 md:px-10">
        {sections.length === 0 ? (
          <p className="text-center text-[#1B3A5B]/70">
            No clips in this coverage book yet.
          </p>
        ) : (
          sections.map((section) => (
            <section key={section.channel}>
              <div className="mb-6 flex items-end justify-between gap-3 border-b border-[#0B2545]/10 pb-3">
                <h2 className="font-display text-2xl text-[#0B2545]">
                  {section.label}
                </h2>
                <span className="text-sm text-[#1B3A5B]/70">
                  {section.items.length}{" "}
                  {section.items.length === 1 ? "piece" : "pieces"}
                </span>
              </div>
              <ul className="space-y-6">
                {section.items.map((item) => (
                  <li
                    key={item.coverage_id}
                    className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]"
                  >
                    <div className="overflow-hidden rounded-xl bg-[#E3E6E9]">
                      {item.screenshot_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.screenshot_url}
                          alt=""
                          className="aspect-[4/5] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[4/5] items-center justify-center font-display text-3xl text-[#0B2545]/40">
                          {outletInitials(item.outlet, item.title)}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col justify-center">
                      <p className="text-xs uppercase tracking-wide text-[#007DC5]">
                        {item.outlet || "Outlet"}
                      </p>
                      <h3 className="mt-2 font-display text-xl leading-snug text-[#0B2545]">
                        {item.title}
                      </h3>
                      {item.published_at ? (
                        <p className="mt-2 text-sm text-[#1B3A5B]/70">
                          {item.published_at.slice(0, 10)}
                        </p>
                      ) : null}
                      {item.notes ? (
                        <p className="mt-3 text-sm leading-relaxed text-[#1B3A5B]">
                          {item.notes}
                        </p>
                      ) : null}
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex text-sm font-medium text-[#007DC5] underline-offset-2 hover:underline"
                        >
                          Open coverage
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

    </article>
  );
}
