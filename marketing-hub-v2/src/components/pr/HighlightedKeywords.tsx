import { highlightParts } from "@/lib/pr/mention-match";

export function HighlightedKeywords({
  text,
  keywords,
  className,
}: {
  text: string;
  keywords: string;
  className?: string;
}) {
  const parts = highlightParts(text, keywords);
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.match ? (
          <mark
            key={index}
            className="rounded bg-amber-200 px-0.5 font-semibold text-brand"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </span>
  );
}
