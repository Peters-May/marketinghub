/**
 * Find which monitoring keywords appear in a mention title or excerpt.
 * Phrase hits ("Peters & May") are preferred. Separate words are reported
 * so a loose match such as "Peters" plus the verb "may" is visible.
 */

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "that",
  "this",
]);

export type MentionMatchKind = "phrase" | "word" | "none";

export type MentionMatch = {
  kind: MentionMatchKind;
  phrases: string[];
  words: string[];
};

export type HighlightPart = {
  text: string;
  match: boolean;
};

export function splitKeywordTerms(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function phraseVariants(phrase: string): string[] {
  const cleaned = phrase.replace(/\s+/g, " ").trim();
  const variants = new Set<string>([cleaned]);
  if (/&/.test(cleaned) || /\band\b/i.test(cleaned)) {
    variants.add(cleaned.replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ").trim());
    variants.add(
      cleaned.replace(/\s+and\s+/gi, " & ").replace(/\s+/g, " ").trim()
    );
    variants.add(
      cleaned
        .replace(/\s*&\s*/g, " ")
        .replace(/\band\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  }
  return [...variants].filter(Boolean);
}

function fold(value: string): string {
  return value.replace(/&amp;/gi, "&").toLowerCase();
}

function containsVariant(text: string, variant: string): boolean {
  const hay = fold(text);
  const needle = fold(variant);
  if (!needle) return false;
  if (!/\s/.test(needle)) {
    return new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i").test(hay);
  }
  const re = new RegExp(
    `(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`,
    "gi"
  );
  const verbMay = !/&|\band\b/.test(needle) && needle.endsWith(" may");
  for (const found of hay.matchAll(re)) {
    if (verbMay) {
      const after = hay.slice((found.index ?? 0) + found[0].length).trimStart();
      if (/^(not|be|have|been|never)\b/.test(after)) continue;
    }
    return true;
  }
  return false;
}

export function analyseMentionText(
  text: string,
  keywords: string
): MentionMatch {
  const phrases = splitKeywordTerms(keywords);
  const foundPhrases = phrases.filter((phrase) =>
    phraseVariants(phrase).some((variant) => containsVariant(text, variant))
  );
  if (foundPhrases.length) {
    return { kind: "phrase", phrases: foundPhrases, words: [] };
  }

  const words: string[] = [];
  for (const phrase of phrases) {
    for (const word of phrase.split(/[^A-Za-z0-9]+/)) {
      if (word.length < 3) continue;
      if (STOP_WORDS.has(word.toLowerCase())) continue;
      if (words.some((existing) => existing.toLowerCase() === word.toLowerCase())) {
        continue;
      }
      if (containsVariant(text, word)) words.push(word);
    }
  }
  return {
    kind: words.length ? "word" : "none",
    phrases: [],
    words,
  };
}

export function textContainsKeywordPhrase(
  text: string,
  keywords: string
): boolean {
  return analyseMentionText(text, keywords).kind === "phrase";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function needlesFor(match: MentionMatch): string[] {
  const raw =
    match.kind === "phrase"
      ? match.phrases.flatMap(phraseVariants)
      : match.words;
  return [...new Set(raw.map((item) => item.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
}

export function highlightParts(text: string, keywords: string): HighlightPart[] {
  if (!text) return [];
  const needles = needlesFor(analyseMentionText(text, keywords));
  if (!needles.length) return [{ text, match: false }];

  const pattern = needles
    .map((needle) => {
      const escaped = escapeRegExp(needle);
      return /\s/.test(needle)
        ? `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`
        : `\\b${escaped}\\b`;
    })
    .join("|");
  const re = new RegExp(pattern, "gi");
  const parts: HighlightPart[] = [];
  let last = 0;
  for (const found of text.matchAll(re)) {
    const index = found.index ?? 0;
    if (index > last) {
      parts.push({ text: text.slice(last, index), match: false });
    }
    parts.push({ text: found[0], match: true });
    last = index + found[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts.length ? parts : [{ text, match: false }];
}

export function mentionMatchNote(
  keywords: string,
  title: string,
  snippet: string
): string | null {
  const terms = splitKeywordTerms(keywords);
  if (!terms.length) return null;
  const match = analyseMentionText(`${title}\n${snippet}`, keywords);
  if (match.kind === "phrase") return null;
  const label = terms.map((term) => `“${term}”`).join(" or ");
  if (match.kind === "word") {
    return `Highlighted: ${match.words.join(", ")}. ${label} does not appear together in this title or excerpt.`;
  }
  return `${label} does not appear in this title or excerpt. The article was matched in text that is not shown here.`;
}
