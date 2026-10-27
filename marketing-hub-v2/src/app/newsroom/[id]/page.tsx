import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NewsroomReleaseFrame } from "@/components/pr/NewsroomReleaseFrame";
import { getNewsroomSettings, getPublishedPressRelease } from "@/lib/data/repos";
import { releasePageMetadata } from "@/lib/pr/release-metadata";
import {
  safeReleaseUrl,
  seedReleaseDocument,
} from "@/lib/pr/release-blocks";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const release = await getPublishedPressRelease(id);
  if (!release) return { title: "Newsroom" };
  return releasePageMetadata(release);
}

export default async function NewsroomReleasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [settings, release] = await Promise.all([
    getNewsroomSettings(),
    getPublishedPressRelease(id),
  ]);
  if (!release) notFound();
  const document = seedReleaseDocument(release.pr_document, release.notes);
  if (document.seo.redirect_enabled) {
    const target = safeReleaseUrl(document.seo.redirect_url);
    if (target) redirect(target);
  }

  return <NewsroomReleaseFrame settings={settings} release={release} />;
}
