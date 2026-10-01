import { addDays, format, nextDay, startOfDay } from "date-fns";
import type { ContentStatus } from "@/lib/types";

export type HubDataArea = "tasks" | "events" | "content";

export const COMMAND_EXAMPLES = [
  "Add a task to call the organiser, due Friday",
  "Add an event Monaco Yacht Show on 12 Oct 2026 in Monaco",
  "Add a LinkedIn post about autumn yacht moves, due next Tuesday",
  "Update task call the organiser status done",
  "Update event Monaco Yacht Show location Port Hercules",
];

export type CommandVerb = "Add" | "Update";

type CommandBase = {
  summary: string;
  verb: CommandVerb;
  href: string;
  area: HubDataArea;
};

export type HubCommand = CommandBase &
  (
    | {
        kind: "create_task";
        title: string;
        details: string;
        due_date: string | null;
        owner: string;
        status: string;
      }
    | {
        kind: "update_task";
        query: string;
        patch: {
          status?: string;
          owner?: string;
          due_date?: string | null;
          title?: string;
          details?: string;
        };
      }
    | {
        kind: "create_event";
        title: string;
        starts_at: string | null;
        location: string;
        event_type: string;
        notes: string;
      }
    | {
        kind: "update_event";
        query: string;
        patch: {
          starts_at?: string | null;
          location?: string;
          title?: string;
          notes?: string;
          event_type?: string;
        };
      }
    | {
        kind: "create_content";
        title: string;
        channel: string[];
        due_date: string | null;
        caption: string;
        notes: string;
        status: ContentStatus;
      }
    | {
        kind: "update_content";
        query: string;
        patch: {
          status?: ContentStatus;
          due_date?: string | null;
          title?: string;
          caption?: string;
          notes?: string;
          channel?: string[];
        };
      }
  );

export type ParseResult =
  | { ok: true; command: HubCommand }
  | { ok: false; message: string; examples: string[] };

type Target = "task" | "event" | "content";

type Fields = {
  due?: string;
  owner?: string;
  status?: string;
  location?: string;
  notes?: string;
  caption?: string;
  channel?: string[];
  type?: string;
  title?: string;
};

const CHANNELS: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  newsletter: "Newsletter",
  twitter: "X",
  x: "X",
};

const CHANNEL_PATTERN =
  "linkedin|instagram|facebook|tiktok|youtube|newsletter|twitter|x";

const TARGET_PATTERN = "social post|to-do|to do|todo|task|event|content|post";

const KEYWORD =
  "due|deadline|owner|status|location|notes|details|caption|channel|type|title|on|by|in|at|as|to";

const WEEKDAYS: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTHS: { name: string; month: number }[] = [
  { name: "january", month: 0 },
  { name: "february", month: 1 },
  { name: "march", month: 2 },
  { name: "april", month: 3 },
  { name: "may", month: 4 },
  { name: "june", month: 5 },
  { name: "july", month: 6 },
  { name: "august", month: 7 },
  { name: "september", month: 8 },
  { name: "october", month: 9 },
  { name: "november", month: 10 },
  { name: "december", month: 11 },
];

function fail(message: string): ParseResult {
  return { ok: false, message, examples: COMMAND_EXAMPLES };
}

function stripPolite(input: string) {
  return input
    .trim()
    .replace(/^(please|can you|could you|would you)\s+/i, "")
    .replace(/[.?!]+$/g, "")
    .trim();
}

