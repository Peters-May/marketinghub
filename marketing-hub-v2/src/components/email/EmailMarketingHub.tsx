"use client";

import { useState } from "react";
import { useHubDataRefresh } from "@/lib/command/refresh";
import { useHubView } from "@/lib/hub-view";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentFilter } from "@/components/ui/SegmentFilter";
import { EmailCampaignsPanel } from "@/components/email/EmailCampaignsPanel";
import { EmailAudiencesPanel } from "@/components/email/EmailAudiencesPanel";
import { EmailTemplatesPanel } from "@/components/email/EmailTemplatesPanel";
import { EmailReportsPanel } from "@/components/email/EmailReportsPanel";
import { EmailSettingsPanel } from "@/components/email/EmailSettingsPanel";
import type { AudienceListOption } from "@/lib/email/audience-list";
import type { EmailAudience, EmailCampaign, EmailTemplate } from "@/lib/types";
import { isPitchTabCampaign } from "@/lib/email/category";
import { PitchesPanel } from "@/components/pr/PitchesPanel";

export type AudienceWithCount = EmailAudience & { recipient_count: number };

type Tab = "emails" | "pitches" | "templates" | "analyse" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "emails", label: "Emails" },
  { id: "pitches", label: "Pitches" },
  { id: "templates", label: "Templates" },
  { id: "analyse", label: "Analyse" },
  { id: "settings", label: "Settings" },
];

export function EmailMarketingHub({
  initialCampaigns,
  initialTemplates,
  initialAudiences,
  initialLists,
  initialTab,
  pitchCampaigns = [],
  contentTitles = [],
  memberView = false,
}: {
  initialCampaigns: EmailCampaign[];
  initialTemplates: EmailTemplate[];
  initialAudiences: AudienceWithCount[];
  initialLists: AudienceListOption[];
  initialTab?: Tab;
  pitchCampaigns?: EmailCampaign[];
  contentTitles?: { id: string; title: string }[];
  /** Sent marketing emails only. Pitches and editing stay with admins. */
  memberView?: boolean;
}) {
  const { view, ready } = useHubView();
  const sentOnly = memberView || (ready && view === "member");
  const [tab, setTab] = useState<Tab>(sentOnly ? "emails" : (initialTab ?? "emails"));
  const [pitchRows, setPitchRows] = useState(pitchCampaigns);
  const [audiencesOpen, setAudiencesOpen] = useState(false);
  const [templates, setTemplates] = useState(initialTemplates);
  const [audiences, setAudiences] = useState(initialAudiences);
  const [lists, setLists] = useState(initialLists);
  const visibleCampaigns = sentOnly
    ? initialCampaigns.filter(
        (campaign) => campaign.status === "sent" || campaign.status === "sending"
      )
    : initialCampaigns;
  const countLabel = sentOnly
    ? `${visibleCampaigns.length} sent email${visibleCampaigns.length === 1 ? "" : "s"}`
    : `${initialCampaigns.length} marketing email${initialCampaigns.length === 1 ? "" : "s"}`;

  useHubDataRefresh("email", () => {
    if (sentOnly) return;
    void fetch("/api/email/audiences")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (Array.isArray(data.audiences)) setAudiences(data.audiences);
        if (Array.isArray(data.lists)) setLists(data.lists);
      })
      .catch(() => {
        /* keep the lists already on screen */
      });
  });

  const section = sentOnly ? "emails" : tab;

  return (
    <div>
      <PageHeader
        title="Email"
        description={sentOnly ? "Sent marketing emails" : countLabel}
      />

      {sentOnly ? null : (
      <SegmentFilter
        label="Email section"
        value={tab}
        onChange={(next) => {
          setAudiencesOpen(false);
          setTab(next);
        }}
        options={TABS}
        size="lg"
        tourIdPrefix="email-tab"
      />
      )}

      {section === "emails" && audiencesOpen && !sentOnly ? (
        <div>
          <button
            type="button"
            className="btn-secondary mb-4"
            onClick={() => setAudiencesOpen(false)}
          >
            Back to emails
          </button>
          <EmailAudiencesPanel
            audiences={audiences}
            setAudiences={setAudiences}
            lists={lists}
            setLists={setLists}
          />
        </div>
      ) : null}

      {section === "emails" && (!audiencesOpen || sentOnly) ? (
        <EmailCampaignsPanel
          campaigns={visibleCampaigns}
          onOpenAudiences={() => setAudiencesOpen(true)}
          readOnly={sentOnly}
        />
      ) : null}

      {sentOnly || section !== "pitches" ? null : (
        <PitchesPanel
          campaigns={pitchRows}
          content={contentTitles}
          match={isPitchTabCampaign}
          onCampaign={(item: EmailCampaign) =>
            setPitchRows((prev) => [item, ...prev.filter((c) => c.id !== item.id)])
          }
        />
      )}

      {sentOnly || section !== "templates" ? null : (
        <EmailTemplatesPanel templates={templates} setTemplates={setTemplates} />
      )}

      {sentOnly || section !== "analyse" ? null : <EmailReportsPanel />}

      {sentOnly || section !== "settings" ? null : <EmailSettingsPanel />}
    </div>
  );
}
