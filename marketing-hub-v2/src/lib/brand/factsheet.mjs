/**
 * Approved Peters & May factsheet copy.
 * No company figures. The positioning line is the brand promise.
 * Import this from TypeScript and from the Prowly scripts so the wording stays one source.
 */

/** Appendix A, Brand Guidelines v2.0 (July 2026). Paste whole. Do not rewrite. */
export const COMPANY_BOILERPLATE =
  "With over 50 years of experience, Peters & May is a global leader in bespoke logistics solutions, specialising in yacht transport, commercial marine projects, and freight forwarding. The company supports some of the world's most prestigious boat manufacturers, race teams, and private clients — moving everything from superyachts to sensitive cargo.\n\nPeters & May's services span across sea, air, and road, backed by in-house technical expertise, a dedicated customs and VAT team, and a global network of trusted partners. Known for its attention to detail, flexible solutions, and deep understanding of the marine industry, Peters & May continues to deliver seamless shipping experiences around the world.\n\nwww.petersandmay.com";

export const NEWSROOM_GREETING =
  "Company updates, press releases and media resources from Peters & May.";

export const NEWSROOM_DESCRIPTION =
  "Peters & May brings experienced thinking to complex logistics. This newsroom shares company updates, press releases and media resources from across the Group. For yacht transport, freight forwarding and commercial marine transport, visit www.petersandmay.com.";

export const NEWSROOM_SEO_DESCRIPTION =
  "News from Peters & May on yacht transport, freight forwarding and commercial marine transport.";

/** HTML form of the company boilerplate for email and release templates. */
export function companyBoilerplateHtml() {
  return COMPANY_BOILERPLATE.split(/\n\n+/)
    .map((part) => {
      const text = part
        .trim()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;");
      if (text === "www.petersandmay.com") {
        return `<p><a href="https://www.petersandmay.com">petersandmay.com</a></p>`;
      }
      return `<p>${text}</p>`;
    })
    .join("");
}

/** Media desk block. No personal name or mobile number. */
export const MEDIA_DESK_HTML =
  "<p>Media enquiries<br>Peters &amp; May<br>marketing@petersandmay.com</p>";

export const RELEASE_FILES_HTML =
  "<p>Files for this release are on the newsroom.</p>";