function cleanTitle(value: string) {
  return value
    .replace(/^[\s:–—-]+/, "")
    .replace(/^["“]+|["”]+$/g, "")
    .replace(/[,:\s]+$/g, "")
    .replace(/^(to|about|called|titled)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function targetOf(word: string): Target {
  const value = word.toLowerCase();
  if (value === "event") return "event";
  if (
    value === "post" ||
    value === "content" ||
    value === "social post"
  ) {
    return "content";
  }
  return "task";
}

function ymd(year: number, monthIndex: number, day: number): string | null {
  const date = new Date(year, monthIndex, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }
  return format(date, "yyyy-MM-dd");
}

function monthIndex(token: string): number | null {
  const value = token.toLowerCase();
  const found = MONTHS.find(
    (month) => month.name === value || month.name.startsWith(value)
  );
  if (!found || value.length < 3) return null;
  return found.month;
}

export function parseDatePhrase(input: string, now = new Date()): string | null {
  const text = input
    .trim()
    .replace(/[.,;:]+$/g, "")
    .replace(/^(the|on)\s+/i, "")
    .toLowerCase();
  if (!text) return null;
  if (text === "today") return format(now, "yyyy-MM-dd");
  if (text === "tomorrow") return format(addDays(startOfDay(now), 1), "yyyy-MM-dd");

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const uk = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (uk) return ymd(Number(uk[3]), Number(uk[2]) - 1, Number(uk[1]));

  const weekday = text.match(
    /^(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/
  );
  if (weekday) {
    const which = weekday[1];
    const day = WEEKDAYS[weekday[2]];
    if (which !== "next" && now.getDay() === day) return format(now, "yyyy-MM-dd");
    return format(nextDay(now, day), "yyyy-MM-dd");
  }

  const dayFirst = text.match(
    /^(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+([a-z]+)(?:\s+(\d{4}))?$/
  );
  if (dayFirst) {
    const month = monthIndex(dayFirst[2]);
    if (month == null) return null;
    return dated(Number(dayFirst[1]), month, dayFirst[3], now);
  }

  const monthFirst = text.match(
    /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?$/
  );
  if (monthFirst) {
    const month = monthIndex(monthFirst[1]);
    if (month == null) return null;
    return dated(Number(monthFirst[2]), month, monthFirst[3], now);
  }

  return null;
}

function dated(
  day: number,
  month: number,
  yearToken: string | undefined,
  now: Date
): string | null {
  const year = yearToken ? Number(yearToken) : now.getFullYear();
  const value = ymd(year, month, day);
  if (!value) return null;
  if (yearToken) return value;
  const date = new Date(year, month, day);
  if (date < startOfDay(now)) return ymd(year + 1, month, day);
  return value;
}

function takeDate(
  text: string,
  now: Date
): { date: string; rest: string } | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const limit = Math.min(5, words.length);
  for (let count = limit; count >= 1; count -= 1) {
    const chunk = words.slice(0, count).join(" ");
    const date = parseDatePhrase(chunk, now);
    if (date) {
      return { date, rest: words.slice(count).join(" ") };
    }
  }
  return null;
}

function channelFrom(token: string): string | null {
  return CHANNELS[token.toLowerCase()] ?? null;
}

function takeChannels(text: string): { channels: string[]; rest: string } | null {
  let rest = text.trim();
  const channels: string[] = [];
  while (rest) {
    const match = rest.match(new RegExp(`^(${CHANNEL_PATTERN})\\b`, "i"));
    if (!match) break;
    const channel = channelFrom(match[1]);
    if (!channel) break;
    channels.push(channel);
    rest = rest.slice(match[0].length).replace(/^\s*(?:,|and|&)\s*/i, "");
    if (!new RegExp(`^(${CHANNEL_PATTERN})\\b`, "i").test(rest)) break;
  }
  if (!channels.length) return null;
  return { channels, rest };
}

function mapTaskStatus(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value === "done" || value === "complete" || value === "completed") {
    return "done";
  }
  if (value === "doing" || value === "in progress") return "doing";
  if (value === "waiting" || value === "on hold") return "waiting";
  if (value === "todo" || value === "to do") return "todo";
  return null;
}

function mapContentStatus(raw: string): ContentStatus | "published" | null {
  const value = raw.trim().toLowerCase();
  if (value === "in review" || value === "review") return "review";
  if (value === "canceled" || value === "cancelled") return "cancelled";
  if (value === "published") return "published";
  if (
    value === "idea" ||
    value === "draft" ||
    value === "approved" ||
    value === "scheduled"
  ) {
    return value;
  }
  return null;
}

function takeStatus(
  text: string,
  target: Target
): { status: string; rest: string } | null {
  const trimmed = text.trim().replace(/^to\s+/i, "");
  const options =
    target === "content"
      ? [
          "in review",
          "approved",
          "scheduled",
          "cancelled",
          "canceled",
          "published",
          "review",
          "draft",
          "idea",
        ]
      : [
          "in progress",
          "on hold",
          "completed",
          "complete",
          "waiting",
          "doing",
          "to do",
          "todo",
          "done",
        ];
  const lower = trimmed.toLowerCase();
  for (const option of options) {
    if (lower === option || lower.startsWith(`${option} `) || lower.startsWith(`${option},`)) {
      const status =
        target === "content" ? mapContentStatus(option) : mapTaskStatus(option);
      if (!status) return null;
      return { status, rest: trimmed.slice(option.length).trim() };
    }
  }
  return null;
}

type Look =
  | { key: keyof Fields }
  | { key: null }
  | { error: string };

function lookAhead(keyword: string, after: string, target: Target, now: Date): Look {
  const key = keyword.toLowerCase();
  const rest = after.trim();
  if (key === "due" || key === "deadline" || key === "by" || key === "to") {
    return takeDate(rest, now) ? { key: "due" } : { key: null };
  }
  if (key === "on") {
    if (takeDate(rest, now)) return { key: "due" };
    if (target === "content" && takeChannels(rest)) return { key: "channel" };
    return { key: null };
  }
  if (key === "owner") return rest ? { key: "owner" } : { key: null };
  if (key === "status" || key === "as") {
    const status = takeStatus(rest, target);
    if (!status) return { key: null };
    if (status.status === "published") {
      return {
        error:
          "Publish in Planable. In the hub, set the post to draft, review, approved, or scheduled.",
      };
    }
    return { key: "status" };
  }
  if (key === "location") return rest ? { key: "location" } : { key: null };
  if (key === "at" || key === "in") {
    if (/^progress\b/i.test(rest)) return { key: null };
    if (takeDate(rest, now)) return { key: "due" };
    if (target === "event" && rest) return { key: "location" };
    return { key: null };
  }
  if (key === "notes" || key === "details") return rest ? { key: "notes" } : { key: null };
  if (key === "caption") return rest ? { key: "caption" } : { key: null };
  if (key === "channel") {
    return takeChannels(rest) ? { key: "channel" } : { key: null };
  }
  if (key === "type") return rest ? { key: "type" } : { key: null };
  if (key === "title") return rest ? { key: "title" } : { key: null };
  return { key: null };
}

function nextModifierAt(text: string, target: Target, now: Date): number {
  const re = new RegExp(`\\b(${KEYWORD})\\b`, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const after = text.slice((match.index ?? 0) + match[0].length);
    const look = lookAhead(match[1], after, target, now);
    if ("error" in look) return match.index ?? 0;
    if (look.key) return match.index ?? 0;
  }
  return -1;
}

function consumeValue(
  key: keyof Fields,
  text: string,
  target: Target,
  now: Date
): { value: string | string[]; rest: string } | { error: string } | null {
  if (key === "due") {
    const taken = takeDate(text, now);
    if (!taken) return null;
    return { value: taken.date, rest: taken.rest };
  }
  if (key === "channel") {
    const taken = takeChannels(text);
    if (!taken) return null;
    return { value: taken.channels, rest: taken.rest };
  }
  if (key === "status") {
    const taken = takeStatus(text, target);
    if (!taken) return null;
    if (taken.status === "published") {
      return {
        error:
          "Publish in Planable. In the hub, set the post to draft, review, approved, or scheduled.",
      };
    }
    return { value: taken.status, rest: taken.rest };
  }

  const cut = nextModifierAt(text, target, now);
  if (cut === 0) return null;
  if (cut > 0) {
    return { value: text.slice(0, cut).trim().replace(/[,]+$/g, ""), rest: text.slice(cut) };
  }
  return { value: text.trim().replace(/[,]+$/g, ""), rest: "" };
}

function assignField(
  fields: Fields,
  key: keyof Fields,
  value: string | string[]
) {
  if (key === "channel") {
    if (Array.isArray(value)) fields.channel = value;
    return;
  }
  if (typeof value !== "string") return;
  fields[key] = value;
}

function extractFields(
  body: string,
  target: Target,
  now: Date
): { ok: true; title: string; fields: Fields } | { ok: false; message: string } {
  const re = new RegExp(`\\b(${KEYWORD})\\b`, "gi");
  let match: RegExpExecArray | null;
  let splitAt = -1;
  while ((match = re.exec(body))) {
    const after = body.slice((match.index ?? 0) + match[0].length);
    const look = lookAhead(match[1], after, target, now);
    if ("error" in look) return { ok: false, message: look.error };
    if (look.key) {
      splitAt = match.index ?? 0;
      break;
    }
  }

  const fields: Fields = {};
  let title = cleanTitle(splitAt < 0 ? body : body.slice(0, splitAt));
  let rest = splitAt < 0 ? "" : body.slice(splitAt);

  while (rest.trim()) {
    const lead = rest.match(new RegExp(`^\\s*(${KEYWORD})\\b\\s*`, "i"));
    if (!lead) break;
    const look = lookAhead(lead[1], rest.slice(lead[0].length), target, now);
    if ("error" in look) return { ok: false, message: look.error };
    if (!look.key) break;
    const consumed = consumeValue(look.key, rest.slice(lead[0].length), target, now);
    if (!consumed) break;
    if ("error" in consumed) return { ok: false, message: consumed.error };
    assignField(fields, look.key, consumed.value);
    rest = consumed.rest;
  }

  if (!fields.due) {
    const peeled = peelTrailingDate(title, now);
    if (peeled) {
      title = peeled.title;
      fields.due = peeled.date;
    }
  }

  return { ok: true, title, fields };
}

function peelTrailingDate(
  title: string,
  now: Date
): { title: string; date: string } | null {
  const words = title.split(/\s+/).filter(Boolean);
  for (let count = Math.min(4, words.length - 1); count >= 1; count -= 1) {
    const date = parseDatePhrase(words.slice(words.length - count).join(" "), now);
    if (!date) continue;
    const nextTitle = cleanTitle(words.slice(0, words.length - count).join(" "));
    if (nextTitle) return { title: nextTitle, date };
  }
  return null;
}

function peelTrailingStatus(
  title: string,
  target: Target
): { title: string; status: string } | null {
  const match = title.match(/^(.*?)\s+(?:to|as)\s+(.+)$/i);
  if (!match) return null;
  const taken = takeStatus(match[2], target);
  if (!taken || taken.rest) return null;
  const nextTitle = cleanTitle(match[1]);
  if (!nextTitle || taken.status === "published") return null;
  return { title: nextTitle, status: taken.status };
}

function formatWhen(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return format(new Date(year, month - 1, day), "d MMM yyyy");
}

function quote(value: string) {
  return `"${value}"`;
}

function taskSummary(
  verb: CommandVerb,
  title: string,
  fields: Fields
): string {
  const bits = [`${verb} task ${quote(title)}`];
  if (fields.due) bits.push(`due ${formatWhen(fields.due)}`);
  if (fields.owner) bits.push(`owner ${fields.owner}`);
  if (fields.status && fields.status !== "todo") bits.push(`status ${fields.status}`);
  if (fields.notes) bits.push("with notes");
  return `${bits.join(", ")}.`;
}

function eventSummary(verb: CommandVerb, title: string, fields: Fields): string {
  const bits = [`${verb} event ${quote(title)}`];
  bits.push(fields.due ? formatWhen(fields.due) : "date still to add");
  if (fields.location) bits.push(fields.location);
  if (fields.type) bits.push(fields.type);
  if (fields.notes) bits.push("with notes");
  return `${bits.join(", ")}.`;
}

function contentSummary(
  verb: CommandVerb,
  title: string,
  fields: Fields
): string {
  const channels = fields.channel?.length ? fields.channel.join(" and ") : "LinkedIn";
  const bits = [`${verb} ${channels} post ${quote(title)}`];
  if (fields.due) bits.push(`due ${formatWhen(fields.due)}`);
  if (fields.status && fields.status !== "idea") bits.push(`status ${fields.status}`);
  if (fields.caption) bits.push("with caption");
  return `${bits.join(", ")}.`;
}

function baseFor(target: Target, verb: CommandVerb): CommandBase {
  if (target === "event") {
    return { summary: "", verb, href: "/app/events", area: "events" };
  }
  if (target === "content") {
    return { summary: "", verb, href: "/app/content", area: "content" };
  }
  return { summary: "", verb, href: "/app/tasks", area: "tasks" };
}

function fromFields(
  verb: CommandVerb,
  target: Target,
  title: string,
  fields: Fields,
  channelHint: string | null
): ParseResult {
  if (channelHint) {
    fields.channel = fields.channel ?? [channelHint];
  }

  if (verb === "Add") {
    if (!title) {
      return fail("Add a name. For example: Add a task to call the organiser, due Friday.");
    }
    if (target === "task") {
      const command: HubCommand = {
        ...baseFor(target, verb),
        kind: "create_task",
        title,
        details: fields.notes ?? "",
        due_date: fields.due ?? null,
        owner: fields.owner ?? "",
        status: fields.status ?? "todo",
        summary: taskSummary(verb, title, fields),
      };
      return { ok: true, command };
    }
    if (target === "event") {
      const command: HubCommand = {
        ...baseFor(target, verb),
        kind: "create_event",
        title,
        starts_at: fields.due ?? null,
        location: fields.location ?? "",
        event_type: fields.type ?? "Event",
        notes: fields.notes ?? "",
        summary: eventSummary(verb, title, fields),
      };
      return { ok: true, command };
    }
    const status = (fields.status as ContentStatus | undefined) ?? "idea";
    const command: HubCommand = {
      ...baseFor(target, verb),
      kind: "create_content",
      title,
      channel: fields.channel ?? ["LinkedIn"],
      due_date: fields.due ?? null,
      caption: fields.caption ?? "",
      notes: fields.notes ?? "",
      status,
      summary: contentSummary(verb, title, {
        ...fields,
        channel: fields.channel ?? ["LinkedIn"],
        status,
      }),
    };
    return { ok: true, command };
  }

  let query = title;
  if (!fields.status) {
    const trailing = query.match(/^(.*?)\s+(?:to|as)\s+(.+)$/i);
    if (trailing) {
      const taken = takeStatus(trailing[2], target);
      if (taken && !taken.rest && taken.status === "published") {
        return fail(
          "Publish in Planable. In the hub, set the post to draft, review, approved, or scheduled."
        );
      }
    }
    const peeled = peelTrailingStatus(query, target);
    if (peeled) {
      query = peeled.title;
      fields.status = peeled.status;
    }
  }
  if (fields.title) {
    const renamed = cleanTitle(fields.title);
    fields.title = renamed || undefined;
  }
  if (!query) {
    return fail("Name the record to update. For example: Update task call the organiser status done.");
  }

  const hasChange = Boolean(
    fields.status ||
      fields.owner ||
      fields.due ||
      fields.location ||
      fields.notes ||
      fields.caption ||
      fields.channel ||
      fields.type ||
      fields.title
  );
  if (!hasChange) {
    return fail(
      "Say what to change. For example: Update task call the organiser status done."
    );
  }

  if (target === "task") {
    const command: HubCommand = {
      ...baseFor(target, verb),
      kind: "update_task",
      query,
      patch: {
        ...(fields.status ? { status: fields.status } : {}),
        ...(fields.owner ? { owner: fields.owner } : {}),
        ...(fields.due ? { due_date: fields.due } : {}),
        ...(fields.title ? { title: fields.title } : {}),
        ...(fields.notes ? { details: fields.notes } : {}),
      },
      summary: taskSummary(verb, fields.title || query, fields),
    };
    return { ok: true, command };
  }
  if (target === "event") {
    const command: HubCommand = {
      ...baseFor(target, verb),
      kind: "update_event",
      query,
      patch: {
        ...(fields.due ? { starts_at: fields.due } : {}),
        ...(fields.location ? { location: fields.location } : {}),
        ...(fields.title ? { title: fields.title } : {}),
        ...(fields.notes ? { notes: fields.notes } : {}),
        ...(fields.type ? { event_type: fields.type } : {}),
      },
      summary: eventSummary(verb, fields.title || query, fields),
    };
    return { ok: true, command };
  }
  const command: HubCommand = {
    ...baseFor(target, verb),
    kind: "update_content",
    query,
    patch: {
      ...(fields.status ? { status: fields.status as ContentStatus } : {}),
      ...(fields.due ? { due_date: fields.due } : {}),
      ...(fields.title ? { title: fields.title } : {}),
      ...(fields.caption ? { caption: fields.caption } : {}),
      ...(fields.notes ? { notes: fields.notes } : {}),
      ...(fields.channel ? { channel: fields.channel } : {}),
    },
    summary: contentSummary(verb, fields.title || query, fields),
  };
  return { ok: true, command };
}

export function parseHubCommand(input: string, now = new Date()): ParseResult {
  const text = stripPolite(input);
  if (!text) {
    return fail("Type what to add or update.");
  }
  if (/^(help|\?|what can (?:you|i) do)$/i.test(text)) {
    return fail("Add or update a task, an event, or a post.");
  }

  const mark = text.match(
    new RegExp(
      `^mark\\s+(?:the\\s+)?(.+?)\\s+(${TARGET_PATTERN})\\s+(?:as\\s+|status\\s+)?(.+)$`,
      "i"
    )
  );
  if (mark) {
    const target = targetOf(mark[2]);
    const status = takeStatus(mark[3], target);
    if (!status || status.rest) {
      return fail("Say the new status. For example: Mark the organiser task as done.");
    }
    if (status.status === "published") {
      return fail(
        "Publish in Planable. In the hub, set the post to draft, review, approved, or scheduled."
      );
    }
    return fromFields("Update", target, cleanTitle(mark[1]), { status: status.status }, null);
  }

  const update = text.match(
    new RegExp(
      `^(?:update|change|set|move)\\s+(?:the\\s+)?(?:(${CHANNEL_PATTERN})\\s+)?(${TARGET_PATTERN})\\s+(.+)$`,
      "i"
    )
  );
  if (update) {
    const extracted = extractFields(update[3], targetOf(update[2]), now);
    if (!extracted.ok) return fail(extracted.message);
    return fromFields(
      "Update",
      targetOf(update[2]),
      extracted.title,
      extracted.fields,
      update[1] ? channelFrom(update[1]) : null
    );
  }

  const create = text.match(
    new RegExp(
      `^(?:add|create|new)\\s+(?:a\\s+|an\\s+)?(?:(${CHANNEL_PATTERN})\\s+)?(${TARGET_PATTERN})\\b[:\\s-]*(.*)$`,
      "i"
    )
  );
  if (create) {
    const extracted = extractFields(create[3] ?? "", targetOf(create[2]), now);
    if (!extracted.ok) return fail(extracted.message);
    return fromFields(
      "Add",
      targetOf(create[2]),
      extracted.title,
      extracted.fields,
      create[1] ? channelFrom(create[1]) : null
    );
  }

  return fail(
    "Start with add or update, then task, event, or post."
  );
}
