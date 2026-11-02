import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createBlock, createSection, defaultEmailStyles } from "@/lib/email/design/document";
import {
  importEmailHtml,
  parseImportMarkup,
  replaceUnlockedSections,
  sectionsFromImportNodes,
  type ImportNode,
} from "@/lib/email/design/import-html";
import type { EmailBlock, EmailSection } from "@/lib/email/design";

/** Builds the element tree the walker accepts. Node has no DOMParser. */
function parseFixture(html: string): ImportNode[] {
  return parseImportMarkup(html);
}

function blocksOf(sections: EmailSection[]): EmailBlock[] {
  return sections.flatMap((section) => section.columns.flatMap((column) => column.blocks));
}

function textOf(block: EmailBlock): string {
  if (block.type === "heading" || block.type === "footer" || block.type === "quote") return block.text;
  if (block.type === "button") return block.label;
  if (block.type === "text" || block.type === "html") return block.html;
  if (block.type === "image") return block.alt;
  return "";
}

const GROUPED = `
<h1 style="font-size:30px;color:#0B2545;">Update</h1>
<p>Hello {{name}},</p>
<p>Here is the <strong>latest</strong>.</p>
<hr>
`;

const IMAGE = `<img src="https://example.com/logo.png" alt="Peters &amp; May" width="180">`;

const BUTTON = `
<table role="presentation">
  <tr>
    <td style="background-color:#007DC5;border-radius:8px;">
      <a href="https://www.gov.uk/guidance/example" style="display:inline-block;padding:13px 26px;color:#FFFFFF;">Read the guidance</a>
    </td>
  </tr>
</table>
`;

const COLUMNS = `
<table role="presentation">
  <tr>
    <td><h2>Left title</h2><p>Port schedule</p></td>
    <td><img src="https://example.com/ship.jpg" alt="Vessel"></td>
  </tr>
</table>
`;

const FALLBACK = `
<custom-banner>
  <p>Keep this together</p>
  <img src="https://example.com/mark.png" alt="Mark">
</custom-banner>
`;

const BRANDED = `<!DOCTYPE html>
<html><head><title>HMRC revises VAT rates</title></head>
<body>
<div style="display:none;mso-hide:all;">HMRC has increased the rates used to calculate import VAT.</div>
<table role="presentation" width="100%" style="background-color:#F4F6F7;">
<tr><td>
<table role="presentation" width="600" style="background-color:#FFFFFF;">
  <tr><td style="background-color:#0B2545;"><img src="data:image/png;base64,iVBORw0KGgo=" alt="Peters &amp; May Group" width="180" style="display:block;width:180px;height:auto;"></td></tr>
  <tr><td style="background-color:#007DC5;height:4px;font-size:4px;">&nbsp;</td></tr>
  <tr><td>
    <p>Customs update</p>
    <h1 style="font-size:30px;color:#0B2545;">HMRC revises VAT Value Adjustment rates</h1>
  </td></tr>
  <tr><td>
    <p>Dear Customer,</p>
    <p>HMRC has revised the nationally agreed rates used to calculate VAT Value Adjustments (VVA).</p>
  </td></tr>
  <tr><td>
    <h2>What has changed?</h2>
    <table class="rate-table" width="100%">
      <tr><th>Shipment type</th><th>Previous rate</th><th>New rate</th></tr>
      <tr><td>Air freight</td><td>minimum &pound;100</td><td>minimum &pound;135</td></tr>
    </table>
  </td></tr>
  <tr><td>
    <table width="100%" style="background-color:#F4F6F7;border-left:4px solid #007DC5;">
      <tr><td><p><strong>Air freight:</strong> &pound;30 more import VAT.</p></td></tr>
    </table>
  </td></tr>
  <tr><td>
    <table><tr>
      <td style="background-color:#007DC5;border-radius:8px;">
        <a href="https://www.gov.uk/guidance/working-out-the-vat-value" style="display:inline-block;padding:13px 26px;font-size:16px;color:#FFFFFF;">Read HMRC's guidance</a>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="background-color:#0B2545;">
    <table width="100%"><tr>
      <td><img src="data:image/png;base64,AAAA" alt="Yacht Transport" width="168"></td>
      <td><img src="data:image/png;base64,BBBB" alt="Freight Forwarding" width="165"></td>
      <td><img src="data:image/png;base64,CCCC" alt="Commercial Transport" width="95"></td>
    </tr></table>
  </td></tr>
  <tr><td style="background-color:#071A2E;"><p>Registered company name</p></td></tr>
</table>
</td></tr></table>
</body></html>`;

