/**
 * Approved Peters & May factsheet copy.
 * No company figures. The positioning line is the brand promise.
 * Import this from TypeScript and from the Prowly scripts so the wording stays one source.
 */

export const COMPANY_BOILERPLATE =
  "Peters & May brings experienced thinking to complex logistics. The Group covers yacht transport, freight forwarding and commercial marine transport.";

export const NEWSROOM_GREETING =
  "Company updates, press releases and media resources from Peters & May.";

export const NEWSROOM_DESCRIPTION =
  "Peters & May brings experienced thinking to complex logistics. This newsroom shares company updates, press releases and media resources from across the Group. For yacht transport, freight forwarding and commercial marine transport, visit www.petersandmay.com.";

export const NEWSROOM_SEO_DESCRIPTION =
  "News from Peters & May on yacht transport, freight forwarding and commercial marine transport.";

/** HTML form of the company boilerplate for email and release templates. */
export function companyBoilerplateHtml() {
  const text = COMPANY_BOILERPLATE.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<p>${text}</p><p><a href="https://www.petersandmay.com">petersandmay.com</a></p>`;
}

/** Media desk block. No personal name or mobile number. */
export const MEDIA_DESK_HTML =
  "<p>Media enquiries<br>Peters &amp; May<br>marketing@petersandmay.com</p>";

export const RELEASE_FILES_HTML =
  "<p>Files for this release are on the newsroom.</p>";
