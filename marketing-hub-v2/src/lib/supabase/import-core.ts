import { uid } from "@/lib/utils";
import type {
  AwardEntry,
  AwardStatus,
  Contact,
  ContentItem,
  ContentStatus,
  EventItem,
  HubTask,
  QuarterlyTheme,
  ResourceLink,
  Sponsorship,
  SponsorshipStatus,
  TaskStatus,
  ThemeStatus,
} from "@/lib/types";
import {
  asIsoDate,
  asString,
  createServiceClient,
  findAwardsTable,
  findContactsTable,
  findEventsTable,
  findMediaTable,
  findMembershipsTable,
  findSocialPostsTable,
  findSponsorshipsTable,
  findTasksTable,
  findThemesTable,
  listCoreTables,
  pickField,
} from "@/lib/supabase/core-data";
import { updateStore } from "@/lib/store/local";
import {
  cleanContentFields,
  cleanEventFields,
  dedupeContentItems,
  dedupeEventItems,
  isEventPlaceholderContent,
  parseChannels,
  stripHtml,
} from "@/lib/data/normalize";

function mapStatus(raw: string): ContentStatus {
  const s = raw.toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("publish")) return "published";
  if (s.includes("schedul")) return "scheduled";
  if (s.includes("approv") || s.includes("review")) return "review";
  if (s.includes("draft")) return "draft";
  return "idea";
}

function mapSponsorshipStatus(raw: string): SponsorshipStatus {
  const s = raw.toLowerCase();
  if (s.includes("complete") || s.includes("done") || s.includes("past")) {
    return "complete";
  }
  if (s.includes("declin") || s.includes("reject") || s.includes("cancel")) {
    return "declined";
  }
  if (s.includes("negotiat") || s.includes("promote") || s.includes("pitch")) {
    return "negotiating";
  }
  if (s.includes("confirm")) return "confirmed";
  if (
    s.includes("active") ||
    s === "sponsorship" ||
    s.includes("current") ||
    s.includes("live")
  ) {
    return "active";
  }
  if (s.includes("future") || s.includes("prospect") || s.includes("pipeline")) {
    return "prospect";
  }
  return "prospect";
}

export type ImportResult = {
  events: number;
  content: number;
  sponsorships: number;
  contacts: number;
  awards: number;
  themes: number;
  resources: number;
  memberships: number;
  tasks: number;
  eventsTable: string | null;
  socialPostsTable: string | null;
  sponsorshipsTable: string | null;
  contactsTable: string | null;
  awardsTable: string | null;
  themesTable: string | null;
  mediaTable: string | null;
  membershipsTable: string | null;
  tasksTable: string | null;
  legacyContentIgnored: boolean;
  /** Hub-only tables left alone (merch, staff requests, reports). */
  localOnlyPreserved: string[];
  warnings: string[];
};

