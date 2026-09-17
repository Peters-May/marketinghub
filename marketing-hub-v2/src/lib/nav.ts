import type { LucideIcon } from "lucide-react";
import {
  Award,
  BarChart3,
  CalendarDays,
  CheckSquare,
  Clapperboard,
  Contact,
  Handshake,
  Home,
  Inbox,
  Library,
  KeyRound,
  MessageSquarePlus,
  Megaphone,
  Settings,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

export type HubViewMode = "admin" | "member" | "external";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Shown in member (daily) view when true; admin always sees all. */
  member?: boolean;
  /** Shown in external (media guest) preview when true. */
  external?: boolean;
  /** Only shown to Hub admins plus the Budget allowlist. */
  budgetAccess?: boolean;
};

export const STAFF_NAV: NavItem[] = [
  {
    href: "/app",
    label: "Home",
    description: "Overview of marketing activity",
    icon: Home,
    member: true,
  },
  {
    href: "/app/events",
    label: "Events",
    description: "Shows, meetings, and ceremonies",
    icon: CalendarDays,
    member: true,
  },
  {
    href: "/app/content",
    label: "Content & Social",
    description: "Social calendar (scheduled & published) — full pipeline in Admin view",
    icon: Clapperboard,
    member: true,
  },
  {
    href: "/app/pr",
    label: "PR",
    description: "Press contacts, media lists, pitches, coverage — admin only",
    icon: Megaphone,
  },
  {
    href: "/app/tasks",
    label: "Tasks",
    description: "Marketing to-dos — From, Deadline, status (admin only)",
    icon: CheckSquare,
  },
  {
    href: "/app/partners",
    label: "Partners",
    description: "Sponsorships and industry memberships",
    icon: Handshake,
    member: true,
  },
  {
    href: "/app/awards",
    label: "Awards",
    description: "Industry awards — watching, entering, shortlisted, won",
    icon: Award,
    member: true,
  },
  {
    href: "/app/library",
    label: "Library",
    description: "Media, brand guidelines, business cards, and gallery",
    icon: Library,
    member: true,
    external: true,
  },
  {
    href: "/app/themes",
    label: "Themes",
    description: "Quarterly theme → main → offshoot content",
    icon: Sparkles,
  },
  {
    href: "/app/requests",
    label: "Requests",
    description: "Clothes, merch, asset asks, and staff social forms",
    icon: Users,
    member: true,
  },
  {
    href: "/app/enquiries",
    label: "Enquiries",
    description: "Web quote form and WhatsApp tracker",
    icon: Inbox,
    member: true,
  },
  {
    href: "/app/reports",
    label: "Reporting",
    description: "Analytics, ads, SEO, Looker Studio links, and print advertisements",
    icon: BarChart3,
  },
  {
    href: "/app/budget",
    label: "Budget",
    description: "2026 marketing budget — Admin view only (plus Simon, Tom, and Michael)",
    icon: Wallet,
    budgetAccess: true,
  },
  {
    href: "/app/contacts",
    label: "Contacts",
    description: "People, press, and supplier companies",
    icon: Contact,
  },
  {
    href: "/app/logins",
    label: "Logins",
    description: "Shared marketing platform credentials",
    icon: KeyRound,
  },
  {
    href: "/app/feedback",
    label: "Feedback",
    description: "Report bugs, improvements, and ideas for the Hub",
    icon: MessageSquarePlus,
    member: true,
  },
  {
    href: "/app/admin",
    label: "Admin",
    description: "Users and data tables",
    icon: Settings,
  },
];

export function navForView(
  view: HubViewMode,
  options?: {
    canAccessBudget?: boolean;
    /**
     * Budget in Member view only for allowlisted non-admins (no Admin toggle).
     * Admins previewing Member must not see Budget — members never should.
     */
    budgetInMemberNav?: boolean;
  }
): NavItem[] {
  const includeBudget = Boolean(options?.canAccessBudget);
  const budgetInMemberNav = Boolean(options?.budgetInMemberNav);

  if (view === "external") {
    return STAFF_NAV.filter((item) => item.external);
  }

  if (view === "admin") {
    return includeBudget
      ? STAFF_NAV
      : STAFF_NAV.filter((item) => !item.budgetAccess);
  }

  // Member view: daily tools only — never Budget for admins previewing Member.
  return STAFF_NAV.filter(
    (item) => item.member || (budgetInMemberNav && item.budgetAccess)
  );
}
