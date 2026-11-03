import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

function pickMetaContent(html: string, prop: string): string | null {
  const re = new RegExp(
    `(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
    "i"
  );
  const m = html.match(re);
  return m?.[1] || m?.[2] || null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function absoluteUrl(base: string, maybeRelative: string | null): string {
  if (!maybeRelative) return "";
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

function hostAsOutlet(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Staff helper: fetch Open Graph title/image for a coverage URL.
 * Does not auto-save — the UI confirms before storing.
 */
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return jsonError("A valid http(s) URL is required", 400);
  }

  try {
    const pageRes = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
      next: { revalidate: 0 },
    });
    if (!pageRes.ok) {
      return jsonError(`Could not fetch URL (${pageRes.status})`, 502);
    }
    const html = await pageRes.text();
    const title =
      decodeEntities(
        pickMetaContent(html, "og:title") ||
          pickMetaContent(html, "twitter:title") ||
          html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ||
          ""
      ) || "";
    const image = absoluteUrl(
      pageRes.url || url,
      pickMetaContent(html, "og:image") ||
        pickMetaContent(html, "og:image:secure_url") ||
        pickMetaContent(html, "twitter:image")
    );
    const siteName = decodeEntities(
      pickMetaContent(html, "og:site_name") || ""
    );
    return jsonOk({
      title,
      image,
      outlet: siteName || hostAsOutlet(pageRes.url || url),
      final_url: pageRes.url || url,
    });
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "Could not fetch preview",
      502
    );
  }
}