export async function importFromCoreData(): Promise<ImportResult> {
  const tables = await listCoreTables();
  const eventsTable = findEventsTable(tables);
  const socialTable = findSocialPostsTable(tables);
  const sponsorshipsTable = findSponsorshipsTable(tables);
  const contactsTable = findContactsTable(tables);
  const awardsTable = findAwardsTable(tables);
  const themesTable = findThemesTable(tables);
  const mediaTable = findMediaTable(tables);
  const membershipsTable = findMembershipsTable(tables);
  const tasksTable = findTasksTable(tables);
  const warnings: string[] = [];

  if (!eventsTable) {
    warnings.push("No dedicated Events table found in public.tables");
  }
  if (!socialTable) {
    warnings.push("No Social Posts table found — Content planner will stay on local demo data");
  }
  if (!sponsorshipsTable) {
    warnings.push("No Sponsorships table found — Sponsorships will stay on local demo data");
  }
  if (!contactsTable) {
    warnings.push("No Contact table found — Contacts will stay on local demo data");
  }
  if (!awardsTable) {
    warnings.push("No Awards table found — Awards will stay on local data");
  }
  if (!themesTable) {
    warnings.push("No Quarterly Themes table found — Themes will stay on local data");
  }
  if (!mediaTable) {
    warnings.push("No Media Links table found — Library resources will stay on local data");
  }
  if (!membershipsTable) {
    warnings.push("No Memberships table found");
  }
  if (!tasksTable) {
    warnings.push("No Tasks table found — Tasks will stay on local data");
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  let mappedEvents: EventItem[] = [];
  if (eventsTable) {
    const { data, error } = await supabase
      .from(eventsTable.supabase_table)
      .select("*")
      .limit(500);
    if (error) {
      warnings.push(`Events read failed: ${error.message}`);
    } else {
      mappedEvents = (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const id = asString(r.id) || uid("evt");
        const title =
          asString(
            pickField(r, [
              /^event_?name$/i,
              /^content_?name$/i,
              /^name$/i,
              /^title$/i,
              /^event$/i,
            ])
          ) || "Untitled event";
        const starts = asIsoDate(
          pickField(r, [
            /^start_?date$/i,
            /^start/i,
            /^starts_?at$/i,
            /^date_?from$/i,
            /^date$/i,
            /^event_?date$/i,
          ])
        );
        const ends = asIsoDate(
          pickField(r, [
            /^end_?date$/i,
            /^end/i,
            /^ends_?at$/i,
            /^date_?to$/i,
            /^date_?end$/i,
          ])
        );
        const city = asString(pickField(r, [/^city$/i]));
        const venue = asString(pickField(r, [/^venue$/i]));
        const country = asString(pickField(r, [/^country$/i]));
        const location =
          asString(pickField(r, [/^location$/i, /^place$/i])) ||
          [venue, city, country].filter(Boolean).join(", ");
        const cleaned = cleanEventFields({
          title,
          event_type:
            asString(
              pickField(r, [
                /^event_?type$/i,
                /^type$/i,
                /^category$/i,
              ])
            ) || "Event",
          notes: asString(
            pickField(r, [
              /^notes_?detail$/i,
              /^notes$/i,
              /^description$/i,
              /^details$/i,
            ])
          ),
          location,
          link_url: asString(
            pickField(r, [/^link/i, /^url$/i, /^website$/i])
          ),
        });
        const divisionRaw = asString(
          pickField(r, [/^division$/i, /^primary_?division$/i])
        );
        // primary_division can be a JSON array string like ["Commercial"]
        let division = divisionRaw;
        if (division.startsWith("[")) {
          try {
            const parsed = JSON.parse(division) as unknown;
            if (Array.isArray(parsed)) {
              division = parsed.map(String).join(", ");
            }
          } catch {
            /* keep raw */
          }
        }
        return {
          id: `sb_${id}`,
          title: cleaned.title,
          starts_at: starts,
          ends_at: ends,
          location: cleaned.location,
          event_type: cleaned.event_type,
          division: division.trim(),
          notes: cleaned.notes,
          link_url: cleaned.link_url,
          social_media_post_completed: false,
          personal_social_media_graphics_completed: false,
          reached_out_for_pr_to_organisers: false,
          created_by: null,
          created_at: asIsoDate(r.created_at) || now,
          updated_at: asIsoDate(r.updated_at) || now,
        };
      });
      const deduped = dedupeEventItems(mappedEvents);
      if (deduped.removed > 0) {
        warnings.push(
          `Removed ${deduped.removed} duplicate Events (same title + start date)`
        );
      }
      mappedEvents = deduped.items;
    }
  }

  let mappedContent: ContentItem[] = [];
  if (socialTable) {
    const { data, error } = await supabase
      .from(socialTable.supabase_table)
      .select("*")
      .limit(500);
    if (error) {
      warnings.push(`Social Posts read failed: ${error.message}`);
    } else {
      const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => {
        const r = row as Record<string, unknown>;
        const id = asString(r.id) || uid("cnt");
        const title =
          asString(
            pickField(r, [
              /^content_?name$/i,
              /^name$/i,
              /^title$/i,
              /^post_?title$/i,
            ])
          ) || "Untitled post";
        const statusRaw = asString(
          pickField(r, [/^status$/i, /^planable_?status$/i, /^state$/i])
        );
        const due =
          asIsoDate(
            pickField(r, [
              /^date_?due$/i,
              /^publish_?date$/i,
              /^due/i,
              /^scheduled/i,
              /^date$/i,
              /^publish/i,
            ])
          )?.slice(0, 10) ?? null;
        const deadline =
          asIsoDate(pickField(r, [/^date_?due$/i, /^deadline$/i]))?.slice(
            0,
            10
          ) ?? null;
        const publishDate =
          asIsoDate(
            pickField(r, [
              /^publish_?date$/i,
              /^date$/i,
              /^scheduled/i,
              /^publish/i,
            ])
          )?.slice(0, 10) ?? null;

        const rawNotes = asString(
          pickField(r, [/^notes_?detail$/i, /^notes$/i, /^body$/i])
        );
        const rawCaption = asString(
          pickField(r, [
            /^content_?post_?text$/i,
            /^caption$/i,
            /^post_?text$/i,
            /^text$/i,
          ])
        );
        const rawPostType =
          asString(
            pickField(r, [/^post_?type$/i, /^content_?type$/i, /^type$/i])
          ) || "Social";
        const rawChannelField = pickField(r, [
          /^channels?$/i,
          /^platform$/i,
          /^network$/i,
        ]);
        const rawChannel =
          parseChannels(rawChannelField).length > 0
            ? parseChannels(rawChannelField)
            : [rawPostType];
        const category = asString(
          pickField(r, [/^category$/i, /^hub_?category$/i])
        );
        const cleaned = cleanContentFields({
          title,
          channel: rawChannel,
          content_type: rawPostType,
          owner: asString(
            pickField(r, [/^owner$/i, /^assignee$/i, /^author$/i])
          ),
          notes: rawNotes,
          caption: rawCaption,
          category,
          priority: asString(pickField(r, [/^priority$/i])),
          website: asString(
            pickField(r, [/^website$/i, /^publication_?url$/i])
          ),
          asset_url: asString(
            pickField(r, [
              /^canva_?url$/i,
              /^content_?folder_?canva$/i,
              /^asset/i,
              /^image/i,
              /^media/i,
            ])
          ),
          planable_url: asString(
            pickField(r, [/^planable_?url$/i, /^planable/i])
          ),
        });

        return {
          item: {
            id: `sb_${id}`,
            title: cleaned.title,
            channel: cleaned.channel,
            content_type: cleaned.content_type,
            owner: cleaned.owner,
            due_date: publishDate || due,
            deadline_date:
              deadline && deadline !== (publishDate || due) ? deadline : null,
            status: mapStatus(statusRaw),
            category: cleaned.category,
            priority: cleaned.priority,
            website: cleaned.website,
            caption: cleaned.caption,
            theme_id: null,
            planable_url: cleaned.planable_url,
            planable_post_id: asString(
              pickField(r, [/^planable_?post_?id$/i])
            ),
            planable_group_id: asString(
              pickField(r, [/^planable_?group_?id$/i])
            ),
            planable_page_ids: [],
            last_synced_at: null,
            sync_source: "",
            asset_url: cleaned.asset_url,
            notes: cleaned.notes,
            created_at: asIsoDate(r.created_at) || now,
            updated_at: asIsoDate(r.updated_at) || now,
          } satisfies ContentItem,
          category,
        };
      });

      const eventTitles = new Set(
        mappedEvents.map((e) => e.title.trim().toLowerCase())
      );
      const kept = rows.filter(
        (row) =>
          !isEventPlaceholderContent(
            {
              title: row.item.title,
              channel: row.item.channel,
              category: row.category,
              due_date: row.item.due_date,
            },
            eventTitles
          )
      );
      const removedEvents = rows.length - kept.length;
      if (removedEvents > 0) {
        warnings.push(
          `Removed ${removedEvents} Social Posts that look like Events (use the Events table instead)`
        );
      }
      mappedContent = kept.map((row) => row.item);
      const deduped = dedupeContentItems(mappedContent);
      if (deduped.removed > 0) {
        warnings.push(
          `Removed ${deduped.removed} duplicate Social Posts (same title)`
        );
      }
      mappedContent = deduped.items;
    }
  }

  let mappedSponsorships: Sponsorship[] = [];
  if (sponsorshipsTable) {
    const { data, error } = await supabase
      .from(sponsorshipsTable.supabase_table)
      .select("*")
      .limit(500);
    if (error) {
      warnings.push(`Sponsorships read failed: ${error.message}`);
    } else {
      const rows = ((data ?? []) as Record<string, unknown>[]).filter(
        (r) => r.deleted_at == null
      );
      mappedSponsorships = mapSponsorshipRows(rows, now);
    }
  }

  let mappedContacts: Contact[] = [];
  if (contactsTable) {
    const { data, error } = await supabase
      .from(contactsTable.supabase_table)
      .select("*")
      .limit(2000);
    if (error) {
      warnings.push(`Contacts read failed: ${error.message}`);
    } else {
      const rows = ((data ?? []) as Record<string, unknown>[]).filter(
        (r) => r.deleted_at == null
      );
      mappedContacts = mapContactRows(rows, now);
      if (mappedContacts.length === 0 && rows.length > 0) {
        warnings.push("Contact rows found but none mapped (check name fields)");
      }
    }
  }

  const contactNameById = new Map<string, string>();
  for (const c of mappedContacts) {
    const rawId = c.id.startsWith("sb_") ? c.id.slice(3) : c.id;
    contactNameById.set(rawId, c.name);
    contactNameById.set(c.id, c.name);
  }

  let mappedMemberships: Sponsorship[] = [];
  if (membershipsTable) {
    const { data, error } = await supabase
      .from(membershipsTable.supabase_table)
      .select("*")
      .limit(500);
    if (error) {
      warnings.push(`Memberships read failed: ${error.message}`);
    } else {
      const rows = ((data ?? []) as Record<string, unknown>[]).filter(
        (r) => r.deleted_at == null
      );
      mappedMemberships = mapMembershipRows(rows, now, contactNameById);
    }
  }

  let mappedAwards: AwardEntry[] = [];
  if (awardsTable) {
    const { data, error } = await supabase
      .from(awardsTable.supabase_table)
      .select("*")
      .limit(500);
    if (error) {
      warnings.push(`Awards read failed: ${error.message}`);
    } else {
      const rows = ((data ?? []) as Record<string, unknown>[]).filter(
        (r) => r.deleted_at == null
      );
      mappedAwards = mapAwardRows(rows, now);
    }
  }

  let mappedThemes: QuarterlyTheme[] = [];
  if (themesTable) {
    const { data, error } = await supabase
      .from(themesTable.supabase_table)
      .select("*")
      .limit(200);
    if (error) {
      warnings.push(`Themes read failed: ${error.message}`);
    } else {
      const rows = ((data ?? []) as Record<string, unknown>[]).filter(
        (r) => r.deleted_at == null
      );
      mappedThemes = mapThemeRows(rows, now);
    }
  }

  let mappedResources: ResourceLink[] = [];
  if (mediaTable) {
    const { data, error } = await supabase
      .from(mediaTable.supabase_table)
      .select("*")
      .limit(1000);
    if (error) {
      warnings.push(`Media Links read failed: ${error.message}`);
    } else {
      const rows = ((data ?? []) as Record<string, unknown>[]).filter(
        (r) => r.deleted_at == null
      );
      mappedResources = mapMediaResourceRows(rows, now);
    }
  }

  let mappedTasks: HubTask[] = [];
  if (tasksTable) {
    const { data, error } = await supabase
      .from(tasksTable.supabase_table)
      .select("*")
      .limit(1000);
    if (error) {
      warnings.push(`Tasks read failed: ${error.message}`);
    } else {
      const rows = ((data ?? []) as Record<string, unknown>[]).filter(
        (r) => r.deleted_at == null
      );
      mappedTasks = mapTaskRows(rows, now, contactNameById);
    }
  }

  const partners = [...mappedSponsorships, ...mappedMemberships];

  await updateStore((store) => {
    if (mappedEvents.length) {
      store.events = mappedEvents;
    }
    if (mappedContent.length) {
      store.content = mappedContent;
    }
    if (partners.length) {
      store.sponsorships = partners;
    }
    if (mappedContacts.length) {
      store.contacts = mappedContacts;
    }
    if (mappedAwards.length) {
      store.awards = mappedAwards;
    }
    if (mappedThemes.length) {
      store.themes = mappedThemes;
      store.theme_mains = [];
      store.theme_offshoots = [];
    }
    if (mappedResources.length) {
      store.resources = mappedResources;
    }
    if (mappedTasks.length) {
      store.tasks = mappedTasks;
    }
    // merch_orders, merch_inventory, staff_requests, reports stay local
  });

  return {
    events: mappedEvents.length,
    content: mappedContent.length,
    sponsorships: mappedSponsorships.length,
    contacts: mappedContacts.length,
    awards: mappedAwards.length,
    themes: mappedThemes.length,
    resources: mappedResources.length,
    memberships: mappedMemberships.length,
    tasks: mappedTasks.length,
    eventsTable: eventsTable?.name ?? null,
    socialPostsTable: socialTable?.name ?? null,
    sponsorshipsTable: sponsorshipsTable?.name ?? null,
    contactsTable: contactsTable?.name ?? null,
    awardsTable: awardsTable?.name ?? null,
    themesTable: themesTable?.name ?? null,
    mediaTable: mediaTable?.name ?? null,
    membershipsTable: membershipsTable?.name ?? null,
    tasksTable: tasksTable?.name ?? null,
    legacyContentIgnored: true,
    localOnlyPreserved: ["merch_orders", "merch_inventory", "merch_catalogue", "staff_requests", "reports", "paid_campaigns", "advertisements", "platform_credentials"],
    warnings,
  };
}

