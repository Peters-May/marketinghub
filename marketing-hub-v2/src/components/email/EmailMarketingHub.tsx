"use client";

import { useCallback, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentFilter } from "@/components/ui/SegmentFilter";
import { EmailCalendarPanel } from "@/components/email/EmailCalendarPanel";
import { EmailCampaignsPanel } from "@/components/email/EmailCampaignsPanel";
import { EmailAudiencesPanel } from "@/components/email/EmailAudiencesPanel";
import { EmailTemplatesPanel } from "@/components/email/EmailTemplatesPanel";
import { EmailReportsPanel } from "@/components/email/EmailReportsPanel";
import type {
  ContentItem,
  EmailAudience,
  EmailCampaign,
  EmailTemplate,
  MediaList,
  QuarterlyTheme,
} from "@/lib/types";

export type AudienceWithCount = EmailAudience & { recipient_count: number };

type Tab = "calendar" | "campaigns" | "audiences" | "templates" | "reports";

const TABS: { id: Tab; label: string }[] = [
  { id: "calendar", label: "Calendar" },
  { id: "campaigns", label: "Campaigns" },
  { id: "audiences", label: "Audiences" },
  { id: "templates", label: "Templates" },
  { id: "reports", label: "Reports" },
];

export function EmailMarketingHub({
  initialCampaigns,
  initialTemplates,
  initialAudiences,
  initialLists,
  initialThemes,
  initialNewsletters,
  initialCampaignId,
}: {
  initialCampaigns: EmailCampaign[];
  initialTemplates: EmailTemplate[];
  initialAudiences: AudienceWithCount[];
  initialLists: MediaList[];
  initialThemes: QuarterlyTheme[];
  initialNewsletters: ContentItem[];
  initialCampaignId?: string;
}) {
  const [tab, setTab] = useState<Tab>(initialCampaignId ? "campaigns" : "calendar");
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [templates, setTemplates] = useState(initialTemplates);
  const [audiences, setAudiences] = useState(initialAudiences);
  const [focusCampaignId, setFocusCampaignId] = useState<string | null>(
    initialCampaignId ?? null
  );

  const refreshCampaigns = useCallback(async () => {
    const res = await fetch("/api/email/campaigns");
    const data = await res.json();
    setCampaigns(data.campaigns ?? []);
    if (data.templates) setTemplates(data.templates);
    if (data.audiences) {
      /* audiences refreshed via audiences panel */
    }
  }, []);

  const openCampaign = useCallback((id: string) => {
    setFocusCampaignId(id);
    setTab("campaigns");
  }, []);

  return (
    <div>
      <PageHeader
        title="Email"
        description="Plan and send marketing e-shots — audiences, templates, calendar, and performance. Distinct from PR Outlook pitches."
      />

      <SegmentFilter
        label="Email section"
        value={tab}
        onChange={setTab}
        options={TABS}
        size="lg"
        tourIdPrefix="email-tab"
      />

      {tab === "calendar" ? (
        <EmailCalendarPanel
          campaigns={campaigns}
          onOpenCampaign={openCampaign}
          onRefresh={() => void refreshCampaigns()}
        />
      ) : null}

      {tab === "campaigns" ? (
        <EmailCampaignsPanel
          campaigns={campaigns}
          setCampaigns={setCampaigns}
          templates={templates}
          audiences={audiences}
          themes={initialThemes}
          newsletters={initialNewsletters}
          focusId={focusCampaignId}
          onFocusHandled={() => setFocusCampaignId(null)}
          onRefresh={() => void refreshCampaigns()}
        />
      ) : null}

      {tab === "audiences" ? (
        <EmailAudiencesPanel
          audiences={audiences}
          setAudiences={setAudiences}
          lists={initialLists}
        />
      ) : null}

      {tab === "templates" ? (
        <EmailTemplatesPanel
          templates={templates}
          setTemplates={setTemplates}
        />
      ) : null}

      {tab === "reports" ? <EmailReportsPanel /> : null}
    </div>
  );
}
