import { describe, expect, it } from "vitest";
import {
  renderBlocksHtml,
  sanitizePressReleaseDocument,
  seedReleaseDocument,
} from "@/lib/pr/release-blocks";

describe("press release blocks", () => {
  it("strips scripts and unsafe links", () => {
    const document = sanitizePressReleaseDocument({
      blocks: [
        {
          id: "a",
          type: "text",
          html: "<p>Hello</p><script>alert(1)</script>",
        },
        {
          id: "b",
          type: "button",
          label: "Open",
          href: "javascript:alert(1)",
        },
        {
          id: "c",
          type: "image",
          src: "https://cdn.example.com/photo.jpg",
          alt: "Yard",
          caption: "",
        },
      ],
    });
    expect(document.blocks[0]).toMatchObject({ type: "text" });
    if (document.blocks[0].type === "text") {
      expect(document.blocks[0].html).toContain("Hello");
      expect(document.blocks[0].html.toLowerCase()).not.toContain("script");
    }
    expect(document.blocks[1]).toMatchObject({ type: "button", href: "" });
    expect(document.blocks[2]).toMatchObject({
      type: "image",
      src: "https://cdn.example.com/photo.jpg",
    });
    expect(renderBlocksHtml(document.blocks)).toContain("Hello");
    expect(renderBlocksHtml(document.blocks)).toContain("Yard");
  });

  it("turns an existing notes field into one text block", () => {
    const seeded = seedReleaseDocument(undefined, "<p>The fleet left Palma.</p>");
    expect(seeded.blocks).toHaveLength(1);
    expect(seeded.blocks[0]).toMatchObject({
      type: "text",
      html: expect.stringContaining("Palma"),
    });
    const kept = seedReleaseDocument(
      {
        blocks: [{ id: "keep", type: "header", text: "Already written" }],
        show_date: false,
      },
      "<p>Ignore this.</p>"
    );
    expect(kept.blocks).toEqual([
      { id: "keep", type: "header", text: "Already written" },
    ]);
    expect(kept.show_date).toBe(false);
  });
});