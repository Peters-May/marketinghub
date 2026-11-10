import { waitUntil } from "@vercel/functions";
import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import { canAccessBudget } from "@/lib/auth/budget-access";
import { isAutoMemberEmail, memberEmailDomains } from "@/lib/auth/member-domain";
import { createHubUser, listEvents, listHubUsers } from "@/lib/data/repos";
import { sendEventCostsRequest } from "@/lib/email/send-event-costs-request";
import {
  canEditCostLine,
  canManageAllCostLines,
  costsSheetPath,
  filterVisibleCostLines,
  findCostRequestRecipient,
  isCostCategory,
  isCostCurrency,
  parseCostAmount,
} from "@/lib/events/costs";
import {
  addEventCostRequest,
  addHubNotification,
  getEventCostLine,
  listEventCostLines,
  listEventCostRequests,
  removeEventCostLine,
  saveEventCostLine,
} from "@/lib/events/costs-data";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import { inviteSupabaseHubUser, listSupabaseHubUsers } from "@/lib/supabase/hub-users";
import type { HubUser } from "@/lib/types";

async function listHubDirectory(): Promise<HubUser[]> {
  return hasServiceRoleKey() ? await listSupabaseHubUsers() : await listHubUsers();
}

/** Admin and member Hub users — the people a cost line can belong to. */
async function listCostStaff(): Promise<HubUser[]> {
  const users = await listHubDirectory();
  return users.filter((u) => u.role === "admin" || u.role === "member");
}

function roleLabel(role: string) {
  if (role === "admin") return "Admin";
  if (role === "seo") return "SEO";
  if (role === "external") return "External";
  return "Member";
}

/**
 * Use an existing admin/member, or add a company email as a Member
 * so they can sign in and enter their costs.
 */
async function resolveCostsRecipient(input: {
  staffUserId: string;
  email: string;
  fullName: string;
  /** Hub user notes when creating someone who is not on the list yet. */
  createNotes?: string;
}): Promise<
  | { person: HubUser; added: boolean; invited: boolean }
  | { error: string }
> {
  if (input.staffUserId) {
    const person = (await listCostStaff()).find((user) => user.id === input.staffUserId);
    if (!person) return { error: "Choose a Hub staff member" };
    return { person, added: false, invited: false };
  }

  if (!input.email.trim()) return { error: "Choose a Hub staff member" };

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email || !email.includes("@")) return { error: "A valid email is required" };
  if (!fullName) return { error: "Enter their name" };
  if (!isAutoMemberEmail(email)) {
    return { error: "Use their Peters & May email address" };
  }

  const existing = findCostRequestRecipient(await listHubDirectory(), email);
  if (existing?.onList) {
    return { person: existing.person, added: false, invited: false };
  }
  if (existing) {
    return {
      error: `That email is already in the Hub as ${roleLabel(existing.person.role)}. An admin can change their role in Users.`,
    };
  }

  const createNotes = input.createNotes?.trim() || "Added from an event costs request";
  try {
    const invited = hasServiceRoleKey();
    const person = invited
      ? await inviteSupabaseHubUser({
          email,
          full_name: fullName,
          role: "member",
          notes: createNotes,
        })
      : await createHubUser({
          email,
          full_name: fullName,
          role: "member",
          notes: createNotes,
        });
    return { person, added: true, invited };
  } catch (err) {
    const again = findCostRequestRecipient(await listHubDirectory(), email);
    if (again?.onList) return { person: again.person, added: false, invited: false };
    return { error: err instanceof Error ? err.message : "Could not add them" };
  }
}

async function findEvent(eventId: string) {
  if (!eventId) return null;
  return (await listEvents()).find((event) => event.id === eventId) ?? null;
}

