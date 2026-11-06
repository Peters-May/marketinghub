import { redirect } from "next/navigation";
import { BudgetClient } from "@/components/budget/BudgetClient";
import { canAccessBudget } from "@/lib/auth/budget-access";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import { createDefaultBudgetMeta } from "@/lib/budget/2026";
import {
  getBudgetMeta,
  listBudgetLines,
  listBudgetPayments,
  listEvents,
  listHubUsers,
  listThemes,
} from "@/lib/data/repos";
import { isCostCurrency } from "@/lib/events/costs";
import { listAllEventCostLines } from "@/lib/events/costs-data";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import { listSupabaseHubUsers } from "@/lib/supabase/hub-users";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || !canAccessBudget(user)) {
    redirect("/app");
  }

  const [lines, payments, meta, events, themes, costLines, hubUsers] = await Promise.all([
    listBudgetLines(),
    listBudgetPayments(),
    getBudgetMeta(),
    listEvents(),
    listThemes(),
    listAllEventCostLines(),
    hasServiceRoleKey() ? listSupabaseHubUsers() : listHubUsers(),
  ]);
  const eventById = new Map(events.map((event) => [event.id, event]));

  return (
    <BudgetClient
      lines={lines}
      payments={payments}
      meta={meta ?? createDefaultBudgetMeta()}
      events={events.map((event) => ({ id: event.id, title: event.title }))}
      themes={themes.map((theme) => ({ id: theme.id, title: theme.title }))}
      eventCosts={costLines.map((line) => {
        const event = eventById.get(line.event_id);
        return {
          id: line.id,
          eventId: line.event_id,
          eventTitle: event?.title || "Event",
          startsAt: event?.starts_at ?? null,
          location: event?.location ?? "",
          category: line.category,
          description: line.description,
          amount: line.amount,
          currency: isCostCurrency(line.currency) ? line.currency : "GBP",
          staffUserId: line.staff_user_id,
          staffName: line.staff_name,
          notes: line.notes,
        };
      })}
      costEvents={events.map((event) => ({
        id: event.id,
        title: event.title,
        startsAt: event.starts_at,
        location: event.location,
      }))}
      costStaff={hubUsers
        .filter((person) => person.role === "admin" || person.role === "member")
        .map((person) => ({
          id: person.id,
          name: person.full_name || person.email,
        }))}
    />
  );
}