function mapContactRows(
  rows: Record<string, unknown>[],
  now: string
): Contact[] {
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const id = asString(r.id) || uid("ctc");
    const first = asString(pickField(r, [/^first_?name$/i]));
    const last = asString(pickField(r, [/^last_?name$/i]));
    const combined = [first, last].filter(Boolean).join(" ").trim();
    const name =
      asString(
        pickField(r, [/^name$/i, /^full_?name$/i, /^contact_?name$/i])
      ).trim() ||
      combined ||
      "Unnamed contact";

    const organisation = asString(
      pickField(r, [
        /^organisation$/i,
        /^organization$/i,
        /^company$/i,
        /^publication$/i,
        /^outlet$/i,
      ])
    );

    const role = asString(
      pickField(r, [/^job_?title$/i, /^role$/i, /^title$/i, /^position$/i])
    );

    const phone =
      asString(pickField(r, [/^phone$/i, /^tel$/i, /^telephone$/i])) ||
      asString(pickField(r, [/^mobile$/i, /^cell$/i]));

    const typeTag = asString(pickField(r, [/^type$/i, /^contact_?type$/i]));
    const statusTag = asString(pickField(r, [/^status$/i]));
    const pressField = asString(
      pickField(r, [/^press_?field$/i, /^beat$/i, /^category$/i])
    );
    const team = asString(pickField(r, [/^team$/i]));
    const tags = [typeTag, statusTag, pressField, team]
      .map((t) => t.trim())
      .filter(Boolean);
    const outlet = asString(
      pickField(r, [/^outlet$/i, /^publication$/i, /^media$/i])
    );
    const isPress =
      tags.some((t) => /^press$/i.test(t)) ||
      Boolean(pressField) ||
      Boolean(outlet);

    return {
      id: `sb_${id}`,
      kind: "person",
      name,
      organisation,
      role,
      email: asString(pickField(r, [/^email$/i, /^e-?mail$/i])),
      phone,
      website: asString(pickField(r, [/^website$/i, /^url$/i, /^web$/i])),
      services: "",
      tags,
      notes: stripHtml(
        asString(
          pickField(r, [
            /^notes$/i,
            /^description$/i,
            /^details$/i,
            /^responsible_?for$/i,
          ])
        )
      ),
      user_id: null,
      is_press: isPress,
      beat: pressField,
      outlet: outlet || organisation,
      country: asString(pickField(r, [/^country$/i, /^market$/i, /^region$/i])),
      preferred_topics: asString(
        pickField(r, [/^preferred_?topics$/i, /^topics$/i])
      ),
      last_contacted_at: null,
      marketing_consent: null,
      created_at: asIsoDate(r.created_at) || now,
      updated_at: asIsoDate(r.updated_at) || now,
    };
  });
}

