import type { Metadata } from "next";
import type { ContentItem } from "@/lib/types";
import { primaryImageUrl } from "@/lib/data/normalize";
import { plainTextFromHtml } from "@/lib/plain-text";
import { seedReleaseDocument } from "@/lib/pr/release-blocks";

export function releasePageMetadata(
  release: ContentItem,
  options?: { preview?: boolean }
): Metadata {
  const document = seedReleaseDocument(release.pr_document, release.notes);
  const title = document.share_title || release.title;
  const description =
    document.share_description ||
    plainTextFromHtml(release.caption || release.notes).slice(0, 160);
  const image = primaryImageUrl(release.asset_url);
  const keywords = document.seo.keywords
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  return {
    title: { absolute: `${title} | Peters & May Newsroom` },
    description,
    keywords,
    robots: options?.preview
      ? { index: false, follow: false }
      : {
          index: !document.seo.noindex,
          follow: !document.seo.nofollow,
          noarchive: document.seo.noarchive || undefined,
          nosnippet: document.seo.nosnippet || undefined,
          noimageindex: document.seo.noimageindex || undefined,
          notranslate: document.seo.notranslate || undefined,
        },
    alternates: document.seo.canonical
      ? { canonical: document.seo.canonical }
      : undefined,
    openGraph: {
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}
