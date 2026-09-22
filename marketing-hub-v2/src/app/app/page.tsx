import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { HomeModules } from "@/components/home/HomeModules";
import { HomeStats } from "@/components/home/HomeStats";
import {
  listContent,
  listEvents,
  listSponsorships,
  listTasks,
  listThemeMains,
  listThemes,
} from "@/lib/data/repos";
import { listWebEnquiries } from "@/lib/data/web-enquiries";
import { computeEnquiryStats } from "@/lib/data/web-enquiries-stats";
import { isClosedTaskStatus } from "@/lib/data/collections";
import { format } from "date-fns";
import { allowDemoAuth, DEMO_STAFF, hasSupabaseConfig } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export default async function AppHomePage() {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (user?.role === "seo") {
    redirect("/app/enquiries");
  }
  const isAdmin = user?.role === "admin";

  const [events, content, sponsorships, themes, mains, tasks, enquiries] =
    await Promise.all([
      listEvents(),
      listContent(),
      listSponsorships(),
      listThemes(),
      listThemeMains(),
      isAdmin ? listTasks() : Promise.resolve([]),
      hasServiceRoleKey()
        ? listWebEnquiries({ includeTest: false }).catch(() => [])
        : Promise.resolve([]),
    ]);
  const supabaseReady = hasSupabaseConfig();

  const upcoming = events
    .filter(
      (e) =>
        e.starts_at &&
        new Date(e.starts_at).getTime() >= Date.now() - 86400000
    )
    .slice(0, 3);
  const inFlight = content.filter((c) =>
    ["idea", "draft", "review", "approved", "scheduled"].includes(c.status)
  ).length;
  const activeSponsors = sponsorships.filter((s) =>
    ["confirmed", "active", "negotiating"].includes(s.status)
  ).length;
  const openTasks = isAdmin
    ? tasks.filter((t) => !isClosedTaskStatus(t.status)).slice(0, 5)
    : [];
  const openTaskCount = isAdmin
    ? tasks.filter((t) => !isClosedTaskStatus(t.status)).length
    : 0;
  const enquiryStats = computeEnquiryStats(enquiries);
  const newEnquiries = enquiryStats.thisWeek;

  const currentTheme =
    themes.find((t) => t.status === "active") ?? themes[0] ?? null;
  const themeMains = currentTheme
    ? mains.filter((m) => m.theme_id === currentTheme.id).slice(0, 3)
    : [];

  return (
    <div>
      <PageHeader
        title="Marketing Hub"
        description="Plan events, content, partners, and share media — without the Airtable-style builder."
      />

      {currentTheme ? (
        <div className="surface-card mb-8 overflow-hidden">
          <div className="border-b border-border bg-accent-soft/40 px-5 py-4 md:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Current theme · {currentTheme.quarter} {currentTheme.year}
                </p>
                <h2 className="mt-1 font-display text-2xl text-brand md:text-3xl">
                  {currentTheme.title}
                </h2>
                {currentTheme.summary ? (
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
                    {currentTheme.summary}
                  </p>
                ) : null}
              </div>
              <Link href="/app/themes" className="btn-secondary shrink-0">
                Open themes
              </Link>
            </div>
          </div>
          {themeMains.length > 0 ? (
            <ul className="divide-y divide-border px-5 md:px-6">
              {themeMains.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <span className="font-medium">{m.title}</span>
                  <span className="text-xs capitalize text-muted">
                    {[m.channel, m.status].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-muted md:px-6">
              No main content pieces yet — add them on Themes.
            </p>
          )}
        </div>
      ) : null}

      <HomeStats
        stats={{
          upcomingCount: upcoming.length,
          inFlight,
          activeSponsors,
          openTaskCount,
          newEnquiries,
        }}
        openTasks={openTasks.map((t) => ({
          id: t.id,
          title: t.title,
          owner: t.owner,
          due_date: t.due_date,
        }))}
      />

      {upcoming.length > 0 ? (
        <div className="surface-card mb-8 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl text-brand">Next up</h2>
            <Link href="/app/events" className="btn-secondary shrink-0 text-xs">
              All events
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {upcoming.map((e) => (
              <li key={e.id}>
                <Link
                  href="/app/events"
                  className="flex items-center justify-between py-3 text-sm transition hover:text-brand"
                >
                  <span className="font-medium">{e.title}</span>
                  <span className="text-muted">
                    {e.starts_at
                      ? format(new Date(e.starts_at), "d MMM yyyy")
                      : "Date TBD"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <HomeModules supabaseReady={supabaseReady} />
    </div>
  );
}
