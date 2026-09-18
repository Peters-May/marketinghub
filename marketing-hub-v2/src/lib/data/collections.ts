import type { HubStore } from "@/lib/types";
import { CLOTHING_LOGOS } from "@/lib/merch/north-sails";

/** Spreadsheet collections — excludes users/access requests (Admin → Users). */
export type CollectionKey = Exclude<
  keyof HubStore,
  | "hub_users"
  | "access_requests"
  | "event_attendance"
  | "page_notes"
  | "merch_catalogue"
  | "budget_lines"
  | "budget_payments"
  | "budget_meta"
>;

export type FieldType =
  | "text"
  | "longtext"
  | "number"
  | "date"
  | "datetime"
  | "url"
  | "email"
  | "select"
  | "tags"
  | "readonly";

/** Types admins can pick when creating/editing fields in Data. */
export const MANAGEABLE_FIELD_TYPES: Exclude<FieldType, "readonly">[] = [
  "text",
  "longtext",
  "number",
  "date",
  "datetime",
  "url",
  "email",
  "select",
  "tags",
];

export type FieldOption = { value: string; label: string };

export type FieldOptionsSource = "contacts" | "themes";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  options?: FieldOption[];
  /** Dynamic options resolved at table load (e.g. owner → contacts). */
  optionsSource?: FieldOptionsSource;
  /** Protect from delete / edit */
  locked?: boolean;
  /** Present when field is custom (not in collection core schema). */
  custom?: boolean;
};

export type CollectionDef = {
  key: CollectionKey;
  label: string;
  description: string;
  fields: FieldDef[];
  /** Hide from Data Admin nav (kept for Themes hierarchy plumbing). */
  hiddenFromDataAdmin?: boolean;
  /** Require admin role for /api/data access (e.g. platform credentials). */
  adminOnly?: boolean;
};

export const CONTENT_STATUS: FieldOption[] = [
  { value: "idea", label: "Idea" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "cancelled", label: "Cancelled" },
];

const PARTNER_STATUS: FieldOption[] = [
  { value: "prospect", label: "Prospect" },
  { value: "negotiating", label: "Negotiating" },
  { value: "confirmed", label: "Confirmed" },
  { value: "active", label: "Active" },
  { value: "complete", label: "Complete" },
  { value: "declined", label: "Declined" },
];

const AWARD_STATUS: FieldOption[] = [
  { value: "watching", label: "Watching" },
  { value: "entering", label: "Entering" },
  { value: "submitted", label: "Submitted" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "won", label: "Won" },
  { value: "not_won", label: "Not won" },
];

