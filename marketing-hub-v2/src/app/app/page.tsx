import { redirect } from "next/navigation";
import { format } from "date-fns";
import { PageHeader } from "@/components/ui/PageHeader";
import { AiKeyReminder } from "@/components/admin/AiKeyReminder";
import { HomeModules } from "@/components/home/HomeModules";
import { HomeDashboard } from "@/components/home/HomeDashboard";
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
} from "@/lib/data/repos";
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

  const [events, content, tasks, attendance, awards, enquiries, emails, lines, payments, aiKey] =
    await Promise.all([
      listEvents(),
      listContent(),
      listTasks(),
      listAllAttendance(),
      listAwards(),
      hasServiceRoleKey()
        ? listWebEnquiries({ includeTest: false }).catch(() => [])
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

  return (
    <div>
      <PageHeader
        title={`Good ${partOfDay()}, ${greeting}`}
        description={format(new Date(), "EEEE d MMMM yyyy")}
      />

      {aiKey ? <AiKeyReminder status={aiKey} /> : null}

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
