import { describe, expect, it } from "vitest";
import { COLORS } from "@/lib/brand/tokens";
import {
  announcementDesign,
  compileEmailDesign,
  designFromLegacyHtml,
  moveBlock,
  newsletterDesign,
  normalizeEmailDesign,
  resolveEmailDesign,
} from "@/lib/email/design";

const LEGACY = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif;">
  <p>Hello {{name}},</p>
  <p>Here is the latest from Peters & May.</p>
  <p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
</body></html>`;

describe("email design compiler", () => {
  it("compiles a newsletter to a table with merge tokens and brand colours", () => {
    const html = compileEmailDesign(newsletterDesign());
    expect(html).toContain('role="presentation"');
    expect(html).toContain("{{name}}");
    expect(html).toContain("{{unsubscribe_url}}");
    expect(html).toContain(COLORS.ensignNavy.hex);
    expect(html).toContain(COLORS.pmBlue.hex);
    expect(html.toLowerCase()).not.toContain(COLORS.ensignRed.hex.toLowerCase());
    expect(html).toContain("em-stack");
    expect(html).toContain("Archivo, Arial, sans-serif");
    expect(html).toContain("League Spartan, Arial, sans-serif");
  });

  it("keeps an existing HTML template as one block and does not double the unsubscribe link", () => {
    const design = designFromLegacyHtml(LEGACY);
    expect(design.sections).toHaveLength(1);
    expect(design.sections[0].columns[0].blocks).toHaveLength(1);
    expect(design.sections[0].columns[0].blocks[0].type).toBe("html");
    const html = compileEmailDesign(design);
    expect(html).toContain("Hello {{name}}");
    expect(html).toContain("<table");
    expect(html.match(/\{\{\s*unsubscribe_url\s*\}\}/g)?.length).toBe(1);
  });

  it("round-trips a design through JSON", () => {
    const design = announcementDesign();
    const again = normalizeEmailDesign(JSON.parse(JSON.stringify(design)));
    expect(again).toEqual(design);
  });

  it("opens an empty campaign as a blank design and legacy HTML when there is no document", () => {
    expect(resolveEmailDesign(null, "").sections.length).toBeGreaterThan(0);
    expect(resolveEmailDesign(null, LEGACY).sections[0].columns[0].blocks[0].type).toBe(
      "html"
    );
  });

  it("moves a block into another column", () => {
    const design = newsletterDesign();
    const from = design.sections[1].columns[0].blocks[0];
    const target = design.sections[0];
    const moved = moveBlock(design, from.id, {
      sectionId: target.id,
      columnId: target.columns[0].id,
      beforeBlockId: null,
    });
    expect(moved.sections[1].columns[0].blocks.find((block) => block.id === from.id)).toBeUndefined();
    expect(moved.sections[0].columns[0].blocks.some((block) => block.id === from.id)).toBe(true);
  });

  it("rejects a document that is not version 1", () => {
    expect(normalizeEmailDesign({ version: 2, sections: [] })).toBeNull();
    expect(normalizeEmailDesign("not json")).toBeNull();
  });
});