function mapSponsorshipRows(
  rows: Record<string, unknown>[],
  now: string
): Sponsorship[] {
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const id = asString(r.id) || uid("spn");
    const partner =
      asString(
        pickField(r, [
          /^name$/i,
          /^partner$/i,
          /^organisation$/i,
          /^organization$/i,
          /^sponsor$/i,
        ])
      ) || "Untitled partner";
    const packageName = asString(
      pickField(r, [
        /^sponsorship_?title$/i,
        /^package/i,
        /^title$/i,
        /^deal/i,
      ])
    );
    const statusRaw = asString(pickField(r, [/^status$/i, /^stage$/i]));
    const perks = asString(pickField(r, [/^perks$/i, /^deliverables$/i]));
    const resources = asString(
      pickField(r, [/^marketing_?resources$/i, /^content_?calendar$/i])
    );
    const docs = asString(
      pickField(r, [
        /^documents_?drive$/i,
        /^document_from_documents$/i,
        /^documents$/i,
        /^onedrive/i,
      ])
    );
    const website = asString(pickField(r, [/^website$/i, /^url$/i, /^link$/i]));

    return {
      id: `sb_${id}`,
      kind: "sponsorship",
      membership_type: "membership",
      partner,
      package_name: packageName,
      starts_at:
        asIsoDate(
          pickField(r, [
            /^start/i,
            /^starts_?at$/i,
            /^from$/i,
            /^date_?from$/i,
          ])
        )?.slice(0, 10) ?? null,
      ends_at:
        asIsoDate(
          pickField(r, [/^end/i, /^ends_?at$/i, /^to$/i, /^date_?to$/i])
        )?.slice(0, 10) ?? null,
      value: asString(pickField(r, [/^value$/i, /^amount$/i, /^cost$/i, /^fee$/i])),
      status: mapSponsorshipStatus(statusRaw),
      deliverables: perks || resources,
      owner: asString(
        pickField(r, [/^assignee$/i, /^owner$/i, /^manager$/i])
      ),
      onedrive_url: docs || website,
      notes: stripHtml(
        asString(pickField(r, [/^notes$/i, /^description$/i, /^details$/i]))
      ),
      created_by: "",
      created_by_user_id: null,
      created_at: asIsoDate(r.created_at) || now,
      updated_at: asIsoDate(r.updated_at) || now,
    };
  });
}

