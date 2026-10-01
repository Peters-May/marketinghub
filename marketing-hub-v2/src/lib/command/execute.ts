import type { SessionUser } from "@/lib/auth/session";
import { describeMatches, matchByTitle } from "@/lib/command/match";
import type { HubCommand } from "@/lib/command/parse";
import { normalizeChannels } from "@/lib/data/normalize";
import {
  createContent,
  createEvent,
  createTask,
  listContent,
  listEvents,
  listTasks,
  updateContent,
  updateEvent,
  updateTask,
  withContentPlanableDefaults,
} from "@/lib/data/repos";
import {
  pushContentToPlanable,
  shouldPushSocialToPlanable,
} from "@/lib/planable/sync";
import type { ContentItem, ContentStatus } from "@/lib/types";

export type ExecuteResult =
  | { ok: true; message: string; href: string; area: HubCommand["area"] }
  | { ok: false; message: string };

const ADMIN_MESSAGE =
  "Tasks and posts can be changed with an admin account. Events can be added or updated from this box.";

function needsAdmin(kind: HubCommand["kind"]) {
  return (
    kind === "create_task" ||
    kind === "update_task" ||
    kind === "create_content" ||
    kind === "update_content"
  );
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

export async function executeHubCommand(
  command: HubCommand,
  user: SessionUser
): Promise<ExecuteResult> {
  if (needsAdmin(command.kind) && user.role !== "admin") {
    return { ok: false, message: ADMIN_MESSAGE };
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
    const item = await createEvent({
      title: command.title,
      starts_at: command.starts_at,
      ends_at: null,
      location: command.location,
      event_type: command.event_type,
      division: "",
      notes: command.notes,
      link_url: "",
      social_media_post_completed: false,
      personal_social_media_graphics_completed: false,
      reached_out_for_pr_to_organisers: false,
      created_by: user.id,
    });
    return {
      ok: true,
      message: `Added event “${item.title}”.`,
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
    const updated = await updateEvent(found.item.id, command.patch);
    if (!updated) return { ok: false, message: "That event could not be updated." };
    const title = command.patch.title || found.item.title;
    return {
      ok: true,
      message: `Updated event “${title}”.`,
      href: command.href,
      area: command.area,
    };
  }

  if (command.kind === "create_content") {
    const created = await createContent({
      title: command.title,
      channel: normalizeChannels(command.channel),
      content_type: "Social",
      owner: "",
      due_date: command.due_date,
      deadline_date: null,
      status: command.status,
      category: "",
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
      asset_url: "",
      notes: command.notes,
    });
    const synced = await syncContent(created);
    return {
      ok: true,
      message: `Added post “${synced.item.title}”.${synced.note}`,
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
