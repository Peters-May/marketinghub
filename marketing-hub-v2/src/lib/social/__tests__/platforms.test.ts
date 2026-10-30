import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlatformPostPreview } from "@/components/social/PlatformPostPreview";
import { normalizeChannels } from "@/lib/data/normalize";
import { resolvePreviewPlatforms } from "@/lib/social/platforms";

describe("resolvePreviewPlatforms", () => {
  it("keeps every selected platform", () => {
    const resolved = resolvePreviewPlatforms([
      "LinkedIn",
      "Instagram",
      "Facebook",
      "X",
      "TikTok",
      "YouTube",
    ]);
    expect(resolved.map((item) => item.label)).toEqual([
      "LinkedIn",
      "Instagram",
      "Facebook",
      "X",
      "TikTok",
      "YouTube",
    ]);
  });

  it("splits a combined label instead of keeping the first network", () => {
    expect(
      resolvePreviewPlatforms(["Facebook and Instagram, LinkedIn"]).map(
        (item) => item.label
      )
    ).toEqual(["Facebook", "Instagram", "LinkedIn"]);
  });

  it("does not treat LinkedIn as X", () => {
    expect(resolvePreviewPlatforms(["LinkedIn"]).map((item) => item.key)).toEqual([
      "linkedin",
    ]);
  });
});

describe("normalizeChannels", () => {
  it("stores every network named together", () => {
    expect(normalizeChannels("Facebook and Instagram")).toEqual([
      "Facebook",
      "Instagram",
    ]);
    expect(normalizeChannels(["LinkedIn", "Instagram", "Facebook"])).toEqual([
      "LinkedIn",
      "Instagram",
      "Facebook",
    ]);
  });

  it("leaves non-social outlets unchanged", () => {
    expect(normalizeChannels(["Editorial"])).toEqual(["Editorial"]);
    expect(normalizeChannels(["Newsletter", "PR"])).toEqual(["Newsletter", "PR"]);
  });
});

describe("PlatformPostPreview", () => {
  it("renders a preview for every selected platform", () => {
    const html = renderToStaticMarkup(
      createElement(PlatformPostPreview, {
        platforms: ["LinkedIn", "Instagram", "Facebook"],
        caption: "Yard update",
        images: [],
      })
    );
    expect(html).toContain("LinkedIn preview");
    expect(html).toContain("Instagram preview");
    expect(html).toContain("Facebook preview");
  });

  it("shows one platform at a time when switched", () => {
    const html = renderToStaticMarkup(
      createElement(PlatformPostPreview, {
        mode: "switch",
        platforms: ["LinkedIn", "Instagram", "Facebook"],
        caption: "Yard update",
        images: [],
      })
    );
    expect(html).toContain('aria-label="Platform preview"');
    expect(html).toContain('aria-label="Instagram"');
    expect(html).toContain("LinkedIn preview");
    expect(html).not.toContain("Instagram preview");
    expect(html).not.toContain("Facebook preview");
  });

  it("plays a share-link video at full frame instead of a cropped still", () => {
    const html = renderToStaticMarkup(
      createElement(PlatformPostPreview, {
        mode: "switch",
        videoReview: true,
        platforms: ["LinkedIn", "Instagram"],
        caption: "Yard update",
        images: ["https://cdn.example/film.mp4"],
      })
    );
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).toContain("https://cdn.example/film.mp4#t=0.1");
    expect(html).not.toContain("object-cover");
  });
});
