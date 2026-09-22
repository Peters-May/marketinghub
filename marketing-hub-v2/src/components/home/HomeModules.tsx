"use client";

import { ModuleCard } from "@/components/ui/PageHeader";
import { useHubView } from "@/lib/hub-view";
import { navForView } from "@/lib/nav";

export function HomeModules({ supabaseReady }: { supabaseReady: boolean }) {
  const { view, canAccessBudget, budgetInMemberNav } = useHubView();
  const modules = navForView(view, { canAccessBudget, budgetInMemberNav }).filter(
    (n) => n.href !== "/app"
  );

  return (
    <>
      <p className="mb-6 text-sm text-muted">
        {view === "member"
          ? "Member view — events, partners, awards, library, Requests, and Enquiries. Switch to Admin for Content & Social, Tasks, Themes, Reporting, Budget, Contacts, and Logins."
          : view === "seo"
            ? "SEO view — Enquiries only (web and WhatsApp), including source and campaign attribution."
          : view === "external"
            ? "External view — preview the public library (logos, presentations, and gallery) that media guests see."
            : supabaseReady
              ? "Admin view — data is linked to Core Data tables in Supabase (including Tasks)."
              : "Admin view — add Supabase keys to .env.local to use live data."}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => (
          <ModuleCard
            key={item.href}
            href={item.href}
            title={item.label}
            description={item.description}
            icon={item.icon}
          />
        ))}
      </div>
    </>
  );
}
