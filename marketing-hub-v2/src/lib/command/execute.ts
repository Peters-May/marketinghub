import type { SessionUser } from "@/lib/auth/session";
import {
  mergeAttendanceLabel,
  proposedAttendanceId,
  splitProposedAttendance,
} from "@/lib/command/attendance";
import { describeMatches, matchByTitle } from "@/lib/command/match";
import type { HubCommand } from "@/lib/command/parse";
import { normalizeChannels } from "@/lib/data/normalize";
import {
  createContent,
  createEmailCampaign,
  createEvent,
  createPaidCampaign,
  createTask,
  listContacts,
  linkEventContent,
  listContent,
  listEventContentLinks,
  listEvents,
  listTasks,
  updateContent,
  updateEvent,
  updateTask,
  upsertEventAttendanceMany,
  markEventsWeAreAttending,
  withContentPlanableDefaults,
} from "@/lib/data/repos";
import {
  emptyAttendanceOpsFields,
  stripAttendanceOpsFields,
} from "@/lib/events/attendance-checklist";
import { costsSheetPath, formatCostAmount } from "@/lib/events/costs";
import { saveEventCostLine } from "@/lib/events/costs-data";
import { loadOwnerDirectory, matchOwnerUserId } from "@/lib/identity/owners";
import type { OwnerDirectoryEntry } from "@/lib/identity/owner-match";
import {
  pushContentToPlanable,
  shouldPushSocialToPlanable,
} from "@/lib/planable/sync";
import type { Contact, ContentItem, ContentStatus } from "@/lib/types";
import { createPortalCountryMarketingList } from "@/lib/sync/portal-marketing";
import {
  createMediaInSupabase,
  listMediaFromSupabase,
} from "@/lib/supabase/media-list";

export type ExecuteResult =
  | {
      ok: true;
      message: string;
      href: string;
      area: HubCommand["area"];
      areas?: HubCommand["area"][];
    }
  | { ok: false; message: string };

const ADMIN_MESSAGE =
  "Tasks, posts, and library presentations can be changed with an admin account. Events can be added or updated from this box.";

function needsAdmin(kind: HubCommand["kind"]) {
  return (
    kind === "create_task" ||
    kind === "update_task" ||
    kind === "create_content" ||
    kind === "update_content" ||
    kind === "link_content" ||
    kind === "mark_events_we_are_attending" ||
    kind === "create_marketing_list" ||
    kind === "create_presentation" ||
    kind === "create_event_cost" ||
    kind === "create_paid_campaign" ||
    kind === "create_email_campaign"
  );
}

function samePresentationLink(left: string, right: string) {
  const normalize = (value: string) =>
    value.trim().replace(/\/+$/g, "").toLowerCase();
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const designId = (value: string) =>
    value.match(/\/design\/([a-z0-9]+)/i)?.[1]?.toLowerCase() ?? "";
  const aId = designId(a);
  const bId = designId(b);
  return Boolean(aId && bId && aId === bId);
}

type ResolvedAttendance = {
  pm_attendance: string;
  pm_attending: boolean;
  people: Array<{
    user_id: string;
    user_name: string;
    attendance_status: "attending" | "maybe";
  }>;
};

function linkedPerson(
  name: string,
  contacts: Contact[],
  owners: OwnerDirectoryEntry[]
): { user_id: string; user_name: string } | null {
  if (/[+]|team\b/i.test(name)) return null;
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const people = contacts.filter(
    (contact) => contact.kind !== "company" && contact.name.trim()
  );
  const exact = people.filter(
    (contact) => contact.name.trim().toLowerCase() === needle
  );
  if (exact.length > 1) return null;
  if (exact.length === 1) {
    const contact = exact[0];
    return {
      user_id: (contact.user_id ?? "").trim() || `contact:${contact.id}`,
      user_name: contact.name.trim(),
    };
  }
  const singleToken = !/\s/.test(needle);
  if (!singleToken) {
    const ownerExact = owners.filter(
      (owner) => owner.full_name.trim().toLowerCase() === needle
    );
    if (ownerExact.length !== 1) return null;
    return {
      user_id: ownerExact[0].id,
      user_name: ownerExact[0].full_name.trim() || name,
    };
  }
  const first = people.filter(
    (contact) =>
      (contact.name.trim().toLowerCase().split(/\s+/)[0] ?? "") === needle
  );
  if (first.length > 1) return null;
  if (first.length === 1) {
    const contact = first[0];
    return {
      user_id: (contact.user_id ?? "").trim() || `contact:${contact.id}`,
      user_name: contact.name.trim(),
    };
  }
  const ownerFirst = owners.filter(
    (owner) =>
      (owner.full_name.trim().toLowerCase().split(/\s+/)[0] ?? "") === needle
  );
  if (ownerFirst.length !== 1) return null;
  return {
    user_id: ownerFirst[0].id,
    user_name: ownerFirst[0].full_name.trim() || name,
  };
}

