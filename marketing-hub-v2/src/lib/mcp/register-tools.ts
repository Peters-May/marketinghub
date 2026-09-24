import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  BRAND_CONTEXT,
  createSocialDraft,
  getSocialPost,
  listSocialPosts,
  listThemeContext,
  listUpcomingEvents,
  updateSocialPost,
} from "@/lib/mcp/content";
import {
  createWhatsAppEnquiryFromMcp,
  getEnquiryForMcp,
  listEnquiriesForMcp,
  updateWhatsAppEnquiryFromMcp,
} from "@/lib/mcp/enquiries";

function jsonText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** ChatGPT search/fetch read `content[0].text` as JSON; include structuredContent too. */
function jsonDocument(data: Record<string, unknown>) {
  const text = JSON.stringify(data);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: data,
  };
}

const ENQUIRY_APP_URL = "https://marketing.petersandmay.com/app/enquiries";

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: false,
};

function errorText(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

/** ChatGPT rejects `anyOf`/`null` unions — use optional string and omit to clear. */
const optionalDate = z
  .string()
  .optional()
  .describe("ISO date (YYYY-MM-DD or full ISO). Omit if unknown.");

const contentStatus = z.enum([
  "idea",
  "draft",
  "review",
  "approved",
  "scheduled",
  "cancelled",
]);

export const ENQUIRY_MCP_TOOL_NAMES = [
  "search",
  "fetch",
  "create_whatsapp_enquiry",
  "update_whatsapp_enquiry",
  "list_enquiries",
] as const;

export function registerEnquiryMcpTools(server: McpServer) {
  const createFields = {
    customer_name: z.string().describe("Customer / contact name"),
    customer_phone: z.string().optional().describe("Telephone"),
    customer_email: z.string().optional(),
    customer_country: z.string().optional(),
    company: z.string().optional(),
    enquiry_type: z
      .string()
      .optional()
      .describe("Enquiry type e.g. Yacht transport"),
    vessel_cargo: z.string().optional().describe("Vessel / cargo"),
    collection_location: z.string().optional().describe("Origin"),
    delivery_location: z.string().optional().describe("Destination"),
    preferred_timeframe: z.string().optional(),
    selected_office: z.string().optional().describe("Team / office"),
    message: z.string().optional().describe("Chat summary"),
    notes: z.string().optional(),
    tracker_status: z.string().optional(),
  };

  server.registerTool(
    "search",
    {
      title: "Search enquiries",
      description:
        "Search Marketing Hub WhatsApp enquiries for a calendar year (default: current year) by name, vessel, route, or WA-###. Use before fetch.",
      annotations: readOnlyAnnotations,
      inputSchema: z.object({
        query: z.string().describe("Search name, vessel, route, or WA-###"),
        year: z
          .number()
          .int()
          .optional()
          .describe("Calendar year to search (default: current year)"),
      }),
    },
    async ({ query, year }) => {
      const q = query.trim().toLowerCase();
      const items = await listEnquiriesForMcp({
        channel: "whatsapp",
        year: year ?? new Date().getFullYear(),
      });
      const matches = q
        ? items.filter((item) =>
            [
              item.external_id,
              item.customer_name,
              item.vessel_cargo,
              item.collection_location,
              item.delivery_location,
              item.message,
            ]
              .join(" ")
              .toLowerCase()
              .includes(q)
          )
        : items;
      return jsonDocument({
        results: matches.slice(0, 100).map((item) => {
          const id = item.external_id || item.id;
          const snippet = `${item.enquiry_type} ${item.collection_location} to ${item.delivery_location}`.trim();
          return {
            id,
            title: `${id} ${item.customer_name}`.trim(),
            url: `${ENQUIRY_APP_URL}?id=${encodeURIComponent(item.id)}`,
            text: snippet,
          };
        }),
      });
    }
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch enquiry",
      description: "Fetch one Marketing Hub enquiry by WA-### or row id.",
      annotations: readOnlyAnnotations,
      inputSchema: z.object({
        id: z.string().describe("Tracker ID e.g. WA-051 or Hub row id"),
      }),
    },
    async ({ id }) => {
      const enquiry = await getEnquiryForMcp(id);
      if (!enquiry) return errorText(`Enquiry not found: ${id}`);
      const docId = enquiry.external_id || enquiry.id;
      return jsonDocument({
        id: docId,
        title: `${docId} ${enquiry.customer_name}`.trim(),
        text: JSON.stringify(enquiry),
        url: `${ENQUIRY_APP_URL}?id=${encodeURIComponent(enquiry.id)}`,
        metadata: enquiry,
      });
    }
  );

  server.registerTool(
    "create_whatsapp_enquiry",
    {
      title: "Create WhatsApp enquiry",
      description:
        "Add a WhatsApp enquiry to the Marketing Hub tracker. Omit external_id to auto-allocate WA-###.",
      annotations: writeAnnotations,
      inputSchema: z.object(createFields),
    },
    async (args) => {
      try {
        const enquiry = await createWhatsAppEnquiryFromMcp({
          ...args,
          service: args.enquiry_type,
          source: "WhatsApp",
        });
        return jsonText({ ok: true, enquiry });
      } catch (err) {
        return errorText(err instanceof Error ? err.message : "Create failed");
      }
    }
  );

  server.registerTool(
    "update_whatsapp_enquiry",
    {
      title: "Update WhatsApp enquiry",
      description:
        "Update a WhatsApp enquiry. Identify by external_id (WA-###) or id.",
      annotations: writeAnnotations,
      inputSchema: z.object({
        external_id: z.string().optional().describe("Tracker ID e.g. WA-012"),
        id: z.string().optional().describe("Hub row id"),
        ...createFields,
        customer_name: z.string().optional().describe("Customer / contact name"),
      }),
    },
    async (args) => {
      try {
        if (!args.id && !args.external_id) {
          return errorText("Provide external_id (WA-###) or id");
        }
        const enquiry = await updateWhatsAppEnquiryFromMcp(args);
        return jsonText({ ok: true, enquiry });
      } catch (err) {
        return errorText(err instanceof Error ? err.message : "Update failed");
      }
    }
  );

  server.registerTool(
    "list_enquiries",
    {
      title: "List enquiries",
      description:
        "List all Marketing Hub enquiries for a calendar year (default: current year). Use channel web or whatsapp. Each web row includes tracking (gclid, utm_campaign) and source google_ads when a click id is present. Optional limit caps the result; omit limit to return the full year.",
      annotations: readOnlyAnnotations,
      inputSchema: z.object({
        channel: z.string().optional().describe("web or whatsapp"),
        year: z
          .number()
          .int()
          .optional()
          .describe("Calendar year (default: current year)"),
        limit: z
          .number()
          .optional()
          .describe("Optional max rows; omit for all enquiries in the year"),
      }),
    },
    async (args) =>
      jsonText(
        await listEnquiriesForMcp({
          channel:
            args.channel === "web" || args.channel === "whatsapp"
              ? args.channel
              : undefined,
          year: args.year ?? new Date().getFullYear(),
          limit: args.limit,
        })
      )
  );

  console.info("[mcp] registered enquiry tools", {
    count: ENQUIRY_MCP_TOOL_NAMES.length,
    names: [...ENQUIRY_MCP_TOOL_NAMES],
  });
}

