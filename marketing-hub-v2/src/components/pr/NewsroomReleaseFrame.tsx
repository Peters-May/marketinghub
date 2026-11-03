import Link from "next/link";
import type { ContentItem, NewsroomSettings } from "@/lib/types";
import { ReleaseBody } from "@/components/pr/ReleaseArticle";
import { NewsroomHeader } from "@/components/pr/NewsroomHeader";
import { NewsroomFooter } from "@/components/newsroom/NewsroomFooter";
import { ReleaseRegister } from "@/components/newsroom/ReleaseRegister";
import { CopyButton } from "@/components/newsroom/CopyButton";
import { RichTextView } from "@/components/ui/RichTextView";
import { primaryImageUrl } from "@/lib/data/normalize";
import { isRichTextEmpty } from "@/lib/plain-text";
import { formatReleaseDate } from "@/lib/pr/release-document";
import { releasePlainText, seedReleaseDocument } from "@/lib/pr/release-blocks";
import {
  MEDIA_DESK_EMAIL,
  releaseTopics,
  releaseUrl,
  topicSlug,
} from "@/lib/pr/newsroom-view";

function SidePanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[#E3E6E9] pt-5">
      <h2 className="font-display text-base text-[#0B2545]">{title}</h2>
      <div className="mt-3 text-sm">{children}</div>
    </section>
  );
}

const sideLink =
  "font-medium text-[#007DC5] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007DC5]";

