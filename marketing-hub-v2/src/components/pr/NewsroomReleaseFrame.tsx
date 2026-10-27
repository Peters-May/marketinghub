import Link from "next/link";
import type { ContentItem, NewsroomSettings } from "@/lib/types";
import { ReleaseArticle } from "@/components/pr/ReleaseArticle";
import { NewsroomHeader } from "@/components/pr/NewsroomHeader";
import { seedReleaseDocument } from "@/lib/pr/release-blocks";

export function NewsroomReleaseFrame({
  settings,
  release,
  preview = false,
}: {
  settings: NewsroomSettings;
  release: ContentItem;
  preview?: boolean;
}) {
  const document = seedReleaseDocument(release.pr_document, release.notes);
  return (
    <div className="min-h-screen bg-white text-brand">
      {preview ? (
        <p className="bg-mist px-6 py-2 text-center text-sm text-brand">
          Preview. This page is not on the public newsroom.
        </p>
      ) : null}
      <NewsroomHeader
        settings={settings}
        trailing={
          <Link href="/newsroom" className="text-sm text-muted hover:text-brand">
            All news
          </Link>
        }
      />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <ReleaseArticle
          title={release.title}
          subtitle={release.caption}
          location={release.pr_location ?? ""}
          date={release.due_date}
          showDate={document.show_date}
          body={release.notes}
          blocks={document.blocks}
          imageUrl={release.asset_url}
          boilerplate={release.pr_boilerplate ?? ""}
          contact={release.pr_contact ?? ""}
          tags={document.tags}
          showTags={document.show_tags}
          attachments={document.attachments}
          journalistToolbox={document.journalist_toolbox}
        />
      </main>
    </div>
  );
}
