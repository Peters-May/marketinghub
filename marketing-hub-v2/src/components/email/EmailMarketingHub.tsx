"use client";

import { useState } from "react";
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
}: {
  initialCampaigns: EmailCampaign[];
  initialTemplates: EmailTemplate[];
  initialAudiences: AudienceWithCount[];
  initialLists: AudienceListOption[];
  initialTab?: Tab;
  pitchCampaigns?: EmailCampaign[];
  contentTitles?: { id: string; title: string }[];
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "emails");
  const [pitchRows, setPitchRows] = useState(pitchCampaigns);
  const [audiencesOpen, setAudiencesOpen] = useState(false);
  const [templates, setTemplates] = useState(initialTemplates);
  const [audiences, setAudiences] = useState(initialAudiences);
  const [lists, setLists] = useState(initialLists);
  const countLabel = `${initialCampaigns.length} marketing email${initialCampaigns.length === 1 ? "" : "s"}`;

  return (
    <div>
      <PageHeader title="Email" description={countLabel} />

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

      {tab === "emails" && audiencesOpen ? (
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

      {tab === "emails" && !audiencesOpen ? (
        <EmailCampaignsPanel
          campaigns={initialCampaigns}
          onOpenAudiences={() => setAudiencesOpen(true)}
        />
      ) : null}

      {tab === "pitches" ? (
        <PitchesPanel
          campaigns={pitchRows}
          content={contentTitles}
          match={isPitchTabCampaign}
          onCampaign={(item: EmailCampaign) =>
            setPitchRows((prev) => [item, ...prev.filter((c) => c.id !== item.id)])
          }
        />
      ) : null}

      {tab === "templates" ? (
        <EmailTemplatesPanel templates={templates} setTemplates={setTemplates} />
      ) : null}

      {tab === "analyse" ? <EmailReportsPanel /> : null}

      {tab === "settings" ? <EmailSettingsPanel /> : null}
    </div>
  );
}