export function registerHubMcpTools(server: McpServer) {
  registerEnquiryMcpTools(server);

  server.registerTool(
    "get_brand_context",
    {
      title: "Brand context",
      description:
        "Peters & May brand voice, channels, and Hub workflow reminders for drafting social posts.",
      inputSchema: z.object({}),
    },
    async () => jsonText(BRAND_CONTEXT)
  );

  server.registerTool(
    "list_social_posts",
    {
      title: "List social posts",
      description:
        "List social calendar posts from the Marketing Hub. Filter by status, channel, or search text.",
      inputSchema: z.object({
        status: contentStatus.optional(),
        channel: z
          .string()
          .optional()
          .describe("e.g. LinkedIn, Instagram, Facebook"),
        search: z
          .string()
          .optional()
          .describe("Search title, caption, or notes"),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    },
    async (args) => jsonText(await listSocialPosts(args))
  );

  server.registerTool(
    "get_social_post",
    {
      title: "Get social post",
      description: "Fetch one social post by Hub content id.",
      inputSchema: z.object({
        id: z.string().describe("Hub content id, e.g. cnt_..."),
      }),
    },
    async ({ id }) => {
      const post = await getSocialPost(id);
      if (!post) return errorText(`Post not found: ${id}`);
      return jsonText(post);
    }
  );

  server.registerTool(
    "create_social_draft",
    {
      title: "Create social draft",
      description:
        "Create a new social post draft in the Marketing Hub. Does not publish — use Planable to publish.",
      inputSchema: z.object({
        title: z.string().describe("Internal title / headline"),
        caption: z.string().optional().describe("Post copy / caption"),
        channels: z
          .array(z.string())
          .optional()
          .describe("Platforms, e.g. ['LinkedIn', 'Instagram']"),
        due_date: optionalDate.describe(
          "Publish date ISO (YYYY-MM-DD or full ISO)"
        ),
        theme_id: z
          .string()
          .optional()
          .describe("Quarterly theme id from list_themes"),
        owner: z.string().optional(),
        notes: z.string().optional().describe("Internal notes, not post copy"),
        status: contentStatus
          .optional()
          .describe("Defaults to draft. Cannot be published."),
      }),
    },
    async (args) => {
      try {
        const post = await createSocialDraft({
          ...args,
          due_date: args.due_date ?? null,
          theme_id: args.theme_id ?? null,
        });
        return jsonText({ ok: true, post });
      } catch (err) {
        return errorText(err instanceof Error ? err.message : "Create failed");
      }
    }
  );

  server.registerTool(
    "update_social_post",
    {
      title: "Update social post",
      description:
        "Update caption, title, channels, due date, or status on an existing Hub social post. Published posts are locked.",
      inputSchema: z.object({
        id: z.string().describe("Hub content id"),
        title: z.string().optional(),
        caption: z.string().optional(),
        channels: z.array(z.string()).optional(),
        due_date: optionalDate,
        theme_id: z.string().optional(),
        owner: z.string().optional(),
        notes: z.string().optional(),
        status: contentStatus.optional(),
      }),
    },
    async ({ id, due_date, theme_id, ...rest }) => {
      try {
        const patch = {
          ...rest,
          ...(due_date !== undefined ? { due_date: due_date || null } : {}),
          ...(theme_id !== undefined ? { theme_id: theme_id || null } : {}),
        };
        const post = await updateSocialPost(id, patch);
        if (!post) return errorText(`Post not found: ${id}`);
        return jsonText({ ok: true, post });
      } catch (err) {
        return errorText(err instanceof Error ? err.message : "Update failed");
      }
    }
  );

  server.registerTool(
    "list_themes",
    {
      title: "List quarterly themes",
      description:
        "Quarterly marketing themes — use summaries when drafting on-brand posts.",
      inputSchema: z.object({}),
    },
    async () => jsonText(await listThemeContext())
  );

  server.registerTool(
    "list_upcoming_events",
    {
      title: "List upcoming events",
      description:
        "Upcoming events from the Hub calendar — useful for timely social post ideas.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async (args) => jsonText(await listUpcomingEvents(args.limit))
  );

  console.info("[mcp] registered hub tools", {
    count: 12,
    names: [
      ...ENQUIRY_MCP_TOOL_NAMES,
      "get_brand_context",
      "list_social_posts",
      "get_social_post",
      "create_social_draft",
      "update_social_post",
      "list_themes",
      "list_upcoming_events",
    ],
  });
}
