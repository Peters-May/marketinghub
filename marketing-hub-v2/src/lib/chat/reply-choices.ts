/**
 * Closed-set questions can offer tappable answers.
 * The model may end a reply with [[choices: Yacht | Freight | Something else]].
 * A short "A, B, or C?" question is inferred when that line is missing.
 * Open questions (name, email, dimensions) stay free-type only.
 */

const TAGGED = /\[\[choices:\s*([^\]]+?)\]\]/gi;

const OPEN_FIELD =
  /\b(name|e-?mail|company|length|loa|beam|height|weight|displacement|value|destination|port|dimension|phone|address|timeframe)\b/i;

const DEFAULT_ROUTE_CHOICES = [
  "Yacht transport",
  "Freight or cargo",
  "Something else",
];

export function extractReplyChoices(raw: string): {
  body: string;
  choices: string[];
} {
  const text = String(raw || "").trim();
  const tagged = [...text.matchAll(TAGGED)];
  const body = text
    .replace(TAGGED, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (tagged.length > 0) {
    const choices = uniqueChoices(
      tagged[tagged.length - 1][1].split("|").map(tidyChoice)
    );
    return { body, choices };
  }
  return { body, choices: inferChoices(body) };
}

function tidyChoice(raw: string): string {
  let t = raw.replace(/\s+/g, " ").replace(/[?.]+$/g, "").trim();
  t = t.replace(
    /^(you(?:'re| are)\s+looking to\s+(?:transport|ship|move)\s+)/i,
    ""
  );
  t = t.replace(/^or\s+/i, "");
  t = t.replace(/^(a|an|the)\s+/i, "");
  if (t.length < 2 || t.length > 40) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function uniqueChoices(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
    if (out.length >= 5) break;
  }
  return out.length >= 2 ? out : [];
}

function inferChoices(body: string): string[] {
  if (!body || body.length > 900) return [];

  // Model often asks the route question without [[choices:]] — still show buttons.
  if (looksLikeRouteClassification(body)) {
    return [...DEFAULT_ROUTE_CHOICES];
  }

  if (looksLikeYachtStatusQuestion(body)) {
    return ["Trailer", "In the water", "Ashore in a yard"];
  }

  if (looksLikeModeQuestion(body)) {
    return ["Air", "Sea", "Road", "Not sure"];
  }

  const question = body.match(/([^.!?\n]{8,220}\?)\s*$/);
  if (!question) return [];
  const sentence = question[1];
  if (!/\bor\b/i.test(sentence)) return [];
  if (
    !/\b(whether|either|or something else|which of|looking to|yacht|freight)\b/i.test(
      sentence
    )
  ) {
    return [];
  }
  if (OPEN_FIELD.test(sentence) && !/something else/i.test(sentence)) {
    return [];
  }

  let clause = sentence.replace(/\?\s*$/, "");
  const whether = clause.match(/\bwhether\b\s+([\s\S]+)$/i);
  if (whether) clause = whether[1];
  clause = clause.replace(
    /^.*?\b(?:looking to|want to|like to)\s+(?:transport|ship|move)\s+/i,
    ""
  );

  const parts = clause
    .split(/\s*,\s*|\s+\bor\b\s+/i)
    .map((part) =>
      part.replace(
        /^you(?:'re| are)\s+looking to\s+(?:transport|ship|move)\s+/i,
        ""
      )
    )
    .map(tidyChoice);

  if (parts.some((part) => part && OPEN_FIELD.test(part))) return [];
  return uniqueChoices(parts);
}

/** Vague “what are you shipping?” style — offer yacht / freight chips. */
function looksLikeRouteClassification(body: string): boolean {
  const t = body.toLowerCase();
  if (OPEN_FIELD.test(t) && !/something else/.test(t)) {
    // Asking for name/email/dimensions is not a route picker.
    if (
      /\b(name|e-?mail|length|beam|weight|value|cradle)\b/i.test(t) &&
      !/\byacht\b.*\bfreight\b|\bfreight\b.*\byacht\b/i.test(t)
    ) {
      return false;
    }
  }
  return (
    /what are you looking to (ship|move|transport)/i.test(t) ||
    /what (?:would you like|do you (?:want|need)) to (ship|move|transport)/i.test(
      t
    ) ||
    /looking to (?:ship|move|transport).{0,40}from where to where/i.test(t) ||
    /yacht.{0,40}freight|freight.{0,40}yacht/i.test(t) ||
    /what (?:kind of )?(?:enquiry|shipment|move) is this/i.test(t) ||
    /what can we help you with/i.test(t)
  );
}

function looksLikeYachtStatusQuestion(body: string): boolean {
  const t = body.toLowerCase();
  return (
    /\btrailer\b/.test(t) &&
    /\b(water|afloat)\b/.test(t) &&
    /\b(ashore|yard|hardstanding|hard standing)\b/.test(t)
  );
}

function looksLikeModeQuestion(body: string): boolean {
  const t = body.toLowerCase();
  if (!/\b(air|sea|road)\b/.test(t)) return false;
  return (
    /\b(air|sea|road).{0,30}\bor\b.{0,30}(air|sea|road)/i.test(t) ||
    /prefer(?:red)? (?:mode|method|transport).{0,40}\?/i.test(t) ||
    /by air.{0,20}by sea|air freight or sea/i.test(t)
  );
}
