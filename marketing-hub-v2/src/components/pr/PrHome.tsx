import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Contact,
  Database,
  FileText,
  LineChart,
  Mail,
  Megaphone,
  Newspaper,
  Radar,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

type Card = {
  href: string;
  title: string;
  description: string;
  cta: string;
  icon: LucideIcon;
  status?: "live" | "soon";
};

const CARDS: Card[] = [
  {
    href: "/app/pr/database",
    title: "Media database",
    description:
      "Search and import journalist contacts. Build your own database from purchased lists and Hub press contacts.",
    cta: "Find media contacts",
    icon: Database,
    status: "live",
  },
  {
    href: "/app/pr/monitoring",
    title: "Monitoring",
    description:
      "Track press coverage across the web for your brand, competitors, keywords of interest and more.",
    cta: "Monitor media",
    icon: Radar,
    status: "live",
  },
  {
    href: "/app/pr/releases",
    title: "Press release creator",
    description:
      "Share something newsworthy about your brand and get the media attention you deserve.",
    cta: "Create press release",
    icon: FileText,
    status: "live",
  },
  {
    href: "/app/pr/newsroom",
    title: "Newsroom",
    description:
      "Keep all your news in a journalist-friendly newsroom to control the narrative.",
    cta: "Manage newsroom",
    icon: Newspaper,
    status: "live",
  },
  {
    href: "/app/pr/emails",
    title: "Emails",
    description:
      "Draft PR and marketing emails with shared contacts and lists, then send via Outlook.",
    cta: "Open Emails",
    icon: Mail,
    status: "live",
  },
  {
    href: "/app/pr/contacts",
    title: "Contacts",
    description:
      "Organise your contacts in a PR CRM and stay on top of your interactions.",
    cta: "Manage contacts",
    icon: Contact,
    status: "live",
  },
  {
    href: "/app/pr/reporting",
    title: "Reporting",
    description:
      "Show off relevant, comprehensive data with interactive coverage reports.",
    cta: "Coming soon",
    icon: BookOpen,
    status: "soon",
  },
  {
    href: "/app/pr/statistics",
    title: "Statistics overview",
    description:
      "Analyse information on visits, views, clicks and more for your newsroom and pitches.",
    cta: "Track statistics",
    icon: LineChart,
    status: "soon",
  },
];

export function PrHome({
  stats,
}: {
  stats: {
    pressContacts: number;
    lists: number;
    pitches: number;
    coverage: number;
    releases: number;
    mentions: number;
  };
}) {
  return (
    <div>
      <PageHeader
        title="PR"
        description="Media relations workspace — contacts, newsroom, pitches and monitoring in one place."
        actions={
          <>
            <Link
              href="/newsroom"
              target="_blank"
              className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand hover:bg-mist"
            >
              Open public newsroom
            </Link>
            <Link
              href="/app/pr/releases"
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm text-white"
            >
              <Megaphone className="h-4 w-4" />
              Create press release
            </Link>
          </>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Press contacts", value: stats.pressContacts },
          { label: "Media lists", value: stats.lists },
          { label: "Published releases", value: stats.releases },
          { label: "Coverage clips", value: stats.coverage },
        ].map((s) => (
          <div key={s.label} className="surface-card px-4 py-3">
            <div className="text-2xl font-display text-brand">{s.value}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const soon = card.status === "soon";
          return (
            <Link
              key={card.href}
              href={card.href}
              className="surface-card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-accent"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-brand">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="font-display text-lg text-brand group-hover:text-brand-soft">
                {card.title}
              </h2>
              <p className="mt-2 flex-1 text-sm text-muted">{card.description}</p>
              <span
                className={
                  soon
                    ? "mt-4 text-sm font-medium text-muted"
                    : "mt-4 text-sm font-medium text-accent"
                }
              >
                {card.cta} →
              </span>
            </Link>
          );
        })}
      </div>

      <p className="mt-8 flex items-center gap-2 text-xs text-muted">
        <BarChart3 className="h-3.5 w-3.5" />
        {stats.pitches} pitch draft{stats.pitches === 1 ? "" : "s"} ·{" "}
        {stats.mentions} monitoring mention
        {stats.mentions === 1 ? "" : "s"} in inbox
      </p>
    </div>
  );
}
