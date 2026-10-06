import type {
  ContentItem,
  EmailCampaign,
  EmailCampaignStats,
  HubStore,
} from "@/lib/types";

/** Bump when the imported release set changes. Existing hubs import once. */
export const RELEASE_LIBRARY_VERSION = 2;

const AUTHOR = "Sophie Edgerley";

function stats(
  recipients: number,
  openRate: number,
  clickRate: number
): EmailCampaignStats {
  const opened = Math.round((recipients * openRate) / 100);
  const clicked = Math.round((recipients * clickRate) / 100);
  return {
    recipients,
    delivered: recipients,
    opened,
    clicked,
    bounced: 0,
    complained: 0,
    unsubscribed: 0,
  };
}

const EMPTY_STATS: EmailCampaignStats = {
  recipients: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  complained: 0,
  unsubscribed: 0,
};

function story(input: {
  id: string;
  title: string;
  category: string;
  publishedAt: string;
  createdAt: string;
  pin?: boolean;
  slider?: boolean;
  newsroom?: string;
}): ContentItem {
  return {
    id: input.id,
    title: input.title,
    channel: ["PR"],
    content_type: "PR",
    owner: AUTHOR,
    due_date: input.publishedAt,
    deadline_date: null,
    status: "published",
    category: input.category,
    priority: "",
    website: "",
    caption: "",
    theme_id: null,
    planable_url: "",
    planable_post_id: "",
    planable_group_id: "",
    planable_page_ids: [],
    last_synced_at: null,
    sync_source: "",
    asset_url: "",
    notes: "",
    pin_homepage: input.pin === true,
    in_slider: input.slider === true,
    newsroom_name: input.newsroom ?? "Peters & May News",
    created_at: input.createdAt,
    updated_at: input.publishedAt,
  };
}

function email(input: {
  id: string;
  title: string;
  folder: string;
  status: EmailCampaign["status"];
  contentId: string | null;
  createdAt: string;
  sentAt: string | null;
  recipients?: number;
  openRate?: number | null;
  clickRate?: number | null;
}): EmailCampaign {
  const hasRates =
    input.status === "sent" &&
    typeof input.recipients === "number" &&
    input.openRate != null &&
    input.clickRate != null;
  return {
    id: input.id,
    title: input.title,
    status: input.status,
    subject: input.title,
    preview_text: "",
    from_name: "Peters & May",
    from_email: "marketing@petersandmay.com",
    html_body: "",
    design: null,
    template_id: null,
    audience_id: null,
    list_ids: [],
    recipient_ids: [],
    brief: "",
    hubspot_url: "",
    theme_id: null,
    content_id: input.contentId,
    folder: input.folder,
    follow_up_of: null,
    adj_open_rate: hasRates ? input.openRate! : input.status === "draft" ? 0 : null,
    adj_click_rate: hasRates ? input.clickRate! : input.status === "draft" ? 0 : null,
    scheduled_at: null,
    sent_at: input.sentAt,
    stats: hasRates
      ? stats(input.recipients!, input.openRate!, input.clickRate!)
      : EMPTY_STATS,
    last_error: "",
    created_by: AUTHOR,
    created_at: input.createdAt,
    updated_at: input.sentAt ?? input.createdAt,
  };
}

export function releaseLibraryContent(): ContentItem[] {
  return [
    story({
      id: "cnt_rel_experience",
      title:
        "Why Experience Matters When Marine Cargo Can't Afford to Go Wrong",
      category: "News",
      publishedAt: "2026-09-21T09:43:00+01:00",
      createdAt: "2026-09-14T09:00:00+01:00",
    }),
    story({
      id: "cnt_rel_forwarding_simpler",
      title:
        "Global Forwarding Is Becoming More Complex, but Peters & May Helps Make It Simpler",
      category: "",
      publishedAt: "2026-06-29T09:37:00+01:00",
      createdAt: "2026-07-06T09:00:00+01:00",
      newsroom: "",
    }),
    story({
      id: "cnt_rel_nl_warehouse",
      title:
        "Peters & May Expands European Logistics Capability with Netherlands Bonded Warehouse and AEO Status",
      category: "News",
      publishedAt: "2026-06-16T11:03:00+01:00",
      createdAt: "2026-06-20T09:00:00+01:00",
      pin: true,
      slider: true,
    }),
    story({
      id: "cnt_rel_shipping_afterthought",
      title: "Why Shipping Shouldn’t Be an Afterthought",
      category: "Expert Insights",
      publishedAt: "2026-05-29T10:00:00+01:00",
      createdAt: "2026-06-10T09:00:00+01:00",
    }),
    story({
      id: "cnt_rel_forwarding_complex",
      title:
        "Global Forwarding Is Becoming More Complex, Just as Customers Expect It to Feel Simpler",
      category: "Expert Insights",
      publishedAt: "2026-06-29T09:24:00+01:00",
      createdAt: "2026-06-01T09:00:00+01:00",
    }),
    story({
      id: "cnt_rel_transport_partners",
      title:
        "Peters & May Integrates Transport Partners BV into Global Brand to Support Growth in Europe",
      category: "News",
      publishedAt: "2026-05-29T08:45:00+01:00",
      createdAt: "2025-10-06T09:00:00+01:00",
    }),
  ];
}