function asJoined(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) => asString(v).trim())
      .filter(Boolean)
      .join(", ");
  }
  return asString(value);
}

function mapAwardStatus(raw: string): AwardStatus {
  const s = raw.toLowerCase();
  if (s.includes("won") || s.includes("winner")) return "won";
  if (s.includes("shortlist")) return "shortlisted";
  if (s.includes("submit") || s.includes("entered") || s.includes("entry")) {
    return "submitted";
  }
  if (s.includes("enter") || s.includes("nominat")) return "entering";
  if (
    s.includes("not") ||
    s.includes("lost") ||
    s.includes("declin") ||
    s.includes("closed")
  ) {
    return "not_won";
  }
  if (s.includes("open") || s.includes("watch") || s.includes("consider")) {
    return "watching";
  }
  return "watching";
}

function mapAwardRows(rows: Record<string, unknown>[], now: string): AwardEntry[] {
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const id = asString(r.id) || uid("awd");
    const deadline = asIsoDate(
      pickField(r, [/^deadline$/i, /^ceremony/i, /^date$/i])
    );
    const yearRaw = asString(pickField(r, [/^year$/i]));
    const year =
      Number.parseInt(yearRaw, 10) ||
      (deadline ? new Date(deadline).getFullYear() : new Date().getFullYear());
    const category = asJoined(
      pickField(r, [
        /^suggested_?categories$/i,
        /^categor(y|ies)$/i,
        /^award_?focus$/i,
      ])
    );
    const priority = asString(pickField(r, [/^priority$/i]));
    const extras = [
      asString(pickField(r, [/^award_?focus$/i])),
      priority ? `Priority: ${priority}` : "",
      asString(pickField(r, [/^region_?location$/i])),
    ]
      .map((s) => s.trim())
      .filter(Boolean);

    const notesCore = stripHtml(
      asString(pickField(r, [/^notes$/i, /^description$/i]))
    );

    return {
      id: `sb_${id}`,
      title:
        asString(
          pickField(r, [/^award_?name$/i, /^name$/i, /^title$/i])
        ) || "Untitled award",
      organisation: asString(
        pickField(r, [
          /^organiser$/i,
          /^organizer$/i,
          /^organisation$/i,
          /^organization$/i,
        ])
      ),
      category,
      year: Number.isFinite(year) ? year : new Date().getFullYear(),
      status: mapAwardStatus(asString(pickField(r, [/^status$/i]))),
      ceremony_at: deadline?.slice(0, 10) ?? null,
      owner: asString(
        pickField(r, [/^internal_?owner$/i, /^owner$/i, /^assignee$/i])
      ),
      event_id: null,
      notes: [notesCore, ...extras].filter(Boolean).join("\n"),
      created_at: asIsoDate(r.created_at) || now,
      updated_at: asIsoDate(r.updated_at) || now,
    };
  });
}

