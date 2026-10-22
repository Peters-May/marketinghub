import type { ContentItem, PrCoverage, PrPitch } from "@/lib/types";

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

/** Approved or published releases, then the pitch, then coverage. Releases stay content rows. */
export function buildPrPipeline(input: {
  content: ContentItem[];
  pitches: PrPitch[];
  coverage: PrCoverage[];
}): PrPipelineRow[] {
  return input.content
    .filter(
      (item) =>
        isPressRelease(item) &&
        (item.status === "review" ||
          item.status === "approved" ||
          item.status === "published")
    )
    .map((item) => {
      const pitch =
        input.pitches.find((row) => row.content_id === item.id) ?? null;
      const clip =
        input.coverage.find(
          (row) =>
            row.content_id === item.id ||
            (pitch != null && row.pitch_id === pitch.id)
        ) ?? null;
      const stage: PrPipelineStage = clip
        ? "coverage"
        : pitch
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
