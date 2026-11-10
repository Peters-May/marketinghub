import { z } from "zod";

/** Structured write intents the assistant can propose for Confirm. */
export const hubActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create_task"),
    title: z.string().min(1).max(200),
    due_date: z.string().nullable().optional(),
    owner: z.string().optional(),
    status: z.string().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    kind: z.literal("create_event"),
    title: z.string().min(1).max(200),
    starts_at: z.string().nullable().optional(),
    ends_at: z.string().nullable().optional(),
    location: z.string().optional(),
    attending: z.string().optional(),
    notes: z.string().optional(),
  }),
  z.object({
    kind: z.literal("update_event"),
    title: z.string().min(1).max(200),
    attending: z.string().optional(),
    notes: z.string().optional(),
    we_are_attending: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("create_content"),
    title: z.string().min(1).max(200),
    content_type: z.enum([
      "Social",
      "Editorial",
      "PR",
      "Newsletter",
      "Sponsorship",
    ]),
    channels: z.array(z.string()).max(4).optional(),
    due_date: z.string().nullable().optional(),
    caption: z.string().optional(),
    notes: z.string().optional(),
    asset_url: z.string().optional(),
  }),
  z.object({
    kind: z.literal("link_content"),
    content_title: z.string().min(1).max(200),
    event_title: z.string().min(1).max(200),
  }),
  z.object({
    kind: z.literal("create_presentation"),
    title: z.string().min(1).max(200),
    url: z.string().url(),
    visibility: z.enum(["public", "internal"]),
  }),
  z.object({
    kind: z.literal("create_marketing_list"),
    country: z.string().min(1).max(80),
  }),
  z.object({
    kind: z.literal("create_event_cost"),
    event_title: z.string().min(1).max(200),
    category: z.enum(["travel", "accommodation", "materials", "other"]),
    amount: z.number().nonnegative(),
    currency: z.enum(["EUR", "GBP", "USD", "AUD"]),
    staff_name: z.string().min(1).max(120),
    description: z.string().min(1).max(300),
    notes: z.string().optional(),
  }),
  z.object({
    kind: z.literal("create_campaign"),
    name: z.string().min(1).max(200),
    platform: z.string().min(1).max(80).optional(),
    goal: z.string().min(1).max(1000).optional(),
    notes: z.string().max(4000).optional(),
    starts_at: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("create_email_campaign"),
    title: z.string().min(1).max(200),
    subject: z.string().max(200).optional(),
    brief: z.string().max(4000).optional(),
    folder: z.string().max(80).optional(),
  }),
]);

export type HubAction = z.infer<typeof hubActionSchema>;

export const proposeHubActionsSchema = z.object({
  actions: z.array(hubActionSchema).min(1).max(20),
});

