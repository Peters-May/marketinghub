import {
  brandedDetailRowsHtml,
  brandedPanelHtml,
  escapeHtml,
} from "@/lib/email/brand-shell";
import type { ChatMessage } from "@/lib/types";

export type QuoteField = { label: string; value: string };

export type ParsedGuidedQuote = {
  kind: "yacht" | "freight" | "unknown";
  mode: "guided" | "pasted";
  title: string;
  fields: QuoteField[];
  /** Free-text paste body when mode is pasted and no Label: value lines. */
  pastedBody: string;
};

const GUIDED_HEAD =
  /^(Yacht transport|Freight\s*\/\s*cargo)\s+enquiry\s+\(guided form\):\s*$/i;
const PASTED_HEAD =
  /^(Yacht transport|Freight\s*\/\s*cargo)\s+enquiry\s+\(pasted details\):\s*$/i;

/** Detect and parse a guided / pasted quote message from the visitor. */
export function parseGuidedQuote(body: string): ParsedGuidedQuote | null {
  const raw = String(body || "").trim();
  if (!raw) return null;
  const lines = raw.split(/\r?\n/);
  const first = (lines[0] || "").trim();
  const guided = GUIDED_HEAD.exec(first);
  const pasted = PASTED_HEAD.exec(first);
  if (!guided && !pasted) {
    // Fallback: multi-line Label: value dump that looks like a quote.
    if (
      lines.length >= 4 &&
      /\b(length \(loa\)|make and model|business email|destination)\b/i.test(raw)
    ) {
      const fields = parseLabelValueLines(lines);
      if (fields.length < 3) return null;
      return {
        kind: /freight|cargo/i.test(raw) ? "freight" : "yacht",
        mode: "guided",
        title: /freight|cargo/i.test(raw)
          ? "Freight / cargo enquiry"
          : "Yacht transport enquiry",
        fields,
        pastedBody: "",
      };
    }
    return null;
  }

  const kind: ParsedGuidedQuote["kind"] = /freight/i.test(first)
    ? "freight"
    : /yacht/i.test(first)
      ? "yacht"
      : "unknown";
  const mode: ParsedGuidedQuote["mode"] = guided ? "guided" : "pasted";
  const title =
    kind === "freight"
      ? mode === "pasted"
        ? "Freight / cargo enquiry (pasted)"
        : "Freight / cargo enquiry"
      : mode === "pasted"
        ? "Yacht transport enquiry (pasted)"
        : "Yacht transport enquiry";

  const rest = lines.slice(1);
  const fields = parseLabelValueLines(rest);
  if (fields.length >= 2) {
    return { kind, mode, title, fields, pastedBody: "" };
  }

  const pastedBody = rest.join("\n").trim();
  if (mode === "pasted" && pastedBody) {
    return { kind, mode, title, fields: [], pastedBody };
  }
  if (fields.length) {
    return { kind, mode, title, fields, pastedBody: "" };
  }
  return null;
}

function parseLabelValueLines(lines: string[]): QuoteField[] {
  const fields: QuoteField[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = /^([^:]{2,80}):\s*(.+)$/.exec(trimmed);
    if (!m) continue;
    const label = m[1].trim();
    const value = m[2].trim();
    if (!label || !value) continue;
    // Skip narrative lines that aren't form fields.
    if (label.length > 60) continue;
    fields.push({ label, value });
  }
  return fields;
}

/** HTML table panel for a parsed quote (quote-email style). */
export function guidedQuoteTableHtml(quote: ParsedGuidedQuote): string {
  if (quote.fields.length) {
    const rows = quote.fields.map((f) => {
      const email =
        /e-?mail/i.test(f.label) && f.value.includes("@")
          ? `mailto:${f.value}`
          : undefined;
      return { label: f.label, value: f.value, href: email };
    });
    return brandedPanelHtml(quote.title, brandedDetailRowsHtml(rows));
  }
  if (quote.pastedBody) {
    return brandedPanelHtml(
      quote.title,
      `<p style="margin:0;font-size:14px;color:#0B2545;white-space:pre-wrap;">${escapeHtml(quote.pastedBody).replace(/\n/g, "<br/>")}</p>`
    );
  }
  return "";
}