export function NewsroomReleaseFrame({
  settings,
  release,
  related = [],
  preview = false,
}: {
  settings: NewsroomSettings;
  release: ContentItem;
  /** Other published releases to suggest under the story. */
  related?: ContentItem[];
  preview?: boolean;
}) {
  const document = seedReleaseDocument(release.pr_document, release.notes);
  const date = release.due_date;
  const location = (release.pr_location ?? "").trim();
  const shownDate = document.show_date ? formatReleaseDate(date) : "";
  const image = primaryImageUrl(release.asset_url);
  const topics = releaseTopics(release);
  const boilerplate = release.pr_boilerplate ?? "";
  const contact = (release.pr_contact ?? "").trim();
  const url = releaseUrl(release.id);
  const plain = document.journalist_toolbox
    ? releasePlainText({
        title: release.title,
        subtitle: release.caption,
        location,
        date,
        showDate: document.show_date,
        blocks: document.blocks,
        boilerplate,
        contact,
        attachments: document.attachments,
      })
    : "";
  const shareText = encodeURIComponent(release.title);
  const shareUrl = encodeURIComponent(url);

  return (
    <div className="min-h-screen bg-white text-[#0B2545]">
      {preview ? (
        <p className="bg-[#FFF4D6] px-6 py-2 text-center text-sm text-[#0B2545]">
          Preview. This page is not on the public newsroom.
        </p>
      ) : null}
      <NewsroomHeader settings={settings} active="release" />

      <div className="border-b border-[#E3E6E9] bg-[#F5F7F9]">
        <header className="mx-auto max-w-6xl px-6 py-10 md:py-14">
          <nav aria-label="Breadcrumb" className="text-sm text-[#4D5C6A]">
            <Link href="/newsroom" className="hover:text-[#0B2545] hover:underline">
              Newsroom
            </Link>
            <span className="px-2" aria-hidden>
              /
            </span>
            <span>Press release</span>
          </nav>
          {location || shownDate ? (
            <p className="mt-6 text-sm font-medium text-[#0B2545]">
              {[location ? location.toUpperCase() : "", shownDate]
                .filter(Boolean)
                .join(", ")}
            </p>
          ) : null}
          <h1 className="mt-3 max-w-4xl font-display text-3xl leading-[1.1] tracking-tight md:text-5xl">
            {release.title || "Untitled press release"}
          </h1>
          {!isRichTextEmpty(release.caption) ? (
            <div className="mt-5 max-w-[65ch]">
              <RichTextView
                html={release.caption}
                className="text-lg leading-relaxed text-[#4D5C6A]"
              />
            </div>
          ) : null}
        </header>
      </div>

      <main className="mx-auto grid max-w-6xl gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <article className="min-w-0 space-y-6">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="mb-4 max-h-[32rem] w-full rounded-sm object-cover"
            />
          ) : null}
          <ReleaseBody body={release.notes} blocks={document.blocks} />

          {!isRichTextEmpty(boilerplate) ? (
            <section className="max-w-[68ch] border-t-2 border-[#0B2545] pt-6">
              <h2 className="font-display text-lg">About Peters &amp; May</h2>
              <div className="mt-3 text-sm leading-relaxed text-[#4D5C6A]">
                <RichTextView html={boilerplate} />
              </div>
            </section>
          ) : null}
        </article>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <SidePanel title="Release details">
            <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-y-2">
              {shownDate ? (
                <>
                  <dt className="text-[#4D5C6A]">Published</dt>
                  <dd>{shownDate}</dd>
                </>
              ) : null}
              {location ? (
                <>
                  <dt className="text-[#4D5C6A]">Location</dt>
                  <dd>{location}</dd>
                </>
              ) : null}
              {topics.length ? (
                <>
                  <dt className="text-[#4D5C6A]">Topics</dt>
                  <dd className="space-x-1">
                    {topics.map((t, i) => (
                      <span key={t}>
                        <Link
                          href={`/newsroom?topic=${topicSlug(t)}#releases`}
                          className="text-[#007DC5] underline-offset-4 hover:underline"
                        >
                          {t}
                        </Link>
                        {i < topics.length - 1 ? "," : ""}
                      </span>
                    ))}
                  </dd>
                </>
              ) : null}
            </dl>
          </SidePanel>

          <SidePanel title="Media contact">
            {contact ? (
              <p className="whitespace-pre-wrap leading-relaxed">{contact}</p>
            ) : (
              <>
                <p>Peters &amp; May media desk</p>
                <a href={`mailto:${MEDIA_DESK_EMAIL}`} className={`mt-1 block ${sideLink}`}>
                  {MEDIA_DESK_EMAIL}
                </a>
              </>
            )}
          </SidePanel>

          {image || document.attachments.length ? (
            <SidePanel title="Downloads">
              <ul className="space-y-2">
                {image ? (
                  <li>
                    <a href={image} download className={sideLink}>
                      Main image
                    </a>
                  </li>
                ) : null}
                {document.attachments.map((file) => (
                  <li key={file.url}>
                    <a href={file.url} className={sideLink}>
                      {file.name}
                    </a>
                  </li>
                ))}
                <li>
                  <Link href="/media" className={sideLink}>
                    Full media kit
                  </Link>
                </li>
              </ul>
            </SidePanel>
          ) : null}

          {plain ? (
            <SidePanel title="For journalists">
              <p className="text-[#4D5C6A]">
                The full release as plain text, ready to paste.
              </p>
              <CopyButton
                text={plain}
                label="Copy release text"
                copiedLabel="Release text copied"
                className="mt-3"
              />
            </SidePanel>
          ) : null}

          {!preview ? (
            <SidePanel title="Share">
              <ul className="space-y-2">
                <li>
                  <a
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={sideLink}
                  >
                    Share on LinkedIn
                  </a>
                </li>
                <li>
                  <a
                    href={`mailto:?subject=${shareText}&body=${shareUrl}`}
                    className={sideLink}
                  >
                    Send by email
                  </a>
                </li>
                <li>
                  <CopyButton text={url} label="Copy link" copiedLabel="Link copied" />
                </li>
              </ul>
            </SidePanel>
          ) : null}
        </aside>
      </main>

      {related.length ? (
        <section aria-labelledby="more-title" className="mx-auto max-w-6xl px-6">
          <div className="flex items-end justify-between border-b-2 border-[#0B2545] pb-3">
            <h2 id="more-title" className="font-display text-2xl">
              More from the newsroom
            </h2>
            <Link href="/newsroom#releases" className="text-sm text-[#007DC5] underline-offset-4 hover:underline">
              All press releases
            </Link>
          </div>
          <ReleaseRegister releases={related} showSummary={false} />
        </section>
      ) : null}

      <NewsroomFooter />
    </div>
  );
}
