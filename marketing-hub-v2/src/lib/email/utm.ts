/** Append standard UTM parameters to http(s) links in email HTML. */

export type EmailUtmParams = {
  source?: string;
  medium?: string;
  campaign: string;
};

function slugCampaign(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "email";
}

function withUtm(url: string, params: EmailUtmParams): string {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/\{\{/.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (!parsed.searchParams.has("utm_source")) {
      parsed.searchParams.set("utm_source", params.source || "marketing-hub");
    }
    if (!parsed.searchParams.has("utm_medium")) {
      parsed.searchParams.set("utm_medium", params.medium || "email");
    }
    if (!parsed.searchParams.has("utm_campaign")) {
      parsed.searchParams.set("utm_campaign", slugCampaign(params.campaign));
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/** Rewrite href="…" values in HTML. Leaves merge tokens and mailto alone. */
export function appendUtmToEmailHtml(html: string, params: EmailUtmParams): string {
  return html.replace(
    /href\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (full, _quoted: string, double?: string, single?: string) => {
      const original = double ?? single ?? "";
      const next = withUtm(original, params);
      if (next === original) return full;
      const quote = double !== undefined ? '"' : "'";
      return `href=${quote}${next}${quote}`;
    }
  );
}
