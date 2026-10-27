import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import { listEvents, listHubUsers } from "@/lib/data/repos";
import { sendEventCostsRequest } from "@/lib/email/send-event-costs-request";
import {
  canEditCostLine,
  costsSheetPath,
  isCostCategory,
  isCostCurrency,
  parseCostAmount,
} from "@/lib/events/costs";
import {
  addHubNotification,
  getEventCostLine,
  listEventCostLines,
  removeEventCostLine,
  saveEventCostLine,
} from "@/lib/events/costs-data";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import { listSupabaseHubUsers } from "@/lib/supabase/hub-users";
import type { HubUser } from "@/lib/types";

/** Admin and member Hub users — the people a cost line can belong to. */
async function listCostStaff(): Promise<HubUser[]> {
  const users = hasServiceRoleKey() ? await listSupabaseHubUsers() : await listHubUsers();
  return users.filter((u) => u.role === "admin" || u.role === "member");
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
  const lines = await listEventCostLines(eventId);
  // The header button only needs the lines; skip the user directory lookup.
  if (request.nextUrl.searchParams.get("summary") === "1") return jsonOk({ lines });
  const staff = await listCostStaff();
  return jsonOk({
    lines,
    viewer: { id: user.id, isAdmin: user.role === "admin" },
    staff: staff.map((u) => ({ id: u.id, name: u.full_name || u.email })),
  });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error || !user) return error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Invalid request", 400);
  const action = String(body.action ?? "");
  const viewer = { id: user.id, isAdmin: user.role === "admin" };

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

    // Members always own the lines they add or edit; only admins assign.
    let staffUserId: string | null = user.id;
    let staffName = user.full_name || user.email;
    if (viewer.isAdmin) {
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

  if (action === "request") {
    const event = await findEvent(String(body.event_id ?? "").trim());
    if (!event) return jsonError("Event not found", 404);
    const person = (await listCostStaff()).find(
      (u) => u.id === String(body.staff_user_id ?? "").trim()
    );
    if (!person) return jsonError("Choose a Hub staff member", 400);

    const note = String(body.note ?? "").trim().slice(0, 1000);
    const path = costsSheetPath(event.id);
    const requestedBy = user.full_name || user.email;

    await addHubNotification({
      user_id: person.id,
      title: `Add your costs: ${event.title}`,
      body: note || `${requestedBy} asked you to add your costs for this event.`,
      href: path,
    });

    const email = person.email?.trim();
    if (!email) {
      return jsonOk({ reminder: true, emailed: false, emailSkipped: "No email address on their Hub record" });
    }
    const sent = await sendEventCostsRequest({
      to: email,
      eventName: event.title,
      path,
      requestedBy,
      note,
    });
    return jsonOk({
      reminder: true,
      emailed: sent.success,
      emailSkipped: sent.success ? null : sent.error ?? "Email not sent",
    });
  }

  return jsonError("Unknown action", 400);
}