export type ConversationBlock =
  | { type: "chat"; lines: string[] }
  | { type: "quote"; quote: ParsedGuidedQuote };

/** Split messages into chat lines and quote tables for email layout. */
export function splitMessagesForEmail(
  messages: ChatMessage[]
): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];
  let chatBuf: string[] = [];

  const flushChat = () => {
    if (!chatBuf.length) return;
    blocks.push({ type: "chat", lines: chatBuf });
    chatBuf = [];
  };

  for (const m of messages) {
    const body = (m.body ?? "").trim();
    if (!body && !(m.attachments?.length)) continue;

    if (m.role === "visitor") {
      const quote = parseGuidedQuote(body);
      if (quote) {
        flushChat();
        blocks.push({ type: "quote", quote });
        continue;
      }
    }

    const files = (m.attachments ?? [])
      .map((a) => `${a.name} (${a.url})`)
      .join("; ");
    let line =
      m.role === "visitor"
        ? body
        : m.role === "assistant"
          ? `Assistant: ${body}`
          : m.role === "staff"
            ? `${m.author_name?.trim() || "Team"}: ${body}`
            : body;
    if (files) {
      line = body
        ? `${line}\n[Attachments] ${files}`
        : `[Attachments] ${files}`;
    }
    chatBuf.push(line.slice(0, 2000));
  }
  flushChat();
  return blocks;
}

/** Full HTML for conversation + quote tables (chat above/below quotes). */
export function conversationEmailHtml(
  messages: ChatMessage[],
  opts?: { maxChatLines?: number }
): string {
  const maxChat = opts?.maxChatLines ?? 40;
  let blocks = splitMessagesForEmail(messages);

  // For short lead alerts, keep a tighter window around the quote.
  if (opts?.maxChatLines != null) {
    const quoteIdx = blocks.findIndex((b) => b.type === "quote");
    if (quoteIdx >= 0) {
      const before = blocks.slice(0, quoteIdx);
      const quote = blocks[quoteIdx];
      const after = blocks.slice(quoteIdx + 1);
      const trimChat = (b: ConversationBlock): ConversationBlock => {
        if (b.type !== "chat") return b;
        return { type: "chat", lines: b.lines.slice(-Math.max(2, maxChat)) };
      };
      blocks = [
        ...before.map(trimChat),
        quote,
        ...after.map(trimChat),
      ].filter((b) => b.type === "quote" || (b.type === "chat" && b.lines.length));
    } else {
      // No quote — last few chat lines only.
      blocks = blocks
        .map((b): ConversationBlock => {
          if (b.type !== "chat") return b;
          return { type: "chat", lines: b.lines.slice(-maxChat) };
        })
        .filter((b) => b.type === "quote" || (b.type === "chat" && b.lines.length));
    }
  }

  return blocks
    .map((b) => {
      if (b.type === "quote") return guidedQuoteTableHtml(b.quote);
      const inner = b.lines
        .map(
          (line) =>
            `<p style="margin:0 0 10px;font-size:14px;color:#0B2545;">${escapeHtml(line).replace(/\n/g, "<br/>")}</p>`
        )
        .join("");
      return brandedPanelHtml("Conversation", inner);
    })
    .join("");
}

/** Plain-text fallback with quote as aligned rows. */
export function conversationEmailText(messages: ChatMessage[]): string {
  const blocks = splitMessagesForEmail(messages);
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "chat") {
      parts.push("Conversation:", ...b.lines.map((l) => `- ${l}`), "");
      continue;
    }
    parts.push(b.quote.title, "---");
    if (b.quote.fields.length) {
      for (const f of b.quote.fields) {
        parts.push(`${f.label}: ${f.value}`);
      }
    } else if (b.quote.pastedBody) {
      parts.push(b.quote.pastedBody);
    }
    parts.push("");
  }
  return parts.join("\n").trim();
}