export function releaseLibraryCampaigns(): EmailCampaign[] {
  return [
    email({
      id: "ecamp_rel_experience",
      title:
        "New Release - Why Experience Matters When Marine Cargo Can't Afford to Go Wrong",
      folder: "Commercial",
      status: "sent",
      contentId: "cnt_rel_experience",
      createdAt: "2026-09-21T10:00:00+01:00",
      sentAt: "2026-09-21T11:01:00+01:00",
      recipients: 42,
      openRate: 45,
      clickRate: 8,
    }),
    email({
      id: "ecamp_rel_untitled",
      title: "Untitled 17-09-26 14:51",
      folder: "",
      status: "draft",
      contentId: null,
      createdAt: "2026-09-17T14:51:00+01:00",
      sentAt: null,
    }),
    email({
      id: "ecamp_rel_forwarding",
      title:
        "Global Forwarding Is Becoming More Complex, but Peters & May Helps Make It Simpler",
      folder: "Forwarding",
      status: "sent",
      contentId: "cnt_rel_forwarding_simpler",
      createdAt: "2026-06-29T09:00:00+01:00",
      sentAt: "2026-06-29T09:37:00+01:00",
      recipients: 174,
      openRate: 33,
      clickRate: 5,
    }),
    email({
      id: "ecamp_rel_nl_us",
      title:
        "PRESS RELEASE | Peters & May launches Netherlands bonded warehouse supporting US exporters into Europe",
      folder: "Forwarding",
      status: "sent",
      contentId: "cnt_rel_nl_warehouse",
      createdAt: "2026-06-19T15:00:00+01:00",
      sentAt: "2026-06-19T16:00:00+01:00",
      recipients: 24,
      openRate: 19,
      clickRate: 0,
    }),
    email({
      id: "ecamp_rel_nl_nl",
      title:
        "NETHERLANDS PRESS RELEASE | Peters & May expands European logistics capability with Netherlands bonded warehouse",
      folder: "Forwarding",
      status: "sent",
      contentId: "cnt_rel_nl_warehouse",
      createdAt: "2026-06-18T08:00:00+01:00",
      sentAt: "2026-06-18T08:48:00+01:00",
      recipients: 55,
      openRate: 34,
      clickRate: 8,
    }),
    email({
      id: "ecamp_rel_nl_uk",
      title:
        "PRESS RELEASE | Peters & May expands European logistics capability with Netherlands bonded warehouse",
      folder: "Forwarding",
      status: "sent",
      contentId: "cnt_rel_nl_warehouse",
      createdAt: "2026-06-16T12:00:00+01:00",
      sentAt: "2026-06-16T13:14:00+01:00",
    }),
  ];
}

export function needsReleaseLibrary(
  store: Partial<HubStore> | null | undefined
): boolean {
  const version = store?.newsroom_settings?.release_library_version ?? 0;
  return version < RELEASE_LIBRARY_VERSION;
}

function normTitle(value: string) {
  return value.trim().toLowerCase().replace(/[’']/g, "'");
}

const SHIPPING_TITLE = "why shipping shouldn't be an afterthought";

/** File an existing editorial on the newsroom when the library title already exists. */
function fileExistingShippingStory(content: ContentItem[]): ContentItem[] {
  return content.map((c) => {
    if (normTitle(c.title) !== SHIPPING_TITLE) return c;
    if (c.id.startsWith("cnt_rel_")) return c;
    const channel = Array.isArray(c.channel) ? c.channel : [];
    const nextChannel = channel.some((ch) => ch.toLowerCase() === "pr")
      ? channel
      : [...channel, "PR"];
    return {
      ...c,
      channel: nextChannel,
      category: c.category || "Expert Insights",
      newsroom_name: c.newsroom_name ?? "Peters & May News",
      owner: c.owner || AUTHOR,
    };
  });
}

/** Insert the imported releases once. Later deletes are left alone. */
export function applyReleaseLibrary(store: HubStore): HubStore {
  const version = store.newsroom_settings.release_library_version ?? 0;
  if (version >= RELEASE_LIBRARY_VERSION) return store;

  let content = store.content;
  let email_campaigns = store.email_campaigns ?? [];

  if (version < 1) {
    const contentTitles = new Set(content.map((c) => normTitle(c.title)));
    const contentIds = new Set(content.map((c) => c.id));
    const campaignTitles = new Set(
      email_campaigns.map((c) => normTitle(c.title))
    );
    const campaignIds = new Set(email_campaigns.map((c) => c.id));
    content = [
      ...releaseLibraryContent().filter(
        (c) => !contentIds.has(c.id) && !contentTitles.has(normTitle(c.title))
      ),
      ...content,
    ];
    email_campaigns = [
      ...releaseLibraryCampaigns().filter(
        (c) => !campaignIds.has(c.id) && !campaignTitles.has(normTitle(c.title))
      ),
      ...email_campaigns,
    ];
  }

  if (version < 2) content = fileExistingShippingStory(content);

  return {
    ...store,
    content,
    email_campaigns,
    newsroom_settings: {
      ...store.newsroom_settings,
      release_library_version: RELEASE_LIBRARY_VERSION,
    },
  };
}
