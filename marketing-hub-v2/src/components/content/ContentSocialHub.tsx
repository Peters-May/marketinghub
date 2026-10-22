"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentFilter } from "@/components/ui/SegmentFilter";
import { ModuleSkeleton } from "@/components/ui/ModuleSkeleton";
import { useHubView } from "@/lib/hub-view";
import type { FieldOption } from "@/lib/data/collections";
import type { ContentItem, EventContentLink } from "@/lib/types";

const ContentClient = dynamic(
  () =>
    import("@/components/content/ContentClient").then((m) => ({
      default: m.ContentClient,
    })),
  { loading: () => <ModuleSkeleton rows={8} /> }
);

const SocialClient = dynamic(
  () =>
    import("@/components/social/SocialClient").then((m) => ({
      default: m.SocialClient,
    })),
  { loading: () => <ModuleSkeleton rows={8} /> }
);

type Scope = "all" | "content" | "social";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "content", label: "Content" },
  { id: "social", label: "Social" },
];

const PLANABLE_CALENDAR_URL =
  "https://app.planable.io/calendar/25GtzkN5qqaTuMfEH";

export function ContentSocialHub({
  initialOpenId = null,
  initialContent,
  fieldOptions,
  themes = [],
  events = [],
  eventContentLinks = [],
}: {
  initialOpenId?: string | null;
  initialContent: ContentItem[];
  fieldOptions?: Record<string, FieldOption[]>;
  themes?: { id: string; title: string }[];
  events?: { id: string; title: string }[];
  eventContentLinks?: EventContentLink[];
}) {
  const { view } = useHubView();
  const isMemberView = view !== "admin";
  const [scope, setScope] = useState<Scope>("all");

  if (isMemberView) {
    return (
      <div>
        <PageHeader
          title="Social calendar"
          description="Scheduled and published posts only — drafts stay with the marketing team."
        />
        <SocialClient
          key="member-social"
          hideHeader
          memberView
          initialOpenId={initialOpenId}
          initialContent={initialContent}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Content & Social"
        description="Draft in the Hub. Approved sends one Facebook draft to Planable with the due date — add LinkedIn and Instagram there, then schedule, approve and publish. Published posts lock in the Hub."
        actions={
          <a
            href={PLANABLE_CALENDAR_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-primary"
          >
            Open Planable
            <ExternalLink className="h-4 w-4" />
          </a>
        }
      />

      <SegmentFilter
        label="Content or social"
        value={scope}
        onChange={setScope}
        options={SCOPES}
        size="lg"
      />

      <ContentClient
        key={scope}
        initialOpenId={initialOpenId}
        initial={initialContent}
        hideHeader
        scope={scope}
        fieldOptions={fieldOptions}
        themes={themes}
        events={events}
        eventContentLinks={eventContentLinks}
      />
    </div>
  );
}