async function resolveProposedAttendance(
  raw: string
): Promise<ResolvedAttendance> {
  const split = splitProposedAttendance(raw);
  if (!split.people.length) {
    return { pm_attendance: split.label, pm_attending: false, people: [] };
  }
  const [contacts, owners] = await Promise.all([
    listContacts(),
    loadOwnerDirectory(),
  ]);
  return {
    pm_attendance: split.label,
    pm_attending: split.people.some((person) => person.status === "attending"),
    people: split.people.map((person) => {
      const linked = linkedPerson(person.name, contacts, owners);
      return {
        user_id: linked?.user_id ?? proposedAttendanceId(person.name),
        user_name: linked?.user_name ?? person.name,
        attendance_status: person.status,
      };
    }),
  };
}

function attendanceSavedNote(resolved: ResolvedAttendance): string {
  if (resolved.people.length === 1) return " with 1 proposed attendee";
  if (resolved.people.length > 1) {
    return ` with ${resolved.people.length} proposed attendees`;
  }
  if (/^tbc$/i.test(resolved.pm_attendance)) return ", attendance still TBC";
  return "";
}

function addedAttendeesNote(resolved: ResolvedAttendance): string {
  const names = resolved.people.map((person) =>
    person.attendance_status === "maybe"
      ? `${person.user_name} (maybe)`
      : person.user_name
  );
  if (names.length === 1) return ` Added ${names[0]} as attending.`;
  if (names.length === 2) {
    return ` Added ${names[0]} and ${names[1]} as attending.`;
  }
  if (names.length > 2) {
    return ` Added ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} as attending.`;
  }
  if (/^tbc$/i.test(resolved.pm_attendance)) return ", attendance still TBC";
  return "";
}

async function syncContent(item: ContentItem): Promise<{
  item: ContentItem;
  note: string;
}> {
  if (!shouldPushSocialToPlanable(item)) return { item, note: "" };
  const pushed = await pushContentToPlanable(withContentPlanableDefaults(item));
  if (pushed.error) {
    return {
      item: pushed.item,
      note: ` Planable did not update: ${pushed.error}`,
    };
  }
  return { item: pushed.item, note: "" };
}

/** Build the confirm reply when some of a multi-action batch saved and others failed. */
export function formatBatchSaveMessage(options: {
  savedCount: number;
  failedMessages: string[];
  linksOnly?: boolean;
}): string {
  const { savedCount, failedMessages, linksOnly = false } = options;
  const head = linksOnly
    ? `Linked ${savedCount} post${savedCount === 1 ? "" : "s"}.`
    : `Saved ${savedCount} record${savedCount === 1 ? "" : "s"}.`;
  if (!failedMessages.length) return head;
  const unique = [...new Set(failedMessages.map((message) => message.trim()).filter(Boolean))];
  const detail =
    unique.length === 0
      ? ""
      : unique.length === 1
        ? unique[0]
        : unique.map((message, index) => `${index + 1}. ${message}`).join(" ");
  return detail
    ? `${head} ${failedMessages.length} could not be saved: ${detail}`
    : `${head} ${failedMessages.length} could not be saved.`;
}

