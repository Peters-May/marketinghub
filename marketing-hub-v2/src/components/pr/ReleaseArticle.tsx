import { RichTextView } from "@/components/ui/RichTextView";
import { primaryImageUrl } from "@/lib/data/normalize";
import { isRichTextEmpty } from "@/lib/plain-text";
import { pressReleaseDateline } from "@/lib/pr/release-document";

export function ReleaseArticle({
  title,
  subtitle,
  location,
  date,
  body,
  imageUrl,
  boilerplate,
  contact,
}: {
  title: string;
  subtitle: string;
  location: string;
  date: string | null;
  body: string;
  imageUrl: string;
  boilerplate: string;
  contact: string;
}) {
  const dateline = pressReleaseDateline(location, date);
  const image = primaryImageUrl(imageUrl);

  return (
    <article className="mx-auto max-w-3xl">
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
        // Newsroom images are staff uploads or pasted URLs, not a fixed remote host.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="mt-6 max-h-[28rem] w-full rounded-xl object-cover"
        />
      ) : null}
      {!isRichTextEmpty(body) ? (
        <div className="mt-6">
          <RichTextView html={body} className="text-base leading-relaxed" />
        </div>
      ) : null}
      {!isRichTextEmpty(boilerplate) ? (
        <section className="mt-10 border-t border-brand/10 pt-6">
          <h2 className="font-display text-lg text-brand">About Peters &amp; May</h2>
          <div className="mt-3">
            <RichTextView html={boilerplate} />
          </div>
        </section>
      ) : null}
      {contact.trim() ? (
        <section className="mt-8 border-t border-brand/10 pt-6">
          <h2 className="font-display text-lg text-brand">Media contact</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-brand/90">
            {contact}
          </p>
        </section>
      ) : null}
    </article>
  );
}
