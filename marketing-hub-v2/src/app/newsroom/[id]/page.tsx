import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReleaseArticle } from "@/components/pr/ReleaseArticle";
import {
  getNewsroomSettings,
  getPublishedPressRelease,
} from "@/lib/data/repos";
import { plainTextFromHtml } from "@/lib/plain-text";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const release = await getPublishedPressRelease(id);
  if (!release) return { title: "Newsroom" };
  const description = plainTextFromHtml(release.caption || release.notes).slice(
    0,
    150
  );
  return {
    title: `${release.title} | Peters & May Newsroom`,
    description,
  };
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

  return (
    <div className="min-h-screen bg-white text-brand">
      <header className="border-b border-brand/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Peters &amp; May
            </p>
            <Link href="/newsroom" className="font-display text-2xl tracking-tight">
              {settings.title}
            </Link>
          </div>
          <Link href="/newsroom" className="text-sm text-muted hover:text-brand">
            All news
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-12">
        <ReleaseArticle
          title={release.title}
          subtitle={release.caption}
          location={release.pr_location ?? ""}
          date={release.due_date}
          body={release.notes}
          imageUrl={release.asset_url}
          boilerplate={release.pr_boilerplate ?? ""}
          contact={release.pr_contact ?? ""}
        />
      </main>
    </div>
  );
}
