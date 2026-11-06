"use client";

import { ModuleCard } from "@/components/ui/PageHeader";
import { useHubView } from "@/lib/hub-view";
import { navForView } from "@/lib/nav";

export function HomeModules() {
  const { view, canAccessBudget, budgetInMemberNav, chatInMemberNav } =
    useHubView();
  const modules = navForView(view, {
    canAccessBudget,
    budgetInMemberNav,
    chatInMemberNav,
  }).filter((n) => n.href !== "/app");

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {modules.map((item) => (
        <ModuleCard
          key={item.href}
          href={item.href}
          title={item.label}
          description={item.description}
          icon={item.icon}
          compact
        />
      ))}
    </div>
  );
}