function mapThemeStatus(raw: string): ThemeStatus {
  const s = raw.toLowerCase();
  if (s.includes("active") || s.includes("current") || s.includes("live")) {
    return "active";
  }
  if (
    s.includes("complete") ||
    s.includes("done") ||
    s.includes("previous") ||
    s.includes("past")
  ) {
    return "previous";
  }
  return "upcoming";
}

function mapQuarter(raw: string): QuarterlyTheme["quarter"] {
  const s = raw.toUpperCase().replace(/\s+/g, "");
  if (s.includes("Q1") || s === "1") return "Q1";
  if (s.includes("Q2") || s === "2") return "Q2";
  if (s.includes("Q3") || s === "3") return "Q3";
  if (s.includes("Q4") || s === "4") return "Q4";
  return "Q1";
}

function mapThemeRows(
  rows: Record<string, unknown>[],
  now: string
): QuarterlyTheme[] {
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const id = asString(r.id) || uid("thm");
    const yearRaw = asString(pickField(r, [/^year$/i]));
    const year = Number.parseInt(yearRaw, 10) || new Date().getFullYear();
    const summary =
      stripHtml(
        asString(
          pickField(r, [
            /^marketing_?objective$/i,
            /^key_?business_?focus$/i,
            /^summary$/i,
            /^notes$/i,
          ])
        )
      ) || stripHtml(asString(pickField(r, [/^content_?pillars$/i])));

    return {
      id: `sb_${id}`,
      title:
        asString(
          pickField(r, [/^theme$/i, /^core_?theme$/i, /^title$/i, /^name$/i])
        ) || "Untitled theme",
      quarter: mapQuarter(asString(pickField(r, [/^quarter$/i]))),
      year: Number.isFinite(year) ? year : new Date().getFullYear(),
      status: mapThemeStatus(asString(pickField(r, [/^status$/i]))),
      summary,
      created_at: asIsoDate(r.created_at) || now,
      updated_at: asIsoDate(r.updated_at) || now,
    };
  });
}

