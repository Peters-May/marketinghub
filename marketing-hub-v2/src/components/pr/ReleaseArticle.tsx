import { RichTextView } from "@/components/ui/RichTextView";
import { ReleaseGallery } from "@/components/pr/ReleaseGallery";
import { primaryImageUrl } from "@/lib/data/normalize";
import { isRichTextEmpty } from "@/lib/plain-text";
import { pressReleaseDateline } from "@/lib/pr/release-document";
import { releasePlainText } from "@/lib/pr/release-blocks";
import { isVideoUrl } from "@/lib/social/platforms";
import type { ReleaseAttachment, ReleaseBlock, ReleasePerson } from "@/lib/types";

function column(className = "") {
  return `mx-auto max-w-3xl ${className}`.trim();
}

function PersonCards({
  title,
  people,
}: {
  title: string;
  people: ReleasePerson[];
}) {
  if (!people.length) return null;
  return (
    <section className={column()}>
      <h2 className="font-display text-lg text-brand">{title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {people.map((person, index) => (
          <div key={`${person.email}-${index}`} className="rounded-lg border border-brand/10 p-3 text-sm">
            <p className="font-medium text-brand">{person.name}</p>
            {[person.role, person.organisation].filter(Boolean).length ? (
              <p className="text-muted">
                {[person.role, person.organisation].filter(Boolean).join(", ")}
              </p>
            ) : null}
            {person.email ? (
              <a className="mt-1 block text-accent underline" href={`mailto:${person.email}`}>
                {person.email}
              </a>
            ) : null}
            {person.phone ? <p className="text-brand/80">{person.phone}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ReleaseBlockView({ block }: { block: ReleaseBlock }) {
  switch (block.type) {
    case "text":
      return isRichTextEmpty(block.html) ? null : (
        <div className={column()}>
          <RichTextView html={block.html} className="text-base leading-relaxed" />
        </div>
      );
    case "lead":
      return isRichTextEmpty(block.html) ? null : (
        <div className={column()}>
          <RichTextView html={block.html} className="text-lg leading-relaxed text-brand/85" />
        </div>
      );
    case "annotation":
      return isRichTextEmpty(block.html) ? null : (
        <div className={column("border-l-2 border-brand/15 pl-4")}>
          <RichTextView html={block.html} className="text-sm text-muted" />
        </div>
      );
    case "header":
      return block.text ? (
        <h2 className={`${column()} font-display text-2xl text-brand`}>{block.text}</h2>
      ) : null;
    case "subheader":
      return block.text ? (
        <h3 className={`${column()} font-display text-xl text-brand`}>{block.text}</h3>
      ) : null;
    case "ul":
      return block.items.length ? (
        <ul className={`${column()} list-disc space-y-1 pl-5 text-base leading-relaxed`}>
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : null;
    case "ol":
      return block.items.length ? (
        <ol className={`${column()} list-decimal space-y-1 pl-5 text-base leading-relaxed`}>
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      ) : null;
    case "quote":
      if (!block.text && !block.attribution) return null;
      return (
        <blockquote className={`${column()} border-l-4 border-accent pl-4`}>
          {block.text ? <p className="text-lg italic text-brand">{block.text}</p> : null}
          {block.attribution ? (
            <p className="mt-2 text-sm text-muted">{block.attribution}</p>
          ) : null}
        </blockquote>
      );
    case "table":
      if (!block.rows.length) return null;
      return (
        <div className={`${column()} overflow-x-auto`}>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border border-brand/15 px-3 py-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "divider":
      return <hr className={`${column()} border-brand/15`} />;
    case "image":
    case "full_image": {
      if (!block.src) return null;
      const wide = block.type === "full_image";
      return (
        <figure className={wide ? "w-full" : column()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.src}
            alt={block.alt}
            className={wide ? "max-h-[36rem] w-full rounded-xl object-cover" : "max-h-[28rem] w-full rounded-xl object-cover"}
          />
          {block.caption ? (
            <figcaption className="mt-2 text-sm text-muted">{block.caption}</figcaption>
          ) : null}
        </figure>
      );
    }
    case "gallery":
      return <ReleaseGallery images={block.images} />;
    case "full_video":
      if (!block.src) return null;
      if (!isVideoUrl(block.src)) {
        return (
          <p className={column()}>
            <a className="text-accent underline" href={block.src}>
              Watch the video
            </a>
          </p>
        );
      }
      return (
        <video
          className="max-h-[36rem] w-full rounded-xl bg-black"
          controls
          src={block.src}
          poster={block.poster || undefined}
        />
      );
    case "button":
      if (!block.label || !block.href) return null;
      return (
        <p className={column()}>
          <a
            href={block.href}
            className="inline-flex rounded-lg bg-brand px-4 py-2 text-sm text-white"
          >
            {block.label}
          </a>
        </p>
      );
    case "authors":
      return <PersonCards title="Authors" people={block.people} />;
    case "spokespeople":
      return <PersonCards title="Spokespeople" people={block.people} />;
    default:
      return null;
  }
}

export function ReleaseArticle({
  title,
  subtitle,
  location,
  date,
  showDate = true,
  body,
  blocks = [],
  imageUrl,
  boilerplate,
  contact,
  tags = [],
  showTags = false,
  attachments = [],
  journalistToolbox = false,
}: {
  title: string;
  subtitle: string;
  location: string;
  date: string | null;
  showDate?: boolean;
  body?: string;
  blocks?: ReleaseBlock[];
  imageUrl: string;
  boilerplate: string;
  contact: string;
  tags?: string[];
  showTags?: boolean;
  attachments?: ReleaseAttachment[];
  journalistToolbox?: boolean;
}) {
  const dateline = pressReleaseDateline(location, showDate ? date : null);
  const image = primaryImageUrl(imageUrl);
  const plain = journalistToolbox
    ? releasePlainText({
        title,
        subtitle,
        location,
        date,
        showDate,
        blocks,
        boilerplate,
        contact,
        attachments,
      })
    : "";

  return (
    <article className="space-y-6">
      <header className={column()}>
        {dateline ? (
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
            {dateline}
          </p>
        ) : null}
        <h1 className="mt-3 font-display text-3xl leading-tight text-brand md:text-4xl">
          {title || "Untitled press release"}
        </h1>
        {!isRichTextEmpty(subtitle) ? (
          <div className="mt-4">
            <RichTextView
              html={subtitle}
              className="text-lg leading-relaxed text-brand/80"
            />
          </div>
        ) : null}
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="mt-6 max-h-[28rem] w-full rounded-xl object-cover"
          />
        ) : null}
      </header>

      {blocks.length ? (
        blocks.map((block) => <ReleaseBlockView key={block.id} block={block} />)
      ) : !isRichTextEmpty(body) ? (
        <div className={column()}>
          <RichTextView html={body} className="text-base leading-relaxed" />
        </div>
      ) : null}

      {!isRichTextEmpty(boilerplate) ? (
        <section className={`${column()} border-t border-brand/10 pt-6`}>
          <h2 className="font-display text-lg text-brand">About Peters &amp; May</h2>
          <div className="mt-3">
            <RichTextView html={boilerplate} />
          </div>
        </section>
      ) : null}
      {contact.trim() ? (
        <section className={`${column()} border-t border-brand/10 pt-6`}>
          <h2 className="font-display text-lg text-brand">Media contact</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-brand/90">
            {contact}
          </p>
        </section>
      ) : null}
      {showTags && tags.length ? (
        <ul className={`${column()} flex flex-wrap gap-2`}>
          {tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full border border-brand/15 px-2.5 py-1 text-xs text-brand"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      {attachments.length ? (
        <section className={`${column()} border-t border-brand/10 pt-6`}>
          <h2 className="font-display text-lg text-brand">Attachments</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {attachments.map((file) => (
              <li key={file.url}>
                <a className="text-accent underline" href={file.url}>
                  {file.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {journalistToolbox ? (
        <section className={`${column()} rounded-xl bg-mist/70 p-4`}>
          <h2 className="font-display text-lg text-brand">For journalists</h2>
          <p className="mt-1 text-sm text-muted">
            Plain text of this release, with the files above.
          </p>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-relaxed text-brand">
            {plain}
          </pre>
        </section>
      ) : null}
    </article>
  );
}
