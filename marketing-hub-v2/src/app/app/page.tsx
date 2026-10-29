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
import { allowDemoAuth, DEMO_STAFF, hasSupabaseConfig } from "@/lib/auth/config";
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
              {isAdmin ? (
                <Link href="/app/themes" className="btn-secondary shrink-0">
                  Open themes
                </Link>
              ) : null}
            </div>
          </div>
          {themeMains.length > 0 ? (
            <ul className="divide-y divide-border px-5 md:px-6">
              {themeMains.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <span className="font-medium">{item.title}</span>
                  <span className="text-xs capitalize text-muted">
                    {[item.channel, item.status].filter(Boolean).join(" · ")}
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

      <HomeNotifications />
      <HomeDashboard mine={mine} everyone={everyone} canToggle={isAdmin} />

      <div className="mt-8">
        <HomeModules supabaseReady={hasSupabaseConfig()} />
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
