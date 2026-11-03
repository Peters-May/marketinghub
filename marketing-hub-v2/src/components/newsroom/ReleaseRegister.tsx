import Link from "next/link";
import type { ContentItem } from "@/lib/types";
import { primaryImageUrl } from "@/lib/data/normalize";
import {
  releaseDateIso,
  releaseSummary,
  releaseTopics,
  shortReleaseDate,
} from "@/lib/pr/newsroom-view";

/** Chronological list of releases: date, headline, summary, thumbnail. */
export function ReleaseRegister({
  releases,
  showSummary = true,
}: {
  releases: ContentItem[];
  showSummary?: boolean;
}) {
  return (
    <ol className="divide-y divide-[#E3E6E9] border-b border-[#E3E6E9]">
      {releases.map((r) => {
        const iso = releaseDateIso(r);
        const image = primaryImageUrl(r.asset_url);
        const topics = releaseTopics(r);
        const summary = showSummary ? releaseSummary(r, 180) : "";
        return (
          <li key={r.id}>
            <article className="group relative grid grid-cols-1 gap-x-6 gap-y-2 py-6 sm:grid-cols-[7rem_minmax(0,1fr)_8.5rem]">
              <time
                dateTime={iso}
                className="pt-1 text-sm font-medium text-[#0B2545]"
              >
                {shortReleaseDate(iso)}
              </time>
              <div className="min-w-0">
                <h3 className="font-display text-xl leading-snug text-[#0B2545]">
                  <Link
                    href={`/newsroom/${r.id}`}
                    className="after:absolute after:inset-0 group-hover:text-[#007DC5] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[#007DC5]"
                  >
                    {r.title}
                  </Link>
                </h3>
                {summary ? (
                  <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-[#4D5C6A]">
                    {summary}
                  </p>
                ) : null}
                {topics.length ? (
                  <p className="mt-3 text-xs text-[#6B737D]">
                    {topics.slice(0, 3).join(", ")}
                  </p>
                ) : null}
              </div>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  className="hidden aspect-[4/3] w-full rounded-sm object-cover sm:block"
                />
              ) : (
                <span className="hidden sm:block" aria-hidden />
              )}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
