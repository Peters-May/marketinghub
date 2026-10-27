import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NewsroomReleaseFrame } from "@/components/pr/NewsroomReleaseFrame";
import { getSessionUser } from "@/lib/auth/session";
import { getNewsroomSettings, getPressRelease } from "@/lib/data/repos";
import { releasePageMetadata } from "@/lib/pr/release-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return { title: "Preview", robots: { index: false, follow: false } };
  const release = await getPressRelease(id);
  if (!release) return { title: "Preview", robots: { index: false, follow: false } };
  return releasePageMetadata(release, { preview: true });
}

export default async function NewsroomPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/newsroom/preview/${id}`)}`);
  }
  const [settings, release] = await Promise.all([
    getNewsroomSettings(),
    getPressRelease(id),
  ]);
  if (!release) notFound();
  return <NewsroomReleaseFrame settings={settings} release={release} preview />;
}
