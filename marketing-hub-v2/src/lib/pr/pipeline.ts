import type { ContentItem, EmailCampaign, PrCoverage, PrPitch } from "@/lib/types";

const PIPELINE_STATUSES = new Set(["review", "approved", "scheduled", "published"]);

/** Same pitch rule as emailCampaignCategory, without importing the email module. */
function isPipelinePitch(campaign: {
  category?: string | null;
  folder?: string | null;
  template_id?: string | null;
}): boolean {
  if (campaign.category === "marketing") return false;
  if (campaign.category === "pitch") return true;
  return (
    campaign.folder === "Press" || campaign.template_id === "etpl_press_pitch"
  );
}

export type PrPipelineStage = "release" | "pitched" | "coverage";

export type PrPipelineRow = {
  id: string;
  title: string;
  stage: PrPipelineStage;
  pitchId: string | null;
  coverageId: string | null;
};

export function isPressRelease(item: Pick<ContentItem, "content_type" | "category" | "channel">) {
  const type = (item.content_type || "").toLowerCase();
  const category = (item.category || "").toLowerCase();
  const channels = (item.channel || []).map((value) => value.toLowerCase());
  return (
    type === "pr" ||
    type === "press" ||
    category === "press release" ||
    channels.includes("pr")
  );
}

/** Ready, scheduled, or published releases, then the pitch, then coverage. */
export function buildPrPipeline(input: {
  content: ContentItem[];
  pitches: PrPitch[];
  coverage: PrCoverage[];
  campaigns?: Pick<
    EmailCampaign,
    "content_id" | "category" | "folder" | "template_id"
  >[];
}): PrPipelineRow[] {
  return input.content
    .filter(
      (item) => isPressRelease(item) && PIPELINE_STATUSES.has(item.status)
    )
    .map((item) => {
      const pitch =
        input.pitches.find((row) => row.content_id === item.id) ?? null;
      const campaignPitch = (input.campaigns ?? []).some(
        (campaign) =>
          campaign.content_id === item.id && isPipelinePitch(campaign)
      );
      const clip =
        input.coverage.find(
          (row) =>
            row.content_id === item.id ||
            (pitch != null && row.pitch_id === pitch.id)
        ) ?? null;
      const stage: PrPipelineStage = clip
        ? "coverage"
        : pitch || campaignPitch
          ? "pitched"
          : "release";
      return {
        id: item.id,
        title: item.title,
        stage,
        pitchId: pitch?.id ?? null,
        coverageId: clip?.id ?? null,
      };
    })
    .sort((a, b) => {
      const rank = { release: 0, pitched: 1, coverage: 2 };
      return rank[a.stage] - rank[b.stage] || a.title.localeCompare(b.title);
    });
}