export async function executeHubCommands(
  commands: HubCommand[],
  user: SessionUser
): Promise<ExecuteResult> {
  if (!commands.length) return { ok: false, message: "Nothing to save." };
  if (commands.length === 1) return executeHubCommand(commands[0], user);

  const saved: string[] = [];
  const failed: string[] = [];
  const areas: HubCommand["area"][] = [];
  let href = commands[0].href;
  for (const command of commands) {
    const result = await executeHubCommand(command, user);
    if (!result.ok) {
      failed.push(result.message);
      continue;
    }
    saved.push(result.message);
    for (const area of result.areas ?? [result.area]) {
      if (!areas.includes(area)) areas.push(area);
    }
    href = result.href;
  }
  if (!saved.length) {
    return { ok: false, message: failed[0] ?? "Nothing was saved." };
  }
  const linksOnly = commands.every((command) => command.kind === "link_content");
  return {
    ok: true,
    message: formatBatchSaveMessage({
      savedCount: saved.length,
      failedMessages: failed,
      linksOnly,
    }),
    href,
    area: areas[0],
    areas,
  };
}

export async function executeHubCommand(
  command: HubCommand,
  user: SessionUser
): Promise<ExecuteResult> {
  if (needsAdmin(command.kind) && user.role !== "admin") {
    if (command.kind === "mark_events_we_are_attending") {
      return {
        ok: false,
        message: "Only an admin can check We are attending on every event.",
      };
    }
    return { ok: false, message: ADMIN_MESSAGE };
  }

  if (command.kind === "mark_events_we_are_attending") {
    const titles = await markEventsWeAreAttending();
    const message =
      titles.length === 0
        ? "We are attending was already checked on every event that has someone attending."
        : `Checked We are attending on ${titles.length} event${titles.length === 1 ? "" : "s"}.`;
    return {
      ok: true,
      message,
      href: command.href,
      area: command.area,
    };
  }

  if (command.kind === "create_event_cost") {
    const found = matchByTitle(await listEvents(), command.event_query);
    if (found.kind === "none") {
      return { ok: false, message: `No event matches “${command.event_query}”.` };
    }
    if (found.kind === "many") {
      return {
        ok: false,
        message: `Several events match “${command.event_query}”: ${describeMatches(found.items)}. Use the full title.`,
      };
    }
    const owners = await loadOwnerDirectory();
    const staffUserId = matchOwnerUserId(command.staff_name, owners);
    const staffName =
      (staffUserId
        ? owners.find((person) => person.id === staffUserId)?.full_name
        : null) || command.staff_name;
    const line = await saveEventCostLine({
      event_id: found.item.id,
      category: command.category,
      description: command.description,
      amount: command.amount,
      currency: command.currency,
      staff_user_id: staffUserId,
      staff_name: staffName,
      notes: command.notes,
    });
    if (!line) return { ok: false, message: "That cost line could not be saved." };
    const amountLabel =
      line.amount == null
        ? "a blank amount"
        : formatCostAmount(line.amount, line.currency);
    return {
      ok: true,
      message: `Added ${amountLabel} ${line.category.replace(/_/g, " ")} for ${staffName} on “${found.item.title}”.`,
      href: costsSheetPath(found.item.id),
      area: command.area,
    };
  }

  if (command.kind === "create_paid_campaign") {
    const created = await createPaidCampaign({
      name: command.name,
      platform: command.platform || "Multi-channel",
      status: command.status || "draft",
      external_id: "",
      external_url: "",
      starts_at: command.starts_at,
      ends_at: command.ends_at,
      spent: null,
      goal: command.goal || command.name,
      key_results: "",
      cost_per_result: null,
      impressions: null,
      clicks: null,
      ctr: "",
      landing_clicks: null,
      engagement_rate: "",
      notes: command.notes || "",
      theme_id: null,
      content_id: null,
      event_id: null,
    });
    return {
      ok: true,
      message: `Added campaign “${created.name}” under Reporting.`,
      href: command.href,
      area: command.area,
    };
  }

  if (command.kind === "create_email_campaign") {
    const created = await createEmailCampaign({
      title: command.title,
      status: "draft",
      subject: command.subject || command.title,
      preview_text: "",
      from_name: "Peters & May Marketing",
      from_email: "hello@petersandmay.com",
      html_body: "",
      design: null,
      template_id: null,
      audience_id: null,
      exclude_audience_id: null,
      list_ids: [],
      recipient_ids: [],
      brief: command.brief || "",
      hubspot_url: "",
      theme_id: null,
      content_id: null,
      event_id: null,
      folder: command.folder || "",
      category: "marketing",
      follow_up_of: null,
      adj_open_rate: null,
      adj_click_rate: null,
      scheduled_at: null,
      sent_at: null,
      last_error: "",
      created_by: user.email || user.id || "",
    });
    return {
      ok: true,
      message: `Added email campaign draft “${created.title}”.`,
      href: command.href,
      area: command.area,
    };
  }

  if (command.kind === "create_presentation") {
    const existing = await listMediaFromSupabase({
      scope: "all",
      includeAdmin: true,
      categories: ["Presentations"],
      limit: 1000,
    });
    const duplicate = existing.items.find((item) =>
      samePresentationLink(item.document_link, command.url)
    );
    if (duplicate) {
      return {
        ok: true,
        message: `“${duplicate.display_name || duplicate.name}” is already in the library.`,
        href: command.href,
        area: command.area,
      };
    }
    const item = await createMediaInSupabase({
      name: command.title,
      public_title: command.visibility === "public" ? command.title : "",
      category: "Presentations",
      visibility: command.visibility,
      division: "All",
      document_link: command.url,
      status: "Internal Resource",
      actorId: user.id,
    });
    const where = command.visibility === "public" ? "public library" : "library";
    return {
      ok: true,
      message: `Added “${item.name}” to the ${where}.`,
      href: command.href,
      area: command.area,
    };
  }

  if (command.kind === "create_marketing_list") {
    const created = await createPortalCountryMarketingList({
      name: command.name,
      country: command.country,
    });
    if (!created.ok) return { ok: false, message: created.error };
    const count = created.total == null ? "" : ` ${created.total} people.`;
    return {
      ok: true,
      message: created.already
        ? `${created.name} is already a list.`
        : `Added ${created.name}.${count} It is ready in Email.`,
      href: command.href,
      area: command.area,
    };
  }

  if (command.kind === "create_task") {
    const item = await createTask({
      title: command.title,
      details: command.details,
      start_date: null,
      due_date: command.due_date,
      category: "",
      status: command.status,
      owner: command.owner,
      related_type: "",
      related_id: null,
    });
    return {
      ok: true,
      message: `Added task “${item.title}”.`,
      href: command.href,
      area: command.area,
    };
  }

  if (command.kind === "update_task") {
    const found = matchByTitle(await listTasks(), command.query);
    if (found.kind === "none") {
      return { ok: false, message: `No task matches “${command.query}”.` };
    }
    if (found.kind === "many") {
      return {
        ok: false,
        message: `Several tasks match “${command.query}”: ${describeMatches(found.items)}. Use the full title.`,
      };
    }
    const updated = await updateTask(found.item.id, command.patch);
    if (!updated) return { ok: false, message: "That task could not be updated." };
    const title = command.patch.title || found.item.title;
    return {
      ok: true,
      message: `Updated task “${title}”.`,
      href: command.href,
      area: command.area,
    };
  }

  if (command.kind === "create_event") {
    const attendance = command.attending
      ? await resolveProposedAttendance(command.attending)
      : { pm_attendance: "", pm_attending: false, people: [] };
    const isAdmin = user.role === "admin";
    const item = await createEvent(
      {
        title: command.title,
        starts_at: command.starts_at,
        ends_at: command.ends_at,
        location: command.location,
        event_type: command.event_type,
        division: "",
        notes: command.notes,
        link_url: "",
        date_status: command.date_status,
        ...emptyAttendanceOpsFields(),
        ...(isAdmin
          ? {
              pm_attendance: attendance.pm_attendance,
              pm_attending: attendance.pm_attending,
            }
          : { pm_attendance: "" }),
        created_by: user.id,
      },
      attendance.people
    );
    return {
      ok: true,
      message: `Added event “${item.title}”${attendanceSavedNote(attendance)}.`,
      href: command.href,
      area: command.area,
    };
  }

  if (command.kind === "update_event") {
    const found = matchByTitle(await listEvents(), command.query);
    if (found.kind === "none") {
      return { ok: false, message: `No event matches “${command.query}”.` };
    }
    if (found.kind === "many") {
      return {
        ok: false,
        message: `Several events match “${command.query}”: ${describeMatches(found.items)}. Use the full title.`,
      };
    }
    const isAdmin = user.role === "admin";
    const attendance = command.attending
      ? await resolveProposedAttendance(command.attending)
      : null;
    const patch = {
      ...(isAdmin
        ? command.patch
        : stripAttendanceOpsFields({ ...command.patch })),
      ...(attendance
        ? {
            pm_attendance: mergeAttendanceLabel(
              found.item.pm_attendance ?? "",
              attendance.pm_attendance
            ),
            ...(isAdmin && attendance.pm_attending
              ? { pm_attending: true }
              : {}),
          }
        : {}),
    };
    const updated = await updateEvent(found.item.id, patch);
    if (!updated) return { ok: false, message: "That event could not be updated." };
    if (attendance?.people.length) {
      await upsertEventAttendanceMany(found.item.id, attendance.people);
    }
    const title = command.patch.title || found.item.title;
    return {
      ok: true,
      message: `Updated event “${title}”${attendance ? addedAttendeesNote(attendance) : ""}.`,
      href: command.href,
      area: command.area,
    };
  }

  if (command.kind === "link_content") {
    const [events, posts, links] = await Promise.all([
      listEvents(),
      listContent(),
      listEventContentLinks(),
    ]);
    const event = matchByTitle(events, command.event_query);
    if (event.kind === "none") {
      return { ok: false, message: `No event matches “${command.event_query}”.` };
    }
    if (event.kind === "many") {
      return {
        ok: false,
        message: `Several events match “${command.event_query}”: ${describeMatches(event.items)}. Use the full title.`,
      };
    }
    const post = matchByTitle(posts, command.content_query);
    if (post.kind === "none") {
      return { ok: false, message: `No post matches “${command.content_query}”.` };
    }
    if (post.kind === "many") {
      return {
        ok: false,
        message: `Several posts match “${command.content_query}”: ${describeMatches(post.items)}. Use the full title.`,
      };
    }
    const already = links.some(
      (link) => link.event_id === event.item.id && link.content_id === post.item.id
    );
    if (!already) {
      await linkEventContent(event.item.id, post.item.id);
    }
    return {
      ok: true,
      message: already
        ? `“${post.item.title}” is already linked to “${event.item.title}”.`
        : `Linked “${post.item.title}” to “${event.item.title}”.`,
      href: "/app/events",
      area: "events",
      areas: ["events", "content"],
    };
  }

  if (command.kind === "create_content") {
    const contentType = (command.content_type || "Social").trim() || "Social";
    const created = await createContent({
      title: command.title,
      channel: normalizeChannels(command.channel),
      content_type: contentType,
      owner: "",
      due_date: command.due_date,
      deadline_date: null,
      status: command.status,
      category: contentType === "PR" ? "Press release" : "",
      priority: "",
      website: "",
      caption: command.caption,
      theme_id: null,
      planable_url: "",
      planable_post_id: "",
      planable_group_id: "",
      planable_page_ids: [],
      last_synced_at: null,
      sync_source: "hub",
      asset_url: command.asset_url || "",
      notes: command.notes,
    });
    const synced = await syncContent(created);
    const label =
      contentType === "Social" ? "post" : `${contentType.toLowerCase()} content`;
    return {
      ok: true,
      message: `Added ${label} “${synced.item.title}”.${synced.note}`,
      href: command.href,
      area: command.area,
    };
  }

  const found = matchByTitle(await listContent(), command.query);
  if (found.kind === "none") {
    return { ok: false, message: `No post matches “${command.query}”.` };
  }
  if (found.kind === "many") {
    return {
      ok: false,
      message: `Several posts match “${command.query}”: ${describeMatches(found.items)}. Use the full title.`,
    };
  }
  if (found.item.status === "published") {
    return {
      ok: false,
      message:
        "That post is published and locked in the hub. Update it in Planable, or delete it from Content.",
    };
  }
  const patch = { ...command.patch };
  if (patch.status === ("published" as ContentStatus)) {
    return {
      ok: false,
      message:
        "Publish in Planable. In the hub, set the post to draft, review, approved, or scheduled.",
    };
  }
  if (patch.channel) patch.channel = normalizeChannels(patch.channel);
  const updated = await updateContent(found.item.id, {
    ...patch,
    sync_source: "hub",
  });
  if (!updated) return { ok: false, message: "That post could not be updated." };
  const synced = await syncContent(updated);
  return {
    ok: true,
    message: `Updated post “${synced.item.title}”.${synced.note}`,
    href: command.href,
    area: command.area,
  };
}