function quote(value: string) {
  if (/[\s"]/.test(value)) return `"${value.replace(/"/g, "")}"`;
  return value;
}

function moneyLabel(amount: number, currency: string) {
  if (currency === "EUR") return `€${amount}`;
  if (currency === "GBP") return `£${amount}`;
  return `${currency} ${amount}`;
}

/** Turn structured AI actions into canonical hub-command lines the parser accepts. */
export function serializeHubAction(action: HubAction): string {
  switch (action.kind) {
    case "create_task": {
      const bits = [`Add a task to ${action.title}`];
      if (action.due_date) bits.push(`due ${action.due_date}`);
      if (action.owner) bits.push(`owner ${action.owner}`);
      if (action.status) bits.push(`status ${action.status}`);
      if (action.notes) bits.push(`notes ${action.notes}`);
      return bits.join(", ");
    }
    case "create_event": {
      const bits = [`Add an event ${action.title}`];
      if (action.starts_at && action.ends_at && action.ends_at !== action.starts_at) {
        bits.push(`on ${action.starts_at} until ${action.ends_at}`);
      } else if (action.starts_at) {
        bits.push(`on ${action.starts_at}`);
      }
      if (action.location) bits.push(`in ${action.location}`);
      if (action.attending) bits.push(`attending ${action.attending}`);
      if (action.notes) bits.push(`notes ${action.notes}`);
      return bits.join(" ");
    }
    case "update_event": {
      const bits = [`Update event ${action.title}`];
      if (action.attending) bits.push(`attending ${action.attending}`);
      if (action.we_are_attending === true) bits.push("we are attending");
      if (action.we_are_attending === false) bits.push("not attending");
      if (action.notes) bits.push(`notes ${action.notes}`);
      return bits.join(" ");
    }
    case "create_content": {
      const type = action.content_type || "Social";
      if (type === "Editorial") {
        const bits = [`Add editorial content ${action.title}`];
        if (action.asset_url) bits.push(`with link ${action.asset_url}`);
        if (action.due_date) bits.push(`due ${action.due_date}`);
        if (action.notes) bits.push(`notes ${action.notes}`);
        return bits.join(" ");
      }
      if (type === "PR") {
        const bits = [`Add PR content ${action.title}`];
        if (action.asset_url) bits.push(`with link ${action.asset_url}`);
        if (action.due_date) bits.push(`due ${action.due_date}`);
        if (action.notes) bits.push(`notes ${action.notes}`);
        return bits.join(" ");
      }
      const channel = action.channels?.[0] || "LinkedIn";
      const bits = [`Add a ${channel} post about ${action.title}`];
      if (action.due_date) bits.push(`due ${action.due_date}`);
      if (action.caption) bits.push(`caption ${action.caption}`);
      if (action.notes) bits.push(`notes ${action.notes}`);
      if (action.asset_url) bits.push(`with link ${action.asset_url}`);
      return bits.join(", ");
    }
    case "link_content":
      return `Link post ${quote(action.content_title)} to event ${quote(action.event_title)}`;
    case "create_presentation":
      return `Add a ${action.visibility} presentation ${action.title} ${action.url}`;
    case "create_marketing_list":
      return `Add a marketing list for the ${action.country}`;
    case "create_event_cost": {
      const bits = [
        `Add cost to event ${action.event_title}`,
        action.category,
        moneyLabel(action.amount, action.currency),
        `for ${action.staff_name}`,
        `description ${action.description}`,
      ];
      if (action.notes) bits.push(`notes ${action.notes}`);
      return bits.join(" ");
    }
    case "create_campaign": {
      const bits = [`Add a campaign ${action.name}`];
      if (action.starts_at) bits.push(`starts ${action.starts_at}`);
      bits.push(`platform ${action.platform || "Multi-channel"}`);
      if (action.goal) bits.push(`goal ${action.goal}`);
      if (action.notes) bits.push(`notes ${action.notes}`);
      return bits.join(" ");
    }
    case "create_email_campaign": {
      const bits = [`Add an email campaign ${action.title}`];
      if (action.folder) bits.push(`folder ${action.folder}`);
      if (action.subject) bits.push(`subject ${action.subject}`);
      if (action.brief) bits.push(`brief ${action.brief}`);
      return bits.join(" ");
    }
    default:
      return "";
  }
}

export function serializeHubActions(actions: HubAction[]): string {
  return actions
    .map((action) => serializeHubAction(action).trim())
    .filter(Boolean)
    .join("\n");
}

export function wrapHubCommandBlock(commandText: string, reply: string): string {
  const lines = commandText.trim();
  if (!lines) return reply.trim();
  const fence = `:::hub-command\n${lines}\n:::`;
  const body = reply.trim();
  if (!body) return fence;
  if (/:{2,3}hub-command/i.test(body)) return body;
  return `${body}\n\n${fence}`;
}

type StepLike = {
  toolCalls?: Array<{ toolName?: string; input?: unknown }>;
};

/** Collect propose_hub_actions payloads from generateText steps. */
export function extractProposedActionsFromSteps(
  steps: StepLike[] | undefined
): HubAction[] {
  if (!steps?.length) return [];
  const out: HubAction[] = [];
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      if (call.toolName !== "propose_hub_actions") continue;
      const parsed = proposeHubActionsSchema.safeParse(call.input);
      if (!parsed.success) continue;
      out.push(...parsed.data.actions);
    }
  }
  return out;
}
