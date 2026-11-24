import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { NewsroomReleaseFrame } from "@/components/pr/NewsroomReleaseFrame";
import {
  getNewsroomSettings,
  getPublishedPressRelease,
  listPublishedPressReleases,
} from "@/lib/data/repos";
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
  const [settings, release, published, sessionUser] = await Promise.all([
    getNewsroomSettings(),
    getPublishedPressRelease(id),
    listPublishedPressReleases(),
    getSessionUser().catch(() => null),
  ]);
  if (!release) notFound();
  const document = seedReleaseDocument(release.pr_document, release.notes);
  if (document.seo.redirect_enabled) {
    const target = safeReleaseUrl(document.seo.redirect_url);
    if (target) redirect(target);
  }

  const related = published.filter((r) => r.id !== release.id).slice(0, 3);

  return (
    <NewsroomReleaseFrame
      settings={settings}
      release={release}
      related={related}
      signedIn={Boolean(sessionUser)}
    />
  );
}