const MERCH_STATUS: FieldOption[] = [
  { value: "requested", label: "Requested" },
  { value: "approved", label: "Approved" },
  { value: "ordered", label: "Ordered" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const THEME_STATUS: FieldOption[] = [
  { value: "previous", label: "Previous" },
  { value: "active", label: "Active" },
  { value: "upcoming", label: "Upcoming" },
];

const STAFF_REQUEST_STATUS: FieldOption[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

export const EVENT_TYPES: FieldOption[] = [
  { value: "Trade show", label: "Trade show" },
  { value: "Boat show", label: "Boat show" },
  { value: "Race", label: "Race" },
  { value: "Commercial", label: "Commercial" },
  { value: "Awards", label: "Awards" },
  { value: "Conference", label: "Conference" },
  { value: "Sponsorship", label: "Sponsorship" },
  { value: "Meeting", label: "Meeting" },
  { value: "Internal", label: "Internal" },
  { value: "Event", label: "Event" },
];

export const SOCIAL_CHANNELS: FieldOption[] = [
  { value: "LinkedIn", label: "LinkedIn" },
  { value: "Instagram", label: "Instagram" },
  { value: "Facebook", label: "Facebook" },
  { value: "X", label: "X" },
  { value: "TikTok", label: "TikTok" },
  { value: "YouTube", label: "YouTube" },
];

export const CONTENT_OUTLETS: FieldOption[] = [
  { value: "Newsletter", label: "Newsletter" },
  { value: "Editorial", label: "Editorial" },
  { value: "PR", label: "PR" },
  { value: "Article", label: "Article" },
  { value: "Website", label: "Website" },
  { value: "Sponsorship", label: "Sponsorship" },
  { value: "Case study", label: "Case study" },
];

/** All channel / outlet options (admin + filters). */
export const CHANNELS: FieldOption[] = [
  ...SOCIAL_CHANNELS,
  ...CONTENT_OUTLETS,
];

export const CONTENT_TYPES: FieldOption[] = [
  { value: "Social", label: "Social" },
  { value: "Editorial", label: "Editorial" },
  { value: "Newsletter", label: "Newsletter" },
  { value: "Sponsorship", label: "Sponsorship" },
  { value: "PR", label: "PR" },
  { value: "Press", label: "Press" },
  { value: "Thought Leadership", label: "Thought Leadership" },
];

export const CONTENT_CATEGORIES: FieldOption[] = [
  { value: "General", label: "General" },
  { value: "Insight", label: "Insight" },
  { value: "Seasonal", label: "Seasonal" },
  { value: "Commercial", label: "Commercial" },
  { value: "Freight Forwarding", label: "Freight Forwarding" },
  { value: "Press release", label: "Press release" },
  { value: "Marketing", label: "Marketing" },
  { value: "Leisure", label: "Leisure" },
  { value: "Shipping Update", label: "Shipping Update" },
  { value: "Case study", label: "Case study" },
  { value: "Need Sponsorship", label: "Need Sponsorship" },
];

export const CONTENT_PRIORITIES: FieldOption[] = [
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

export const TASK_CATEGORIES: FieldOption[] = [
  { value: "Events", label: "Events" },
  { value: "Website", label: "Website" },
  { value: "Content", label: "Content" },
  { value: "Social", label: "Social" },
  { value: "Press", label: "Press" },
  { value: "Partners", label: "Partners" },
  { value: "Admin", label: "Admin" },
];

export const TASK_STATUSES: FieldOption[] = [
  { value: "todo", label: "To do" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done" },
];

export const TASK_RELATED_TYPES: FieldOption[] = [
  { value: "content", label: "Content / Social" },
  { value: "theme", label: "Theme" },
  { value: "sponsorship", label: "Partner" },
  { value: "award", label: "Award" },
  { value: "event", label: "Event" },
  { value: "asset", label: "Asset" },
];

/** Closed / finished task statuses (built-in + common Field Manager renames). */
export function isClosedTaskStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return (
    s === "done" ||
    s === "completed" ||
    s === "complete" ||
    s === "closed" ||
    s.includes("complet")
  );
}

export const RESOURCE_CATEGORIES: FieldOption[] = [
  { value: "Brand", label: "Brand" },
  { value: "Press", label: "Press" },
  { value: "Web", label: "Web" },
  { value: "Templates", label: "Templates" },
  { value: "General", label: "General" },
];

/** What kind of asset is being requested (staff asset requests) */
export const ASSET_REQUEST_CATEGORIES: FieldOption[] = [
  { value: "Presentation", label: "Presentation / deck" },
  { value: "Brochure", label: "Brochure" },
  { value: "Business Cards", label: "Business Cards" },
  { value: "Image", label: "Image / photo" },
  { value: "Logo", label: "Logo" },
  { value: "Video", label: "Video" },
  { value: "Document", label: "Document / PDF" },
  { value: "Template", label: "Template" },
  { value: "Other", label: "Other" },
];

export const REPORT_CATEGORIES: FieldOption[] = [
  { value: "Website", label: "Website" },
  { value: "Ads", label: "Ads" },
  { value: "SEO", label: "SEO" },
  { value: "Enquiries", label: "Enquiries" },
  { value: "Social", label: "Social" },
  { value: "Dashboards", label: "Dashboards" },
];

export const REPORT_TOOLS: FieldOption[] = [
  { value: "Google Analytics", label: "Google Analytics" },
  { value: "Google Ads", label: "Google Ads" },
  { value: "LinkedIn Campaign Manager", label: "LinkedIn Campaign Manager" },
  { value: "SE Ranking", label: "SE Ranking" },
  { value: "Looker Studio", label: "Looker Studio" },
  { value: "Enquiries", label: "Enquiries" },
  { value: "Other", label: "Other" },
];

export const PAID_CAMPAIGN_PLATFORMS: FieldOption[] = [
  { value: "LinkedIn", label: "LinkedIn" },
  { value: "Google Ads", label: "Google Ads" },
  { value: "ChatGPT Ads", label: "ChatGPT Ads" },
  { value: "Meta", label: "Meta" },
  { value: "Other", label: "Other" },
];

const PAID_CAMPAIGN_STATUS: FieldOption[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "complete", label: "Complete" },
];

export const ADVERTISEMENT_STATUS: FieldOption[] = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "complete", label: "Complete" },
  { value: "cancelled", label: "Cancelled" },
];

export const CONTACT_KINDS: FieldOption[] = [
  { value: "person", label: "Person" },
  { value: "company", label: "Company" },
];

export const PLATFORM_CREDENTIAL_PLATFORMS: FieldOption[] = [
  { value: "Planable", label: "Planable" },
  { value: "Canva", label: "Canva" },
  { value: "LinkedIn Ads", label: "LinkedIn Ads" },
  { value: "Google Ads", label: "Google Ads" },
  { value: "SE Ranking", label: "SE Ranking" },
  { value: "Looker Studio", label: "Looker Studio" },
  { value: "HubSpot", label: "HubSpot" },
  { value: "Prowly", label: "Prowly" },
  { value: "Meta Business Suite", label: "Meta Business Suite" },
  { value: "Website CMS", label: "Website CMS" },
  { value: "Frame.io", label: "Frame.io" },
  { value: "QR Code Generator", label: "QR Code Generator" },
  { value: "North Sails", label: "North Sails" },
  { value: "Other", label: "Other" },
];

const QUARTERS: FieldOption[] = [
  { value: "Q1", label: "Q1" },
  { value: "Q2", label: "Q2" },
  { value: "Q3", label: "Q3" },
  { value: "Q4", label: "Q4" },
];

const MERCH_SIZES: FieldOption[] = [
  { value: "XS", label: "XS" },
  { value: "S", label: "S" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
  { value: "XL", label: "XL" },
  { value: "XXL", label: "XXL" },
  { value: "3XL", label: "3XL" },
];

const MERCH_ITEMS: FieldOption[] = [
  { value: "Polo — Regatta (polyester)", label: "Polo — Regatta (polyester)" },
  { value: "Polo — Pique (cotton)", label: "Polo — Pique (cotton)" },
  { value: "Polo — Tactel", label: "Polo — Tactel" },
  { value: "Gilet — Marstrand (navy)", label: "Gilet — Marstrand (navy)" },
  { value: "Sailor jacket (navy)", label: "Sailor jacket (navy)" },
  { value: "Collared shirt (white)", label: "Collared shirt (white)" },
  { value: "Premier white shirt", label: "Premier white shirt" },
  { value: "Backpack", label: "Backpack" },
  { value: "High Vis", label: "High Vis" },
];

const MERCH_FITS: FieldOption[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "", label: "—" },
];

const MERCH_COLOURS: FieldOption[] = [
  { value: "Navy", label: "Navy" },
  { value: "White", label: "White" },
  { value: "Yellow", label: "Yellow" },
];

const MERCH_LOGOS: FieldOption[] = CLOTHING_LOGOS.map((logo) => ({
  value: logo.id,
  label: logo.label,
}));

const MERCH_BRANDS: FieldOption[] = [
  { value: "North Sails", label: "North Sails" },
  { value: "Henbury", label: "Henbury" },
  { value: "Premier", label: "Premier" },
  { value: "BagBase", label: "BagBase" },
  { value: "Other", label: "Other" },
];

const INVENTORY_SIZES: FieldOption[] = [
  ...MERCH_SIZES,
  { value: "S-M", label: "S-M" },
  { value: "N/A", label: "N/A" },
];

const STAFF_KINDS: FieldOption[] = [
  { value: "asset", label: "Asset request" },
  { value: "social_form", label: "Social media form" },
  { value: "other", label: "Other" },
];

const PARTNER_KINDS: FieldOption[] = [
  { value: "sponsorship", label: "Sponsorship" },
  { value: "membership", label: "Membership" },
];

export const DIVISIONS: FieldOption[] = [
  { value: "All", label: "All" },
  { value: "Racing", label: "Racing" },
  { value: "Commercial", label: "Commercial" },
  { value: "Leisure", label: "Leisure" },
  { value: "Forwarding", label: "Forwarding" },
  { value: "CEC", label: "CEC" },
];

const f = (
  key: string,
  opts: {
    label?: string;
    type?: FieldType;
    options?: FieldOption[];
    optionsSource?: FieldOptionsSource;
    locked?: boolean;
  } = {}
): FieldDef => ({
  key,
  label: opts.label ?? key.replace(/_/g, " "),
  type: opts.type ?? "text",
  options: opts.options,
  optionsSource: opts.optionsSource,
  locked: opts.locked,
});

/** Owner fields: select populated from the contacts table (stores contact name). */
const ownerField = (): FieldDef =>
  f("owner", { type: "select", optionsSource: "contacts" });

/** Editable store collections (raw table view). */
export const DATA_COLLECTIONS: CollectionDef[] = [
  {
    key: "events",
    label: "Events",
    description: "Shows, meetings, ceremonies",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("title"),
      f("starts_at", { type: "datetime", label: "Starts" }),
      f("ends_at", { type: "datetime", label: "Ends" }),
      f("location"),
      f("event_type", {
        type: "select",
        label: "Type",
        options: EVENT_TYPES,
      }),
      f("division", { type: "select", options: DIVISIONS }),
      f("notes", { type: "longtext" }),
      f("link_url", { type: "url", label: "Link" }),
      f("created_by", { label: "Created by" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "content",
    label: "Content / Social Posts",
    description: "Pipeline pieces — link to a theme here when part of quarterly planning",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("title"),
      f("content_type", {
        type: "select",
        label: "Content type",
        options: CONTENT_TYPES,
      }),
      f("channel", { type: "tags", label: "Channels", options: CHANNELS }),
      f("due_date", { type: "date", label: "Date" }),
      f("deadline_date", { type: "date", label: "Deadline" }),
      f("category", {
        type: "select",
        label: "Category",
        options: CONTENT_CATEGORIES,
      }),
      f("priority", {
        type: "select",
        label: "Priority",
        options: CONTENT_PRIORITIES,
      }),
      f("status", { type: "select", options: CONTENT_STATUS }),
      f("theme_id", {
        type: "select",
        label: "Theme",
        optionsSource: "themes",
      }),
      f("caption", { type: "longtext", label: "Caption / post text" }),
      f("website", { type: "url", label: "Website / publication URL" }),
      f("planable_url", { type: "url", label: "Planable URL" }),
      f("planable_post_id", {
        type: "text",
        label: "Planable post ID",
        locked: true,
      }),
      f("planable_group_id", {
        type: "text",
        label: "Planable group ID",
        locked: true,
      }),
      f("planable_page_ids", {
        type: "text",
        label: "Planable page IDs",
        locked: true,
      }),
      f("last_synced_at", {
        type: "readonly",
        label: "Last Planable sync",
        locked: true,
      }),
      f("sync_source", {
        type: "select",
        label: "Sync source",
        locked: true,
        options: [
          { value: "", label: "—" },
          { value: "hub", label: "Hub" },
          { value: "planable", label: "Planable" },
        ],
      }),
      f("asset_url", { type: "url", label: "Assets / Canva URLs" }),
      f("notes", { type: "longtext" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "sponsorships",
    label: "Partners",
    description: "Sponsorships & memberships",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("kind", { type: "select", options: PARTNER_KINDS }),
      f("partner", { label: "Partner / organisation" }),
      f("package_name", { label: "Package / tier" }),
      f("starts_at", { type: "date", label: "Starts" }),
      f("ends_at", { type: "date", label: "Ends" }),
      f("value"),
      f("status", { type: "select", options: PARTNER_STATUS }),
      f("deliverables", { type: "longtext" }),
      ownerField(),
      f("onedrive_url", { type: "url", label: "Docs URL" }),
      f("notes", { type: "longtext" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "awards",
    label: "Awards",
    description: "Industry awards tracking",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("title"),
      f("organisation"),
      f("category"),
      f("year", { type: "number" }),
      f("status", { type: "select", options: AWARD_STATUS }),
      f("ceremony_at", { type: "date", label: "Ceremony" }),
      ownerField(),
      f("event_id", { label: "Event id" }),
      f("notes", { type: "longtext" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "contacts",
    label: "Contacts",
    description: "People, press, and supplier companies",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("kind", { type: "select", options: CONTACT_KINDS }),
      f("name"),
      f("organisation"),
      f("role"),
      f("email", { type: "email" }),
      f("phone"),
      f("website", { type: "url" }),
      f("services"),
      f("tags", { type: "tags" }),
      f("notes", { type: "longtext" }),
      f("is_press", {
        type: "select",
        label: "Press contact",
        options: [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ],
      }),
      f("beat", { label: "Beat" }),
      f("outlet", { label: "Outlet" }),
      f("country"),
      f("preferred_topics", { label: "Preferred topics" }),
      f("last_contacted_at", { type: "date", label: "Last contacted" }),
      f("marketing_consent", {
        type: "select",
        label: "Marketing consent",
        options: [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
          { value: "", label: "Unknown" },
        ],
      }),
      f("user_id", { label: "Linked user ID", type: "readonly" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "media_lists",
    label: "Email / media lists",
    description: "Press and marketing audience lists",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("name"),
      f("description", { type: "longtext" }),
      f("list_kind", {
        type: "select",
        label: "List kind",
        options: [
          { value: "press", label: "Press" },
          { value: "marketing", label: "Marketing" },
          { value: "mixed", label: "Mixed" },
        ],
      }),
      f("source", { label: "Source" }),
      f("contact_ids", { type: "tags", label: "Contact IDs" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "pr_pitches",
    label: "Emails",
    description: "PR Outlook pitches and marketing HubSpot drafts",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("title"),
      f("subject"),
      f("body", { type: "longtext" }),
      f("preview_text", { label: "Preview text" }),
      f("channel", {
        type: "select",
        options: [
          { value: "pr", label: "PR" },
          { value: "marketing", label: "Marketing" },
        ],
      }),
      f("from_name", { label: "From name" }),
      f("from_email", { label: "From email", type: "email" }),
      f("campaign_tag", { label: "Campaign tag" }),
      f("status", {
        type: "select",
        options: [
          { value: "draft", label: "Draft" },
          { value: "exported", label: "Exported" },
          { value: "sent_external", label: "Sent external" },
          { value: "archived", label: "Archived" },
        ],
      }),
      f("media_list_id", { label: "Media list ID" }),
      f("list_ids", { type: "tags", label: "List IDs" }),
      f("recipient_ids", { type: "tags", label: "Recipient IDs" }),
      f("content_id", { label: "Content ID" }),
      f("event_id", { label: "Event ID" }),
      f("hubspot_url", { label: "HubSpot URL", type: "url" }),
      f("parent_draft_id", { label: "Parent draft ID" }),
      f("theme_id", { label: "Theme ID" }),
      f("exported_at", { type: "readonly", label: "Exported at" }),
      f("notes", { type: "longtext" }),
      f("created_by", { label: "Created by" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "pr_coverage",
    label: "PR coverage",
    description: "Media clippings and coverage",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("title"),
      f("url", { type: "url" }),
      f("outlet"),
      f("published_at", { type: "date", label: "Published" }),
      f("sentiment", {
        type: "select",
        options: [
          { value: "", label: "—" },
          { value: "positive", label: "Positive" },
          { value: "neutral", label: "Neutral" },
          { value: "negative", label: "Negative" },
        ],
      }),
      f("notes", { type: "longtext" }),
      f("pitch_id", { label: "Pitch ID" }),
      f("content_id", { label: "Content ID" }),
      f("event_id", { label: "Event ID" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "pr_monitor_queries",
    label: "PR monitor queries",
    description: "Media monitoring keyword queries",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("name"),
      f("keywords", { type: "longtext" }),
      f("exclusions", { type: "longtext" }),
      f("active", {
        type: "select",
        options: [
          { value: "true", label: "Active" },
          { value: "false", label: "Paused" },
        ],
      }),
      f("last_run_at", { type: "readonly" }),
      f("notes", { type: "longtext" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "pr_monitor_mentions",
    label: "PR monitor mentions",
    description: "Monitoring inbox (promote to coverage)",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("query_id", { label: "Query ID" }),
      f("title"),
      f("url", { type: "url" }),
      f("outlet"),
      f("published_at", { type: "date" }),
      f("snippet", { type: "longtext" }),
      f("status", {
        type: "select",
        options: [
          { value: "new", label: "New" },
          { value: "promoted", label: "Promoted" },
          { value: "dismissed", label: "Dismissed" },
        ],
      }),
      f("external_id", { label: "External ID" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "resources",
    label: "Resources",
    description: "Useful links",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("title"),
      f("description", { type: "longtext" }),
      f("url", { type: "url" }),
      f("category", { type: "select", options: RESOURCE_CATEGORIES }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "reports",
    label: "Reports",
    description: "Analytics links",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("title"),
      f("description", { type: "longtext" }),
      f("url", { type: "url" }),
      f("category", { type: "select", options: REPORT_CATEGORIES }),
      f("tool", { type: "select", options: REPORT_TOOLS }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "paid_campaigns",
    label: "Paid media",
    description: "LinkedIn, Google Ads, and other paid campaign snapshots",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("name", { label: "Campaign name" }),
      f("platform", { type: "select", options: PAID_CAMPAIGN_PLATFORMS }),
      f("status", { type: "select", options: PAID_CAMPAIGN_STATUS }),
      f("external_id", { label: "Platform campaign ID" }),
      f("external_url", { type: "url", label: "Platform URL" }),
      f("starts_at", { type: "date", label: "Start date" }),
      f("ends_at", { type: "date", label: "End date" }),
      f("spent", { type: "number", label: "Spent (£)" }),
      f("goal", { label: "Goal" }),
      f("key_results", { label: "Key results" }),
      f("cost_per_result", { type: "number", label: "Cost per result (£)" }),
      f("impressions", { type: "number" }),
      f("clicks", { type: "number" }),
      f("ctr", { label: "CTR" }),
      f("landing_clicks", { type: "number", label: "Landing page clicks" }),
      f("engagement_rate", { label: "Engagement rate" }),
      f("notes", { type: "longtext" }),
      f("theme_id", { label: "Theme", optionsSource: "themes" }),
      f("content_id", { label: "Content ID" }),
      f("event_id", { label: "Event ID" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "advertisements",
    label: "Advertisements",
    description: "Print and placement ads — artwork, agreement, run dates",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("title"),
      f("publication"),
      f("status", { type: "select", options: ADVERTISEMENT_STATUS }),
      f("starts_at", { type: "date", label: "Start date" }),
      f("ends_at", { type: "date", label: "End date" }),
      f("artwork_url", { type: "url", label: "Artwork" }),
      f("agreement_url", { type: "url", label: "Agreement" }),
      f("notes", { type: "longtext" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "platform_credentials",
    label: "Platform logins",
    description: "Shared marketing platform credentials (admin only)",
    hiddenFromDataAdmin: true,
    adminOnly: true,
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("platform", {
        type: "select",
        options: PLATFORM_CREDENTIAL_PLATFORMS,
      }),
      f("url", { type: "url" }),
      f("username"),
      f("password"),
      f("notes", { type: "longtext" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "themes",
    label: "Themes",
    description: "Quarterly themes",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("title"),
      f("quarter", { type: "select", options: QUARTERS }),
      f("year", { type: "number" }),
      f("status", { type: "select", options: THEME_STATUS }),
      f("summary", { type: "longtext" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "theme_mains",
    label: "Theme mains",
    description: "Internal theme → content links (use Content table + Theme field)",
    hiddenFromDataAdmin: true,
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("theme_id", { label: "Theme id" }),
      f("content_id", { label: "Content id" }),
      f("title"),
      f("channel", { type: "select", options: CHANNELS }),
      ownerField(),
      f("status", { type: "select", options: CONTENT_STATUS }),
      f("notes", { type: "longtext" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "theme_offshoots",
    label: "Theme offshoots",
    description: "Internal offshoot rows (managed on Themes page)",
    hiddenFromDataAdmin: true,
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("main_content_id", { label: "Main id" }),
      f("title"),
      f("channel", { type: "select", options: CHANNELS }),
      ownerField(),
      f("status", { type: "select", options: CONTENT_STATUS }),
      f("notes", { type: "longtext" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "merch_orders",
    label: "Merch orders",
    description: "North Sails corporate clothing",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("item", { type: "select", options: MERCH_ITEMS }),
      f("fit", { type: "select", options: MERCH_FITS, label: "Fit" }),
      f("size", { type: "select", options: MERCH_SIZES }),
      f("quantity", { type: "number" }),
      f("colour", { type: "select", options: MERCH_COLOURS }),
      f("logo", { type: "select", options: MERCH_LOGOS, label: "Logo" }),
      f("requested_for", { label: "Requested for" }),
      f("requested_for_contact_id", {
        label: "Requested for contact ID",
        type: "readonly",
      }),
      f("office"),
      f("needed_by", { type: "date", label: "Needed by" }),
      f("status", { type: "select", options: MERCH_STATUS }),
      f("notes", { type: "longtext" }),
      f("created_by", { label: "Created by" }),
      f("created_by_user_id", {
        label: "Created by user ID",
        type: "readonly",
        locked: true,
      }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "merch_inventory",
    label: "Merch inventory",
    description: "On-hand corporate clothing stock",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("item", { type: "select", options: MERCH_ITEMS }),
      f("brand", { type: "select", options: MERCH_BRANDS }),
      f("fit", { type: "select", options: MERCH_FITS, label: "Fit" }),
      f("size", { type: "select", options: INVENTORY_SIZES }),
      f("colour", { type: "select", options: MERCH_COLOURS }),
      f("quantity", { type: "number" }),
      f("image_url", { type: "url", label: "Image" }),
      f("notes", { type: "longtext" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "staff_requests",
    label: "Staff requests",
    description: "Asset & form requests",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("kind", { type: "select", options: STAFF_KINDS }),
      f("category", {
        type: "select",
        label: "Asset type",
        options: ASSET_REQUEST_CATEGORIES,
      }),
      f("title"),
      f("details", { type: "longtext" }),
      f("requested_by", { label: "Requested by" }),
      f("needed_by", { type: "date", label: "Needed by" }),
      f("attachment_url", { type: "url", label: "Attachment" }),
      f("status", { type: "select", options: STAFF_REQUEST_STATUS }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
  {
    key: "tasks",
    label: "Tasks",
    description: "Marketing to-dos",
    fields: [
      f("id", { type: "readonly", locked: true }),
      f("title"),
      f("details", { type: "longtext" }),
      f("start_date", { type: "date", label: "From" }),
      f("due_date", { type: "date", label: "Deadline" }),
      f("category", { type: "select", options: TASK_CATEGORIES }),
      f("status", {
        type: "select",
        options: TASK_STATUSES,
      }),
      ownerField(),
      f("related_type", {
        type: "select",
        label: "Linked to",
        options: TASK_RELATED_TYPES,
      }),
      f("related_id", { label: "Linked record id" }),
      f("created_at", { type: "readonly", locked: true }),
      f("updated_at", { type: "readonly", locked: true }),
    ],
  },
];

export function getCollection(key: string): CollectionDef | undefined {
  return DATA_COLLECTIONS.find((c) => c.key === key);
}

export function isCollectionKey(key: string): key is CollectionKey {
  return DATA_COLLECTIONS.some((c) => c.key === key);
}

/** Keep a legacy/custom value selectable when it is not in the option list. */
export function selectOptionsWithCurrent(
  options: FieldOption[],
  currentValue?: string
): FieldOption[] {
  const current = (currentValue ?? "").trim();
  if (!current || options.some((o) => o.value === current)) return options;
  return [{ value: current, label: `${current} (custom)` }, ...options];
}

/** Insert an option if missing (case-insensitive), optionally after a given value. */
export function ensureFieldOption(
  options: FieldOption[],
  option: FieldOption,
  afterValue?: string
): FieldOption[] {
  const needle = option.value.trim().toLowerCase();
  if (options.some((o) => o.value.trim().toLowerCase() === needle)) {
    return options;
  }
  if (afterValue) {
    const after = afterValue.trim().toLowerCase();
    const idx = options.findIndex(
      (o) => o.value.trim().toLowerCase() === after
    );
    if (idx >= 0) {
      return [...options.slice(0, idx + 1), option, ...options.slice(idx + 1)];
    }
  }
  return [...options, option];
}

/** Resolve Field Manager options for a key, falling back to the built-in list. */
export function optionsForField(
  fieldOptions: Record<string, FieldOption[]> | undefined | null,
  key: string,
  fallback: FieldOption[]
): FieldOption[] {
  const opts = fieldOptions?.[key];
  return opts?.length ? opts : fallback;
}

/**
 * Order filter values by Field Manager option order, then append any
 * extra values present in the data (alphabetically).
 */
export function orderedFilterValues(
  managed: FieldOption[] | undefined,
  present: Iterable<string>
): string[] {
  const presentSet = new Set(
    Array.from(present)
      .map((v) => v.trim())
      .filter(Boolean)
  );
  if (!managed?.length) {
    return Array.from(presentSet).sort((a, b) => a.localeCompare(b));
  }
  const ordered = managed
    .map((o) => o.value)
    .filter((v) => presentSet.has(v));
  const managedSet = new Set(managed.map((o) => o.value));
  const extras = Array.from(presentSet)
    .filter((v) => !managedSet.has(v))
    .sort((a, b) => a.localeCompare(b));
  return [...ordered, ...extras];
}

/** Build owner dropdown options from the contacts table. */
export function contactOwnerOptions(
  contacts: { name: string; organisation?: string }[],
  currentValue?: string
): FieldOption[] {
  const seen = new Set<string>();
  const options: FieldOption[] = [];
  for (const c of contacts) {
    const name = (c.name ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const org = (c.organisation ?? "").trim();
    options.push({
      value: name,
      label: org ? `${name} · ${org}` : name,
    });
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  const current = (currentValue ?? "").trim();
  if (current && !seen.has(current)) {
    options.unshift({
      value: current,
      label: `${current} (not in contacts)`,
    });
  }
  return options;
}

/** Theme link options for content.theme_id in Data Admin. */
export function themeLinkOptions(
  themes: { id: string; title: string; quarter?: string; year?: number }[],
  currentValue?: string | null
): FieldOption[] {
  const options: FieldOption[] = [{ value: "", label: "— None —" }];
  const seen = new Set<string>();
  for (const t of themes) {
    const id = (t.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const when =
      t.quarter && t.year ? ` · ${t.quarter} ${t.year}` : t.year ? ` · ${t.year}` : "";
    options.push({
      value: id,
      label: `${(t.title || "Untitled").trim()}${when}`,
    });
  }
  const current = (currentValue ?? "").trim();
  if (current && !seen.has(current)) {
    options.splice(1, 0, {
      value: current,
      label: `${current} (missing theme)`,
    });
  }
  return options;
}

/** Infer type for custom / discovered fields. */
export function inferFieldType(key: string): FieldType {
  const k = key.toLowerCase();
  if (k === "id" || k === "created_at" || k === "updated_at") return "readonly";
  if (k === "owner") return "select";
  if (k.includes("email")) return "email";
  if (k.includes("url") || k.includes("link")) return "url";
  if (k === "tags" || k === "channel" || k === "channels") return "tags";
  if (
    k.includes("notes") ||
    k.includes("details") ||
    k.includes("summary") ||
    k.includes("description") ||
    k.includes("deliverables")
  ) {
    return "longtext";
  }
  if (k === "starts_at" || k === "ends_at") return "datetime";
  if (
    k.endsWith("_at") ||
    k.endsWith("_date") ||
    k.includes("needed_by") ||
    k.includes("ceremony") ||
    k.includes("due_date")
  ) {
    return "date";
  }
  if (k.includes("quantity") || k === "year") return "number";
  return "text";
}

export function statusTone(value: string): string {
  const s = value.toLowerCase();
  if (
    s.includes("publish") ||
    s.includes("active") ||
    s.includes("won") ||
    s.includes("delivered") ||
    s.includes("done") ||
    (s.includes("going") && !s.includes("not"))
  ) {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  if (
    s.includes("schedul") ||
    s.includes("confirm") ||
    s.includes("submitted") ||
    s.includes("ordered") ||
    s.includes("approved")
  ) {
    return "bg-sky-50 text-sky-800 border-sky-200";
  }
  if (
    s.includes("review") ||
    s.includes("negotiat") ||
    s.includes("shortlist") ||
    s.includes("entering") ||
    s.includes("maybe") ||
    s.includes("progress")
  ) {
    return "bg-amber-50 text-amber-900 border-amber-200";
  }
  if (
    s.includes("declin") ||
    s.includes("cancel") ||
    s.includes("not_won") ||
    s.includes("not_going")
  ) {
    return "bg-rose-50 text-rose-800 border-rose-200";
  }
  if (s.includes("complete") || s.includes("previous")) {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }
  return "bg-sand text-foreground border-border";
}
