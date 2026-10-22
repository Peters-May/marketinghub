import Link from "next/link";
import type { EmailOverviewRow } from "@/lib/email/overview";

export function EmailOverview({ rows }: { rows: EmailOverviewRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="surface-card mb-6 p-4">
      <h2 className="font-display text-lg text-brand">Where these emails sit</h2>
      <p className="mt-1 text-sm text-muted">
        Each row is still an email. The links show the theme, content item, or
        event it belongs to.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {rows.map((row) => {
          const links = [
            row.theme ? `Theme: ${row.theme}` : null,
            row.content ? `Content: ${row.content}` : null,
            row.event ? `Event: ${row.event}` : null,
          ].filter(Boolean);
          return (
            <li
              key={row.id}
              className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
            >
              <Link href={row.href} className="font-medium text-brand">
                {row.title}
              </Link>
              <span className="text-muted">
                {links.length > 0 ? links.join(" · ") : "Not linked yet"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
