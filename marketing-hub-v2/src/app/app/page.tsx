import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader } from "@/components/ui/PageHeader";
import { AiKeyReminder } from "@/components/admin/AiKeyReminder";
import { HomeModules } from "@/components/home/HomeModules";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { HomeNotifications } from "@/components/home/HomeNotifications";
import { buildDashboard } from "@/lib/dashboard/build";
import {
  listAllAttendance,
  listAwards,
  listBudgetLines,
  listBudgetPayments,
  listContent,
  listEmailCampaigns,
  listEvents,
  listTasks,
  listThemeMains,
  listThemes,
} from "@/lib/data/repos";
import { pickCurrentTheme } from "@/lib/themes/calendar";
import { listWebEnquiries } from "@/lib/data/web-enquiries";
import { computeBudgetTotals } from "@/lib/budget/totals";
import { backfillOwnerUserIds } from "@/lib/identity/owners";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { canAccessBudget } from "@/lib/auth/budget-access";
import { getSessionUser } from "@/lib/auth/session";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import { getAiKeyPublicStatus } from "@/lib/ai/ai-key";

export default async function AppHomePage() {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (user?.role === "seo") {
    redirect("/app/enquiries");
  }
  const isAdmin = user?.role === "admin";
  const viewer = {
    id: user?.id ?? "",
    fullName: user?.full_name || user?.email || "",
    isAdmin,
  };
  const showBudget = canAccessBudget(user);

  await backfillOwnerUserIds().catch((err) => {
    console.error("[home] owner backfill failed", err);
  });

  const [events, content, tasks, attendance, awards, themes, mains, enquiries, emails, lines, payments, aiKey] =
    await Promise.all([
      listEvents(),
      listContent(),
      listTasks(),
      listAllAttendance(),
      listAwards(),
      listThemes(),
      listThemeMains(),
      hasServiceRoleKey()
        ? listWebEnquiries({
            includeTest: false,
            limit: 5,
            needsReview: true,
          }).catch(() => [])
        : Promise.resolve([]),
      isAdmin ? listEmailCampaigns().catch(() => []) : Promise.resolve([]),
      showBudget ? listBudgetLines().catch(() => []) : Promise.resolve([]),
      showBudget ? listBudgetPayments().catch(() => []) : Promise.resolve([]),
      isAdmin ? getAiKeyPublicStatus() : Promise.resolve(null),
    ]);

  const budget = showBudget ? computeBudgetTotals(lines, payments) : null;
  const shared = {
    now: new Date(),
    viewer,
    tasks,
    content,
    events,
    attendance,
    awards,
    enquiries,
    emails,
    budget,
  };
  const mine = buildDashboard({ ...shared, scope: "mine" });
  const everyone = isAdmin
    ? buildDashboard({ ...shared, scope: "everyone" })
    : null;
  const greeting = viewer.fullName.split(/\s+/)[0] || "there";
  const currentTheme = pickCurrentTheme(themes);
  const themeMains = currentTheme
    ? mains.filter((item) => item.theme_id === currentTheme.id).slice(0, 3)
    : [];

  return (
    <div>
      <PageHeader
        title={`Good ${partOfDay()}, ${greeting}`}
        description={format(new Date(), "EEEE d MMMM yyyy")}
      />

      {aiKey ? <AiKeyReminder status={aiKey} /> : null}

      {currentTheme ? (
        <div className="surface-card mb-8 flex overflow-hidden">
          <div className="w-1.5 shrink-0 bg-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 md:px-6">
              <div className="min-w-0">
                <p className="inline-flex rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
                  {currentTheme.quarter} {currentTheme.year}
                </p>
                <h2 className="mt-2 font-display text-2xl text-brand md:text-3xl">
                  {currentTheme.title}
                </h2>
                {currentTheme.summary ? (
                  <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-relaxed text-muted">
                    {currentTheme.summary}
                  </p>
                ) : null}
              </div>
              {isAdmin ? (
                <Link href="/app/themes" className="btn-secondary shrink-0">
                  Open themes
                </Link>
              ) : null}
            </div>
            {themeMains.length > 0 ? (
              <ul className="flex flex-wrap gap-2 px-5 pb-5 md:px-6">
                {themeMains.map((item) => (
                  <li
                    key={item.id}
                    className="inline-flex max-w-full items-center gap-2 rounded-full bg-background px-3 py-1.5 text-sm ring-1 ring-border"
                  >
                    <span className="truncate font-medium">{item.title}</span>
                    {item.channel ? (
                      <span className="text-xs text-muted">{item.channel}</span>
                    ) : null}
                    {item.status ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium capitalize text-brand">
                        {item.status}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-sm text-muted md:px-6">
                No main pieces yet.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <HomeNotifications />
      <HomeDashboard mine={mine} everyone={everyone} canToggle={isAdmin} />

      <div className="mt-8">
        <HomeModules />
      </div>
    </div>
  );
}

function partOfDay() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Europe/London",
    }).format(new Date())
  );
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
