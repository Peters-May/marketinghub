import { STAFF_NAV } from "@/lib/nav";

export type HubHowToTopic = {
  id: string;
  title: string;
  href: string;
  summary: string;
  steps: string[];
  keywords: string[];
};

/** Static Hub workflow guidance derived from navigation and known UI flows. */
export const HUB_HOW_TO_TOPICS: HubHowToTopic[] = [
  {
    id: "create-campaign",
    title: "Create a marketing campaign",
    href: "/app/email",
    summary:
      "Email marketing campaigns are created under Email. Paid media campaigns live under Reporting.",
    steps: [
      "Open Email (/app/email) for newsletter or marketing sends.",
      "Use Create / New campaign, choose a template or blank design, set audience, then save a draft.",
      "Sending and pitch emails stay in Admin workflows; members mainly see sent marketing emails.",
      "For paid ads (LinkedIn, Google), open Reporting (/app/reports) and add a paid campaign record.",
    ],
    keywords: ["campaign", "email campaign", "newsletter", "paid media", "ads"],
  },
  {
    id: "add-event",
    title: "Add or upload event information",
    href: "/app/events",
    summary: "Events (shows, meetings, ceremonies) are managed on the Events page.",
    steps: [
      "Open Events (/app/events).",
      "Add a new event or open an existing show to edit dates, location, attendance, and notes.",
      "Attendance, hotel, and checklist fields are on the event detail.",
      "Admins can also propose Add an event via the Hub assistant, then Confirm.",
    ],
    keywords: ["event", "show", "boat show", "upload event", "attendance"],
  },
  {
    id: "add-event-cost",
    title: "Add an event cost",
    href: "/app/events",
    summary:
      "Event spend is recorded on the event Costs sheet, not only in notes.",
    steps: [
      "Open Events (/app/events) and select the event.",
      "Open the Costs sheet / tab for that event.",
      "Add a line with category (travel, accommodation, materials, or other), amount, currency, person, and description.",
      "Admins can ask the assistant to propose: Add cost to event [exact title] travel €N for Person description … then Confirm.",
    ],
    keywords: ["cost", "spend", "travel", "accommodation", "expenses", "event cost"],
  },
  {
    id: "assign-task",
    title: "Assign a task",
    href: "/app/tasks",
    summary: "Tasks are owned to-dos that can link to events or content.",
    steps: [
      "Open Tasks (/app/tasks).",
      "Create a task with title, due date, owner, and optional related event or content.",
      "Update status as work progresses (for example to done).",
      "Admins can propose Add a task … via the assistant and Confirm.",
    ],
    keywords: ["task", "assign", "todo", "due", "owner"],
  },
  {
    id: "content-approval",
    title: "Find content awaiting approval",
    href: "/app/content",
    summary:
      "Social and content pipeline statuses are on Content & Social. Members see scheduled and published posts.",
    steps: [
      "Open Content & Social (/app/content).",
      "Filter or scan for statuses such as draft, in review, or awaiting approval (admin pipeline).",
      "Open a post to edit caption, channel, due date, or push to Planable when ready.",
      "Ask the assistant for content by status to get a verified list from live data.",
    ],
    keywords: ["approval", "awaiting", "draft", "social", "content", "review"],
  },
  {
    id: "scheduled-social",
    title: "Find scheduled social posts",
    href: "/app/content",
    summary: "Scheduled and published social posts appear on Content & Social.",
    steps: [
      "Open Content & Social (/app/content).",
      "Look for status scheduled (and published for live posts).",
      "Members primarily see scheduled and published social; full pipeline is in Admin view.",
    ],
    keywords: ["scheduled", "social", "posts", "linkedin", "calendar"],
  },
  {
    id: "enquiries",
    title: "Review web and WhatsApp enquiries",
    href: "/app/enquiries",
    summary: "Quote-form and WhatsApp enquiries are on Enquiries; website chat leads appear there too.",
    steps: [
      "Open Enquiries (/app/enquiries).",
      "Use tabs/filters for source, needs review, and Website chat.",
      "Open a row for message detail; do not ask the assistant for private message text as a member.",
    ],
    keywords: ["enquiry", "enquiries", "quote", "whatsapp", "lead"],
  },
  {
    id: "budget",
    title: "View marketing budget",
    href: "/app/budget",
    summary:
      "Budget is restricted to admins and an allowlist. Planned lines and payments live on Budget.",
    steps: [
      "Open Budget (/app/budget) if you have access.",
      "Review planned lines and payment/spend records there.",
      "The assistant only returns budget figures when your account is allowlisted.",
    ],
    keywords: ["budget", "spend", "planned", "expenditure"],
  },
];

function scoreTopic(query: string, topic: HubHowToTopic): number {
  const q = query.toLowerCase();
  let score = 0;
  for (const word of topic.keywords) {
    if (q.includes(word.toLowerCase())) score += 2;
  }
  if (q.includes(topic.title.toLowerCase())) score += 3;
  if (q.includes(topic.href.replace("/app/", ""))) score += 1;
  return score;
}

export function searchHubHowTo(query: string, limit = 5): HubHowToTopic[] {
  const scored = HUB_HOW_TO_TOPICS.map((topic) => ({
    topic,
    score: scoreTopic(query, topic),
  }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.topic);
  return scored;
}

export function howToForPath(pathname: string | null | undefined): {
  href: string;
  label: string;
  description: string;
  related: HubHowToTopic[];
} | null {
  const path = (pathname ?? "").split("?")[0] || "/app";
  const nav =
    [...STAFF_NAV]
      .sort((a, b) => b.href.length - a.href.length)
      .find(
        (item) =>
          path === item.href ||
          (item.href !== "/app" && path.startsWith(`${item.href}/`))
      ) ?? (path === "/app" || path === "/app/"
        ? STAFF_NAV.find((item) => item.href === "/app")
        : null);
  if (!nav) return null;
  const related = HUB_HOW_TO_TOPICS.filter(
    (topic) =>
      topic.href === nav.href ||
      path.startsWith(topic.href) ||
      topic.keywords.some((k) =>
        nav.label.toLowerCase().includes(k.toLowerCase())
      )
  ).slice(0, 4);
  return {
    href: nav.href,
    label: nav.label,
    description: nav.description,
    related,
  };
}

/** Compact system prompt block: nav map + optional current page. */
export function formatHubHowToContext(input?: {
  pathname?: string | null;
  selectedRecordId?: string | null;
  selectedRecordType?: string | null;
}): string {
  const navLines = STAFF_NAV.map(
    (item) => `- ${item.label}: ${item.href} — ${item.description}`
  );
  const page = howToForPath(input?.pathname);
  const parts = [
    "Marketing Hub navigation (use these exact paths when linking):",
    ...navLines,
    "",
    "Common workflows (use hub_how_to tool for detail): create campaign → /app/email or /app/reports; events → /app/events; event costs → event Costs sheet; tasks → /app/tasks; content approval → /app/content; enquiries → /app/enquiries; budget → /app/budget (restricted).",
  ];
  if (page) {
    parts.push(
      "",
      `Current page: ${page.label} (${page.href}). ${page.description}`,
      "Explain what the user can do on this page first when they ask what this page is for."
    );
    if (page.related.length) {
      parts.push(
        `Related help: ${page.related.map((t) => t.title).join("; ")}.`
      );
    }
  }
  if (input?.selectedRecordId) {
    parts.push(
      `Selected record: type=${input.selectedRecordType || "unknown"} id=${input.selectedRecordId}. Prefer tools that load this record and its links.`
    );
  }
  return parts.join("\n");
}