export async function GET(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error || !user) return error;
  const eventId = request.nextUrl.searchParams.get("eventId")?.trim() ?? "";
  if (!eventId) return jsonError("eventId is required");
  const canManageAll = canAccessBudget(user);
  const viewer = {
    id: user.id,
    isAdmin: user.role === "admin",
    canManageAll,
    name: user.full_name || user.email,
  };
  const lines = filterVisibleCostLines(await listEventCostLines(eventId), viewer);
  // The header button only needs the lines; skip the user directory lookup.
  if (request.nextUrl.searchParams.get("summary") === "1") return jsonOk({ lines });
  const [staff, requests] = await Promise.all([
    listCostStaff(),
    listEventCostRequests(eventId),
  ]);
  return jsonOk({
    lines,
    requests,
    viewer,
    staff: staff.map((u) => ({ id: u.id, name: u.full_name || u.email })),
    memberDomains: memberEmailDomains(),
  });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error || !user) return error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Invalid request", 400);
  const action = String(body.action ?? "");
  const canManageAll = canAccessBudget(user);
  const viewer = {
    id: user.id,
    isAdmin: user.role === "admin",
    canManageAll,
  };

  if (action === "save_line") {
    const id = String(body.id ?? "").trim();
    const existing = id ? await getEventCostLine(id) : null;
    if (id && !existing) return jsonError("That line no longer exists", 404);
    if (existing && !canEditCostLine(existing, viewer)) {
      return jsonError("You can only edit your own lines", 403);
    }

    const eventId = existing?.event_id ?? String(body.event_id ?? "").trim();
    if (!existing && !(await findEvent(eventId))) return jsonError("Event not found", 404);

    const category = String(body.category ?? "other");
    if (!isCostCategory(category)) return jsonError("Unknown category", 400);
    const currency = String(body.currency ?? "GBP");
    if (!isCostCurrency(currency)) return jsonError("Unknown currency", 400);
    const amount = parseCostAmount(body.amount);
    if (amount === undefined) return jsonError("Enter an amount of 0 or more, or leave it blank", 400);

    // Members always own the lines they add or edit. Admins and budget editors assign.
    let staffUserId: string | null = user.id;
    let staffName = user.full_name || user.email;
    if (canManageAllCostLines(viewer)) {
      staffUserId = String(body.staff_user_id ?? "").trim() || null;
      staffName = "";
      if (staffUserId) {
        const person = (await listCostStaff()).find((u) => u.id === staffUserId);
        if (!person) return jsonError("Choose a Hub staff member", 400);
        staffName = person.full_name || person.email;
      }
    } else if (existing) {
      staffUserId = existing.staff_user_id;
      staffName = existing.staff_name;
    }

    const line = await saveEventCostLine({
      id: existing?.id,
      event_id: eventId,
      category,
      description: String(body.description ?? ""),
      amount,
      currency,
      staff_user_id: staffUserId,
      staff_name: staffName,
      notes: String(body.notes ?? ""),
    });
    if (!line) return jsonError("Could not save the line", 500);
    return jsonOk({ line });
  }

  if (action === "delete_line") {
    const existing = await getEventCostLine(String(body.id ?? ""));
    if (!existing) return jsonOk({ ok: true });
    if (!canEditCostLine(existing, viewer)) {
      return jsonError("You can only remove your own lines", 403);
    }
    await removeEventCostLine(existing.id);
    return jsonOk({ ok: true });
  }

  /** Add a colleague to the costs staff list (admin / budget editor), without sending a request. */
  if (action === "add_staff") {
    if (!canManageAllCostLines(viewer)) {
      return jsonError("Only admins can add people to costs", 403);
    }
    const resolved = await resolveCostsRecipient({
      staffUserId: "",
      email: String(body.email ?? ""),
      fullName: String(body.full_name ?? ""),
      createNotes: "Added from an event costs sheet",
    });
    if ("error" in resolved) return jsonError(resolved.error, 400);
    const { person, added, invited } = resolved;
    return jsonOk({
      staff: {
        id: person.id,
        name: person.full_name || person.email,
      },
      added,
      invited,
    });
  }

  if (action === "request") {
    const event = await findEvent(String(body.event_id ?? "").trim());
    if (!event) return jsonError("Event not found", 404);
    const resolved = await resolveCostsRecipient({
      staffUserId: String(body.staff_user_id ?? "").trim(),
      email: String(body.email ?? ""),
      fullName: String(body.full_name ?? ""),
    });
    if ("error" in resolved) return jsonError(resolved.error, 400);
    const { person, added, invited } = resolved;

    const requestedBy = user.full_name || user.email;
    const subject = String(body.subject ?? event.title).trim().slice(0, 200);
    const message = String(body.message ?? body.note ?? "").trim().slice(0, 4000);
    if (!subject) return jsonError("Add a subject", 400);
    if (!message) return jsonError("Add a message", 400);

    const path = costsSheetPath(event.id);
    const notificationBody =
      message.split(/\n+/).map((line) => line.trim()).find(Boolean) ||
      `${requestedBy} asked you to add your costs for this event.`;

    await addHubNotification({
      user_id: person.id,
      title: `Add your costs: ${event.title}`,
      body: notificationBody.slice(0, 280),
      href: path,
    });

    const costRequest = await addEventCostRequest({
      event_id: event.id,
      staff_user_id: person.id,
      staff_name: person.full_name || person.email,
      requested_by_user_id: user.id,
      requested_by_name: requestedBy,
    });

    const email = person.email?.trim();
    const staff = {
      id: person.id,
      name: person.full_name || person.email,
    };
    if (!email) {
      return jsonOk({
        reminder: true,
        emailed: false,
        emailSkipped: "No email address on their Hub record",
        added,
        invited,
        staff,
        request: costRequest,
      });
    }

    // Return once the Hub reminder is saved; Resend continues in the background.
    waitUntil(
      sendEventCostsRequest({
        to: email,
        subject,
        message,
        path,
      }).then((sent) => {
        if (!sent.success) {
          console.error("[events/costs] background email failed:", sent.error);
        }
      })
    );

    return jsonOk({
      reminder: true,
      emailed: true,
      emailQueued: true,
      added,
      invited,
      staff,
      request: costRequest,
    });
  }

  return jsonError("Unknown action", 400);
}