function firstMediaUrl(raw: unknown): string {
  if (!raw) return "";
  const list = Array.isArray(raw) ? raw : [raw];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const url = asString(
      (entry as Record<string, unknown>).url ??
        (entry as Record<string, unknown>).href ??
        (entry as Record<string, unknown>).src
    );
    if (url) return url;
  }
  return "";
}

function mapMediaResourceRows(
  rows: Record<string, unknown>[],
  now: string
): ResourceLink[] {
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const id = asString(r.id) || uid("res");
    const documentLink = asString(
      pickField(r, [/^document_?link$/i, /^link$/i, /^url$/i])
    );
    const documentField = asString(pickField(r, [/^document$/i]));
    const fromDoc = /^https?:\/\//i.test(documentField.trim())
      ? documentField.trim()
      : (documentField.match(/\((https?:\/\/[^)]+)\)/i)?.[1] ?? "");
    const fromMedia = firstMediaUrl(
      pickField(r, [/^media$/i, /^attachments?/i, /^files?/i])
    );
    const url = documentLink || fromDoc || fromMedia;

    return {
      id: `sb_${id}`,
      title:
        asString(pickField(r, [/^name$/i, /^title$/i, /^asset$/i])) ||
        "Untitled resource",
      description: stripHtml(
        asString(pickField(r, [/^notes$/i, /^description$/i]))
      ),
      url,
      category:
        asString(
          pickField(r, [/^hub_?category$/i, /^category$/i, /^folder$/i])
        ) || "General",
      created_at: asIsoDate(r.created_at) || now,
      updated_at: asIsoDate(r.updated_at) || now,
    };
  });
}

