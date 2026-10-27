import { describe, expect, it } from "vitest";
import { compileEmailDesign, newsletterDesign } from "@/lib/email/design";
import {
  safeEmailUrl,
  sanitizeHtmlBlock,
  sanitizeRichEmailHtml,
} from "@/lib/email/design/compile";
import { cssNumber, cssValue } from "@/lib/email/css-value";
import { applyEmailMerge, ensureUnsubscribeFooter } from "@/lib/email/merge";
import type { Contact } from "@/lib/types";
import type { EmailDesign } from "@/lib/email/design/types";

const contact = {
  id: "c1",
  name: `<img src=x onerror="alert(1)"> O'Neil`,
  email: "a@example.com",
  organisation: "A <B> & Co",
  role: "",
  outlet: "",
  country: "",
} as Contact;

/**
 * True when the markup has an event-handler attribute inside a tag.
 * Quoted attribute values are blanked first: `style="color:x onclick=y"`
 * is inert text, while `style="x" onclick="y"` is a real handler.
 */
function hasHandler(html: string): boolean {
  const attrsOnly = html.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  return /<[^>]*[\s"'/]on[a-z]+\s*=/i.test(attrsOnly);
}

describe("applyEmailMerge", () => {
  it("escapes contact values in HTML", () => {
    const html = applyEmailMerge("<p>Hi {{name}} at {{organisation}}</p>", { contact });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; O&#39;Neil");
    expect(html).toContain("A &lt;B&gt; &amp; Co");
  });

  it("leaves subject lines as plain text", () => {
    expect(
      applyEmailMerge("For {{organisation}}", { contact }, { format: "text" })
    ).toBe("For A <B> & Co");
  });

  it("fills first name, last name and a greeting from the contact name", () => {
    expect(
      applyEmailMerge(
        "Hi {{first_name}} {{last_name}} — {{greeting}}",
        { contact: { ...contact, name: "Alex Example" } },
        { format: "text" }
      )
    ).toBe("Hi Alex Example — Dear Alex");
  });

  it("uses the fallback when the contact has no first name", () => {
    expect(
      applyEmailMerge(
        "Dear {{first_name|subscriber}}",
        { contact: { ...contact, name: "" } },
        { format: "text" }
      )
    ).toBe("Dear subscriber");
    expect(
      applyEmailMerge(
        "{{greeting|subscriber}}",
        { contact: { ...contact, name: "  " } },
        { format: "text" }
      )
    ).toBe("Dear subscriber");
    expect(
      applyEmailMerge(
        "{{greeting|subscriber}}",
        { contact: { ...contact, name: "Alex Example" } },
        { format: "text" }
      )
    ).toBe("Dear Alex");
  });

  it("keeps link tokens usable in href", () => {
    const html = applyEmailMerge('<a href="{{unsubscribe_url}}">x</a>', {
      contact,
      unsubscribeUrl: "https://hub.example.com/unsubscribe?token=a.b&view=1",
    });
    expect(html).toContain('href="https://hub.example.com/unsubscribe?token=a.b&amp;view=1"');
  });
});

describe("sanitizeHtmlBlock", () => {
  it.each([
    `<img src=x/onerror="alert(1)">`,
    `<img src="x"/onerror=alert(1)>`,
    `<svg/onload=alert(1)>`,
    `<a href="#"onclick='alert(1)'>x</a>`,
    `<img src=x onerror=alert(1)`,
  ])("removes event handlers from %s", (input) => {
    expect(hasHandler(sanitizeHtmlBlock(input))).toBe(false);
  });

  it("removes base, meta, link, script and javascript: URLs", () => {
    const out = sanitizeHtmlBlock(
      `<base href="https://evil.test/"><meta http-equiv="refresh" content="0"><link rel=stylesheet href=x>` +
        `<script>alert(1)</script><a href="JavaScript :alert(1)">x</a><iframe srcdoc="<b>"></iframe>`
    );
    expect(out).not.toMatch(/<base|<meta|<link|<script|<iframe/i);
    expect(out).not.toMatch(/javascript\s*:/i);
  });

  it("keeps ordinary layout markup", () => {
    const html = `<table role="presentation"><tr><td style="padding:8px;">Book now at <a href="https://petersandmay.com">our site</a></td></tr></table>`;
    expect(sanitizeHtmlBlock(html)).toBe(html);
  });
});

describe("sanitizeRichEmailHtml", () => {
  it("drops a trailing unclosed tag", () => {
    const out = sanitizeRichEmailHtml("<p>Hello</p><img src=x onerror=alert(1) ");
    expect(out).toBe("<p>Hello</p>");
    expect(hasHandler(`<div>${out}</div>`)).toBe(false);
  });

  it("only allows link merge tokens as hrefs", () => {
    expect(safeEmailUrl("{{unsubscribe_url}}")).toBe("{{unsubscribe_url}}");
    expect(safeEmailUrl("{{ view_in_browser_url }}")).toBe("{{ view_in_browser_url }}");
    expect(safeEmailUrl("{{name}}")).toBe("");
    expect(sanitizeRichEmailHtml('<a href="{{name}}">x</a>')).not.toContain("href");
  });
});

describe("css values", () => {
  it("strips characters that could leave a style attribute", () => {
    expect(cssValue('#007DC5" onmouseover="alert(1)')).toBe("#007DC5 onmouseover=alert(1)");
    expect(cssValue("red;background:url(https://evil.test/x)")).toBe("redbackground:https://evil.test/x)");
    expect(cssValue("'Source Sans 3', Arial, sans-serif")).toBe("'Source Sans 3', Arial, sans-serif");
    expect(cssValue("", "#007DC5")).toBe("#007DC5");
  });

  it("coerces numbers", () => {
    expect(cssNumber("12")).toBe(12);
    expect(cssNumber('1"><script>', 4)).toBe(4);
    expect(cssNumber(99999)).toBe(2000);
  });

  it("cleans the footer link colour", () => {
    const html = ensureUnsubscribeFooter("<p>Hi</p>", { linkColor: '#fff" onclick="x' });
    expect(hasHandler(html.replace(/\{\{[^}]+\}\}/g, ""))).toBe(false);
  });
});

describe("compileEmailDesign with hostile design values", () => {
  it("does not let colours, fonts or sizes break out of attributes", () => {
    const base = newsletterDesign();
    const evil = '" onmouseover="alert(1)';
    const design: EmailDesign = {
      ...base,
      styles: {
        ...base.styles,
        linkColor: `#007DC5${evil}`,
        textColor: `#000${evil}`,
        fontFamily: `Arial${evil}`,
        headingFontFamily: `Arial${evil}`,
      },
      sections: base.sections.map((section) => ({
        ...section,
        columns: section.columns.map((column) => ({
          ...column,
          blocks: column.blocks.map((block) => ({
            ...block,
            align: `left${evil}` as never,
            fontSize: `14${evil}` as never,
          })),
        })),
      })),
    };
    const html = compileEmailDesign(design);
    expect(hasHandler(html)).toBe(false);
    expect(html).not.toContain(evil);
  });
});