describe("paste HTML import", () => {
  it("walks a hand-built heading node", () => {
    const sections = sectionsFromImportNodes([
      {
        tag: "h1",
        attrs: { style: "font-size:22px;color:#0B2545;" },
        text: "",
        children: [{ tag: "#text", attrs: {}, children: [], text: "Hello" }],
      },
    ]);
    expect(blocksOf(sections)[0]).toMatchObject({
      type: "heading",
      text: "Hello",
      level: 1,
      fontSize: 22,
      color: "#0B2545",
    });
  });

  it("groups paragraphs and keeps a divider", () => {
    const blocks = blocksOf(sectionsFromImportNodes(parseFixture(GROUPED)));
    expect(blocks.map((block) => block.type)).toEqual(["heading", "text", "divider"]);
    const text = blocks[1];
    expect(text.type).toBe("text");
    if (text.type === "text") {
      expect(text.html).toContain("Hello {{name}}");
      expect(text.html).toContain("<strong>latest</strong>");
    }
  });

  it("turns an image into an image module", () => {
    const [block] = blocksOf(sectionsFromImportNodes(parseFixture(IMAGE)));
    expect(block).toMatchObject({
      type: "image",
      src: "https://example.com/logo.png",
      alt: "Peters & May",
    });
  });

  it("turns a coloured link into a button", () => {
    const [block] = blocksOf(sectionsFromImportNodes(parseFixture(BUTTON)));
    expect(block).toMatchObject({
      type: "button",
      label: "Read the guidance",
      href: "https://www.gov.uk/guidance/example",
      background: "#007DC5",
      color: "#FFFFFF",
    });
  });

  it("turns a two-cell row into columns", () => {
    const [section] = sectionsFromImportNodes(parseFixture(COLUMNS));
    expect(section.columns).toHaveLength(2);
    expect(section.columns[0].blocks.map((block) => block.type)).toEqual(["heading", "text"]);
    expect(section.columns[1].blocks[0]).toMatchObject({ type: "image", alt: "Vessel" });
  });

  it("keeps an unrecognised chunk as one HTML module", () => {
    const blocks = blocksOf(sectionsFromImportNodes(parseFixture(FALLBACK)));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("html");
    expect(textOf(blocks[0])).toContain("Keep this together");
    expect(textOf(blocks[0])).toContain("https://example.com/mark.png");
  });

  it("splits a branded email into editable modules", () => {
    const imported = importEmailHtml(BRANDED);
    const blocks = blocksOf(imported.sections);
    expect(imported.title).toBe("HMRC revises VAT rates");
    expect(imported.previewText).toContain("import VAT");
    expect(blocks.some((block) => textOf(block).includes("HMRC has increased the rates"))).toBe(
      false
    );

    const logo = blocks.find((block) => block.type === "image" && block.alt.includes("Group"));
    expect(logo).toMatchObject({
      type: "image",
      src: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(imported.sections.some((section) => section.background === "#0B2545")).toBe(true);

    const heading = blocks.find((block) => block.type === "heading");
    expect(heading).toMatchObject({
      type: "heading",
      text: "HMRC revises VAT Value Adjustment rates",
      fontSize: 30,
    });

    const intro = blocks.find((block) => block.type === "text" && block.html.includes("Dear Customer"));
    expect(intro?.type).toBe("text");
    if (intro?.type === "text") expect(intro.html).toContain("VAT Value Adjustments");

    const table = blocks.find((block) => block.type === "html");
    expect(table?.type).toBe("html");
    if (table?.type === "html") {
      expect(table.html).toContain("Shipment type");
      expect(table.html).toContain("Air freight");
      expect(table.html).toContain("£135");
    }

    const button = blocks.find((block) => block.type === "button");
    expect(button).toMatchObject({
      type: "button",
      label: "Read HMRC's guidance",
      href: "https://www.gov.uk/guidance/working-out-the-vat-value",
      background: "#007DC5",
    });

    const logos = imported.sections.find(
      (section) =>
        section.columns.length === 3 &&
        section.columns.every((column) => column.blocks[0]?.type === "image")
    );
    expect(logos?.background).toBe("#0B2545");
    expect(logos?.columns.map((column) => (column.blocks[0].type === "image" ? column.blocks[0].alt : ""))).toEqual([
      "Yacht Transport",
      "Freight Forwarding",
      "Commercial Transport",
    ]);

    expect(blocks.filter((block) => block.type === "html")).toHaveLength(1);
    expect(blocks.some((block) => block.type === "divider")).toBe(true);
  });

  it("replaces unlocked sections and keeps a locked header and footer", () => {
    const header = createSection("1", {
      locked: true,
      columns: [
        {
          id: "header-col",
          width: 100,
          blocks: [createBlock("heading", { text: "Locked header" })],
        },
      ],
    });
    const footer = createSection("1", {
      locked: true,
      columns: [
        {
          id: "footer-col",
          width: 100,
          blocks: [createBlock("footer", { text: "Locked footer" })],
        },
      ],
    });
    const design = {
      version: 1 as const,
      styles: defaultEmailStyles(),
      sections: [header, createSection("1"), footer],
    };
    const imported = htmlSections("<p>Pasted note</p>");
    const next = replaceUnlockedSections(design, imported);
    expect(next.styles).toEqual(design.styles);
    expect(next.sections[0]).toBe(header);
    expect(next.sections[next.sections.length - 1]).toBe(footer);
    expect(textOf(next.sections[1].columns[0].blocks[0])).toContain("Pasted note");
  });

  const sample = process.env.EMAIL_HTML_SAMPLE;
  it.skipIf(!sample || !existsSync(sample))("imports the HMRC preview file", () => {
    const html = readFileSync(sample as string, "utf8");
    const imported = importEmailHtml(html);
    const blocks = blocksOf(imported.sections);
    expect(imported.previewText).toContain("import VAT");
    expect(blocks.find((block) => block.type === "heading")).toMatchObject({
      text: "HMRC revises VAT Value Adjustment rates for UK imports",
    });
    const logos = blocks.filter((block) => block.type === "image");
    expect(logos.length).toBeGreaterThanOrEqual(4);
    expect(logos.every((block) => block.type === "image" && block.src.startsWith("data:image/png"))).toBe(
      true
    );
    const table = blocks.find((block) => block.type === "html" && block.html.includes("Shipment type"));
    expect(table?.type).toBe("html");
    expect(blocks.find((block) => block.type === "button")).toMatchObject({
      label: "Read HMRC's guidance",
    });
    const footer = imported.sections.find((section) => section.columns.length === 3);
    expect(footer?.columns.every((column) => column.blocks[0]?.type === "image")).toBe(true);
  });
});

function htmlSections(html: string): EmailSection[] {
  return sectionsFromImportNodes(parseFixture(html));
}