function mapMembershipRows(
  rows: Record<string, unknown>[],
  now: string,
  contactNameById: Map<string, string>
): Sponsorship[] {
  const out: Sponsorship[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const id = asString(r.id) || uid("mem");
    const name = asString(pickField(r, [/^name$/i, /^title$/i, /^package/i]));
    const memberId = asString(pickField(r, [/^member$/i, /^contact$/i]));
    const partner =
      contactNameById.get(memberId) ||
      asString(
        pickField(r, [/^organisation$/i, /^organization$/i, /^partner$/i])
      ) ||
      name;
    if (!partner && !name) continue;

    const region = asString(pickField(r, [/^region$/i, /^location$/i]));
    const price = asString(
      pickField(r, [/^price$/i, /^value$/i, /^fee$/i, /^cost$/i])
    );

    out.push({
      id: `sb_mem_${id}`,
      kind: "membership",
      membership_type: "membership",
      partner: partner || name || "Membership",
      package_name: name,
      starts_at: null,
      ends_at: null,
      value: price,
      status: "active",
      deliverables: "",
      owner: "",
      onedrive_url: "",
      notes: region ? `Region: ${region}` : "",
      created_by: "",
      created_by_user_id: null,
      created_at: asIsoDate(r.created_at) || now,
      updated_at: asIsoDate(r.updated_at) || now,
    });
  }
  return out;
}

function mapTaskStatus(raw: string): TaskStatus {
  const s = raw.toLowerCase();
  if (
    s.includes("done") ||
    s.includes("complete") ||
    s.includes("closed") ||
    s.includes("finished")
  ) {
    return "done";
  }
  if (
    s.includes("doing") ||
    s.includes("progress") ||
    s.includes("active") ||
    s.includes("working")
  ) {
    return "doing";
  }
  return "todo";
}

function mapTaskRows(
  rows: Record<string, unknown>[],
  now: string,
  contactNameById: Map<string, string>
): HubTask[] {
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const id = asString(r.id) || uid("tsk");
    const ownerId = asString(
      pickField(r, [/^owner$/i, /^assignee$/i, /^assigned/i])
    );
    const owner =
      contactNameById.get(ownerId) ||
      (ownerId && !/^[0-9a-f-]{36}$/i.test(ownerId) ? ownerId : "");

    return {
      id: `sb_${id}`,
      title:
        asString(pickField(r, [/^title$/i, /^name$/i, /^task$/i])) ||
        "Untitled task",
      details: stripHtml(
        asString(
          pickField(r, [/^description$/i, /^details$/i, /^notes$/i, /^body$/i])
        )
      ),
      start_date:
        asIsoDate(
          pickField(r, [/^start_?date$/i, /^from$/i, /^starts?$/i])
        )?.slice(0, 10) ?? null,
      due_date:
        asIsoDate(
          pickField(r, [/^due_?date$/i, /^deadline$/i, /^due$/i])
        )?.slice(0, 10) ?? null,
      category: asString(
        pickField(r, [/^category$/i, /^type$/i, /^area$/i])
      ),
      status: mapTaskStatus(asString(pickField(r, [/^status$/i, /^state$/i]))),
      owner,
      related_type: "",
      related_id: null,
      created_at: asIsoDate(r.created_at) || now,
      updated_at: asIsoDate(r.updated_at) || now,
    };
  });
}
