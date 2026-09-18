export type UserRole = "admin" | "staff" | "media_guest";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
};

/** Hub access directory roles (Admin → Users). */
export type HubAccessRole = "admin" | "member" | "external";

export type HubUser = {
  id: string;
  email: string;
  full_name: string;
  role: HubAccessRole;
  notes: string;
  /** Present when loaded from Supabase Auth. */
  last_sign_in_at?: string | null;
  /** Null until the user accepts invite / confirms email (Supabase). */
  email_confirmed_at?: string | null;
  /** Set when an invite was sent (Supabase). */
  invited_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type EventItem = {
  id: string;
  title: string;
  /** Null when the date still needs adding (not shown on calendar). */
  starts_at: string | null;
  ends_at: string | null;
  location: string;
  event_type: string;
  /** Business division (Racing, Commercial, Leisure, …) */
  division: string;
  notes: string;
  link_url: string;
  /** Admin checklist — company social post for this event is done. */
  social_media_post_completed: boolean;
  /** Admin checklist — personal/staff social graphics for this event are done. */
  personal_social_media_graphics_completed: boolean;
  /** Admin checklist — PR outreach to event organisers has been made. */
  reached_out_for_pr_to_organisers: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Per-user RSVP for an event (logged-in staff). */
export type EventAttendanceStatus =
  | "attending"
  | "maybe"
  | "not_attending"
  | "interested";

export type EventAttendance = {
  id: string;
  event_id: string;
  user_id: string;
  /** Display name captured at RSVP time. */
  user_name: string;
  attendance_status: EventAttendanceStatus;
  created_at: string;
  updated_at: string;
};

export type ContentStatus =
  | "idea"
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "cancelled";

export type ContentItem = {
  id: string;
  title: string;
  /** Platforms / outlets (LinkedIn, Instagram, …) — one or more */
  channel: string[];
  /** Kind of piece from source post_type (Social, Editorial, Newsletter, …) */
  content_type: string;
  owner: string;
  /** Publish / go-live date (calendar) */
  due_date: string | null;
  /** Optional internal deadline (Content table date_due) */
  deadline_date: string | null;
  status: ContentStatus;
  category: string;
  priority: string;
  website: string;
  /** Social caption / post copy (Content table content_post_text) */
  caption: string;
  /** Linked quarterly theme (content lives here; Themes page may still use mains for tree). */
  theme_id: string | null;
  planable_url: string;
  /** Planable post id (primary page when multi-page group). */
  planable_post_id: string;
  /** Planable groupId — one Hub card for multi-channel posts. */
  planable_group_id: string;
  /** Planable page ids linked to this piece. */
  planable_page_ids: string[];
  /** Last successful Planable sync timestamp (ISO). */
  last_synced_at: string | null;
  /** Who last wrote syncable fields — loop prevention. */
  sync_source: "hub" | "planable" | "";
  /** Asset / Canva URLs (newline-separated when multiple) */
  asset_url: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type SponsorshipStatus =
  | "prospect"
  | "negotiating"
  | "confirmed"
  | "active"
  | "complete"
  | "declined";

/** Sponsorship packages or industry memberships — both live under Partners. */
export type PartnerKind = "sponsorship" | "membership";
/** A membership can be an association membership or a directory/profile listing. */
export type MembershipType = "membership" | "directory_listing";

export type Sponsorship = {
  id: string;
  kind: PartnerKind;
  /** Only applies when kind is membership. */
  membership_type: MembershipType;
  partner: string;
  package_name: string;
  starts_at: string | null;
  ends_at: string | null;
  value: string;
  status: SponsorshipStatus;
  deliverables: string;
  owner: string;
  onedrive_url: string;
  notes: string;
  /** Display name of who added the record. */
  created_by: string;
  /** Auth user id of who added — members edit only their own memberships. */
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ContactKind = "person" | "company";

export type Contact = {
  id: string;
  /** People vs supplier / vendor companies. */
  kind: ContactKind;
  name: string;
  organisation: string;
  role: string;
  email: string;
  phone: string;
  /** Company website (mainly for kind=company). */
  website: string;
  /** What the company does — e.g. clothing, print (mainly for kind=company). */
  services: string;
  tags: string[];
  notes: string;
  /** Hub user (auth) linked to this contact — members edit only their linked record. */
  user_id: string | null;
  /** Journalist / media contact (shown in PR module). */
  is_press: boolean;
  /** Coverage beat — e.g. yachting, freight, logistics. */
  beat: string;
  /** Publication / outlet name when distinct from organisation. */
  outlet: string;
  /** Country or market focus. */
  country: string;
  /** Topics they prefer to cover. */
  preferred_topics: string;
  /** Last outreach / contact date (ISO date or datetime). */
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Saved media list for PR targeting. */
export type MediaList = {
  id: string;
  name: string;
  description: string;
  /** Contact ids on this list. */
  contact_ids: string[];
  created_at: string;
  updated_at: string;
};

export type PrPitchStatus = "draft" | "exported" | "archived";

/** Pitch drafted in Hub; sent via Outlook (.eml), not Hub mail. */
export type PrPitch = {
  id: string;
  title: string;
  subject: string;
  /** Plain or HTML body; merge fields {{name}}, {{outlet}}, {{organisation}}. */
  body: string;
  status: PrPitchStatus;
  /** Optional media list used as recipient source. */
  media_list_id: string | null;
  /** Explicit recipient contact ids (overrides / supplements list). */
  recipient_ids: string[];
  /** Linked press release (content id). */
  content_id: string | null;
  /** Linked event id. */
  event_id: string | null;
  /** When staff downloaded / opened for Outlook. */
  exported_at: string | null;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PrCoverageSentiment = "positive" | "neutral" | "negative" | "";

/** Manual or promoted media coverage / clipping. */
export type PrCoverage = {
  id: string;
  title: string;
  url: string;
  outlet: string;
  published_at: string | null;
  sentiment: PrCoverageSentiment;
  notes: string;
  pitch_id: string | null;
  content_id: string | null;
  event_id: string | null;
  /** Set when promoted from a monitor mention. */
  monitor_mention_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Brand / keyword query for media monitoring. */
export type PrMonitorQuery = {
  id: string;
  name: string;
  keywords: string;
  /** Comma-separated terms to exclude. */
  exclusions: string;
  active: boolean;
  last_run_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

/** Ingested mention awaiting promote-to-coverage or dismiss. */
export type PrMonitorMentionStatus = "new" | "promoted" | "dismissed";

export type PrMonitorMention = {
  id: string;
  query_id: string;
  title: string;
  url: string;
  outlet: string;
  published_at: string | null;
  snippet: string;
  status: PrMonitorMentionStatus;
  external_id: string;
  created_at: string;
  updated_at: string;
};

export type ResourceLink = {
  id: string;
  title: string;
  description: string;
  url: string;
  category: string;
  created_at: string;
  updated_at: string;
};

/** External reporting dashboards (GA, Ads, SE Ranking, Looker Studio, etc.) */
export type ReportLink = {
  id: string;
  title: string;
  description: string;
  url: string;
  category: string;
  tool: string;
  created_at: string;
  updated_at: string;
};

export type PaidCampaignStatus = "draft" | "active" | "paused" | "complete";

/** Paid media snapshot — LinkedIn, Google Ads, etc. (manual entry v1). */
export type PaidCampaign = {
  id: string;
  name: string;
  platform: string;
  status: PaidCampaignStatus;
  external_id: string;
  external_url: string;
  starts_at: string | null;
  ends_at: string | null;
  /** Total spend in GBP. */
  spent: number | null;
  goal: string;
  key_results: string;
  cost_per_result: number | null;
  impressions: number | null;
  clicks: number | null;
  /** e.g. "0.5%" */
  ctr: string;
  landing_clicks: number | null;
  /** e.g. "1.12%" — social platforms */
  engagement_rate: string;
  notes: string;
  theme_id: string | null;
  content_id: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AdvertisementStatus =
  | "planned"
  | "active"
  | "complete"
  | "cancelled";

/** Print / placement ads (artwork, agreement, run dates) — not digital paid metrics. */
export type Advertisement = {
  id: string;
  title: string;
  publication: string;
  status: AdvertisementStatus;
  starts_at: string | null;
  ends_at: string | null;
  artwork_url: string;
  agreement_url: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

/** Shared marketing-platform logins — admin-only vault. */
export type PlatformCredential = {
  id: string;
  platform: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

/** Quarterly planning spine: Theme → main content → offshoot content */
export type ThemeStatus = "previous" | "active" | "upcoming";

export type QuarterlyTheme = {
  id: string;
  title: string;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  year: number;
  status: ThemeStatus;
  summary: string;
  created_at: string;
  updated_at: string;
};

export type ThemeMainContent = {
  id: string;
  theme_id: string;
  /** Linked row in the Content table (attachments, due date, Planable, etc.) */
  content_id: string | null;
  title: string;
  channel: string;
  owner: string;
  status: ContentStatus;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type ThemeOffshoot = {
  id: string;
  main_content_id: string;
  title: string;
  channel: string;
  owner: string;
  status: ContentStatus;
  notes: string;
  created_at: string;
  updated_at: string;
};

/** Internal branded clothing / merchandise requests */
export type MerchStatus =
  | "requested"
  | "approved"
  | "ordered"
  | "delivered"
  | "cancelled";

export type MerchOrderLineItem = {
  id: string;
  item: string;
  fit: "male" | "female" | "";
  size: string;
  quantity: number;
  colour: string;
  logo: string;
  /** Manual / non-catalogue line (e.g. jumper ordered elsewhere). */
  is_other?: boolean;
  other_description?: string;
};

export type MerchOrder = {
  id: string;
  /** Primary line summary — kept for search/filter; see items for full order. */
  item: string;
  /** Male or female cut */
  fit: "male" | "female" | "";
  size: string;
  quantity: number;
  colour: string;
  /** Embroidered / printed logo variant */
  logo: string;
  /** All clothing lines in this order (one order per person). */
  items?: MerchOrderLineItem[];
  requested_for: string;
  /** Contact this order is for (from Contacts). When that contact has user_id, ownership is allocated to them. */
  requested_for_contact_id: string | null;
  office: string;
  needed_by: string | null;
  status: MerchStatus;
  notes: string;
  created_by: string;
  /** Auth user id of the requester — members only see their own. */
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

/** On-hand corporate clothing / kit stock */
export type MerchInventoryItem = {
  id: string;
  item: string;
  brand: string;
  /** Male or female cut; empty for unisex / accessories */
  fit: "male" | "female" | "";
  size: string;
  colour: string;
  quantity: number;
  /** Optional photo of the stock item */
  image_url: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

/**
 * Catalogue overrides for a fixed clothing product (by product id).
 * Missing / empty override fields fall back to the built-in North Sails defaults.
 */
export type MerchCatalogueImage = {
  product_id: string;
  image_url: string;
  /** Display name override (renames the item everywhere it is used). */
  label?: string;
  brand?: string;
  material?: string;
  colours?: string[];
  default_colour?: string;
  /** When true, the item is removed from the live order catalogue. Admins can restore it. */
  hidden?: boolean;
  updated_at: string;
};

/** Internal staff requests (assets, social forms, etc.) */
export type StaffRequestKind = "asset" | "social_form" | "other";
export type StaffRequestStatus = "open" | "in_progress" | "done";

export type StaffRequest = {
  id: string;
  kind: StaffRequestKind;
  /** Asset type for kind=asset (Presentation, Brochure, Image, …) */
  category: string;
  title: string;
  details: string;
  requested_by: string;
  needed_by: string | null;
  /** Uploaded reference file / draft asset URL */
  attachment_url: string;
  status: StaffRequestStatus;
  created_at: string;
  updated_at: string;
};

/** Industry awards — entries, shortlists, wins */
export type AwardStatus =
  | "watching"
  | "entering"
  | "submitted"
  | "shortlisted"
  | "won"
  | "not_won";

export type AwardEntry = {
  id: string;
  title: string;
  organisation: string;
  category: string;
  year: number;
  status: AwardStatus;
  ceremony_at: string | null;
  owner: string;
  event_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

/** Marketing to-dos — status values come from Field Manager options. */
export type TaskStatus = string;

/** Optional link from a task to another hub record. */
export type TaskRelatedType =
  | "content"
  | "theme"
  | "sponsorship"
  | "award"
  | "event"
  | "asset";

export type HubTask = {
  id: string;
  title: string;
  details: string;
  /** When work starts (optional). */
  start_date: string | null;
  /** Deadline / due date (optional). */
  due_date: string | null;
  category: string;
  status: TaskStatus;
  owner: string;
  /** Linked record kind — empty/null when unlinked. */
  related_type: TaskRelatedType | "";
  related_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Public access requests (login → Request access). Managed under Admin → Users. */
export type AccessRequestStatus = "pending" | "approved" | "denied" | "failed";

export type AccessRequest = {
  id: string;
  full_name: string;
  email: string;
  /** member only on auto P&M path; public form otherwise always external */
  requested_role: "member" | "external";
  organisation: string;
  reason: string;
  status: AccessRequestStatus;
  decided_role?: "member" | "external" | null;
  decided_at?: string | null;
  decided_by?: string | null;
  error_message?: string;
  created_at: string;
  updated_at: string;
};

/** WordPress Quote Builder → hub webhook enquiries. */
export type WebEnquiryStatus = "new" | "in_progress" | "done";

export type EnquiryIntake = "web" | "whatsapp";

export type WebEnquiry = {
  id: string;
  submission_id: string;
  created_at: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_country: string;
  final_service_category: string;
  user_selected_service: string;
  collection_location: string;
  delivery_location: string;
  selected_office: string;
  office_email: string;
  needs_manual_review: boolean;
  marketing_emails_consent: boolean;
  routing_reason: string;
  is_test: boolean;
  status: WebEnquiryStatus;
  make_fields: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  received_at: string;
  updated_at: string;
};

/** WhatsApp → Hub MCP enquiries (own table; shown with web in one tab). */
export type WhatsAppEnquiry = {
  id: string;
  external_id: string;
  created_at: string | null;
  /** Spreadsheet: Date Sent to Office */
  sent_to_office_at: string | null;
  /** Spreadsheet: Follow-up / Chase Date */
  follow_up_at: string | null;
  customer_name: string;
  company: string;
  customer_email: string;
  customer_phone: string;
  customer_country: string;
  category: string;
  /** Spreadsheet: Enquiry Type */
  service: string;
  vessel_cargo: string;
  collection_location: string;
  delivery_location: string;
  dimensions: string;
  declared_value: string;
  preferred_timeframe: string;
  /** Spreadsheet: Team / Office Sent To */
  selected_office: string;
  office_email: string;
  /** Spreadsheet free-text Status (Sent to office, Quoted, …) */
  tracker_status: string;
  email_subject: string;
  source: string;
  message: string;
  notes: string;
  needs_manual_review: boolean;
  is_test: boolean;
  /** Hub workflow bucket derived from tracker_status */
  status: WebEnquiryStatus;
  raw_payload: Record<string, unknown>;
  received_at: string;
  updated_at: string;
};

/** Unified list row for the Enquiries tab (web + WhatsApp). */
export type HubEnquiry = WebEnquiry & {
  channel: EnquiryIntake;
  company?: string;
  category?: string;
  vessel_cargo?: string;
  dimensions?: string;
  declared_value?: string;
  preferred_timeframe?: string;
  tracker_status?: string;
  follow_up_at?: string | null;
  sent_to_office_at?: string | null;
  email_subject?: string;
  tracker_source?: string;
};

/** Singleton page reference notes (HTML), keyed by page id. */
export type HubPageNotes = {
  social_monthly_plan?: string;
  social_monthly_tasks?: string;
};

export type BudgetGroup = "committed" | "uncommitted";

export type BudgetLineChild = {
  name: string;
  amount: number | null;
  note?: string;
};

export type BudgetLine = {
  id: string;
  name: string;
  code: string;
  group: BudgetGroup;
  planned: number;
  marketing: number | null;
  sponsorship: number | null;
  travel: number | null;
  prior_year: number | null;
  notes: string;
  sort_order: number;
  children: BudgetLineChild[];
  created_at: string;
  updated_at: string;
};

export type BudgetPaymentStatus = "paid" | "pending" | "committed";

export type BudgetPayment = {
  id: string;
  budget_line_id: string;
  paid_at: string | null;
  supplier: string;
  description: string;
  amount: number;
  status: BudgetPaymentStatus;
  invoice_url: string;
  created_by: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BudgetNote = {
  title: string;
  body: string;
};

export type BudgetExtraEvent = {
  name: string;
  when: string;
  detail: string;
  people: string;
  cap: string;
};

export type BudgetQuarterLine = {
  name: string;
  code: string;
  section?: boolean;
  marketing?: number | null;
  total?: number | null;
};

export type BudgetQuarter = {
  id: "Q1" | "Q2" | "Q3" | "Q4";
  title: string;
  lines: BudgetQuarterLine[];
};

export type BudgetMeta = {
  year: number;
  title: string;
  source: string;
  currency: "GBP";
  notes: BudgetNote[];
  extra_events: BudgetExtraEvent[];
  quarters: BudgetQuarter[];
};

/** Field Manager overrides (labels, types, select/tags option order). */
export type HubStoredFieldDef = {
  key: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[];
  custom?: boolean;
};

export type HubFieldExtras = Partial<Record<string, HubStoredFieldDef[]>>;

/** Public newsroom content / SEO / branding settings (admin-managed). */
export type NewsroomSettings = {
  /** Display title — e.g. "Peters & May News" (max 150). */
  title: string;
  /** Interface language for the newsroom. */
  language: "en" | "pl";
  /** Homepage welcome / greetings blurb. */
  homepage_greetings: string;
  /** Longer about / description (optional). */
  description: string;
  /** SEO title for search engines. */
  seo_title: string;
  /** Comma-separated SEO keywords. */
  seo_keywords: string;
  /** Meta description (aim ≤150 chars). */
  seo_description: string;
  /** Theme accent hex (defaults to brand P&M Blue). */
  theme_color: string;
  /** Logo URL for public newsroom header. */
  logo_url: string;
  /** Hero / background image URL. */
  background_url: string;
  updated_at: string;
};

export type HubStore = {
  events: EventItem[];
  /** Per-user RSVP rows for Events. */
  event_attendance: EventAttendance[];
  content: ContentItem[];
  sponsorships: Sponsorship[];
  contacts: Contact[];
  resources: ResourceLink[];
  reports: ReportLink[];
  paid_campaigns: PaidCampaign[];
  advertisements: Advertisement[];
  platform_credentials: PlatformCredential[];
  themes: QuarterlyTheme[];
  theme_mains: ThemeMainContent[];
  theme_offshoots: ThemeOffshoot[];
  merch_orders: MerchOrder[];
  merch_inventory: MerchInventoryItem[];
  /** Preview images for fixed clothing catalogue products. */
  merch_catalogue: MerchCatalogueImage[];
  staff_requests: StaffRequest[];
  awards: AwardEntry[];
  tasks: HubTask[];
  /** Access directory — managed under Admin → Users, not data tables. */
  hub_users: HubUser[];
  /** Login access requests — managed under Admin → Users. */
  access_requests: AccessRequest[];
  /** Shared page reference notes (not a spreadsheet collection). */
  page_notes: HubPageNotes;
  /**
   * Field Manager schema extras — durable with the rest of hub_store so
   * option order / custom fields reach page views across deploys.
   */
  field_extras: HubFieldExtras;
  /** Restricted 2026 marketing budget lines. */
  budget_lines: BudgetLine[];
  /** Spend records against budget lines. */
  budget_payments: BudgetPayment[];
  /** Notes, quarters, and source metadata for the budget page. */
  budget_meta: BudgetMeta;
  /** PR media lists (journalist targeting). */
  media_lists: MediaList[];
  /** PR pitch drafts (Outlook export). */
  pr_pitches: PrPitch[];
  /** Coverage / clippings. */
  pr_coverage: PrCoverage[];
  /** Media monitoring queries. */
  pr_monitor_queries: PrMonitorQuery[];
  /** Monitoring inbox mentions. */
  pr_monitor_mentions: PrMonitorMention[];
  /** Public newsroom configuration. */
  newsroom_settings: NewsroomSettings;
};
