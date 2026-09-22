import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import {
  createEmailAudience,
  deleteEmailAudience,
  listContacts,
  listEmailAudiences,
  listMediaLists,
  resolveEmailRecipients,
  updateEmailAudience,
} from "@/lib/data/repos";

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;
  const [audiences, lists, contacts] = await Promise.all([
    listEmailAudiences(),
    listMediaLists(),
    listContacts(),
  ]);

  const withCounts = await Promise.all(
    audiences.map(async (a) => {
      const recipients = await resolveEmailRecipients({
        audienceId: a.id,
      });
      return { ...a, recipient_count: recipients.length };
    })
  );

  return jsonOk({
    audiences: withCounts,
    lists: lists.filter(
      (l) => l.list_kind === "marketing" || l.list_kind === "mixed"
    ),
    contacts,
  });
}

export async function POST(request: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;
  const body = await request.json();
  const action = body.action as string | undefined;

  if (action === "update") {
    const item = await updateEmailAudience(body.id, body.patch ?? {});
    if (!item) return jsonError("Not found", 404);
    const recipients = await resolveEmailRecipients({ audienceId: item.id });
    return jsonOk({ item: { ...item, recipient_count: recipients.length } });
  }

  if (action === "delete") {
    await deleteEmailAudience(body.id);
    return jsonOk({ ok: true });
  }

  if (action === "preview") {
    const recipients = await resolveEmailRecipients({
      audienceId: body.audience_id,
      listIds: body.list_ids,
      recipientIds: body.contact_ids,
      excludeUnsubscribed: body.exclude_unsubscribed,
    });
    return jsonOk({
      count: recipients.length,
      sample: recipients.slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
      })),
    });
  }

  const item = await createEmailAudience({
    name: body.name ?? "Untitled audience",
    description: body.description ?? "",
    list_ids: Array.isArray(body.list_ids) ? body.list_ids : [],
    contact_ids: Array.isArray(body.contact_ids) ? body.contact_ids : [],
    filter: body.filter ?? { tags: [], country: "" },
    exclude_unsubscribed: body.exclude_unsubscribed !== false,
  });
  const recipients = await resolveEmailRecipients({ audienceId: item.id });
  return jsonOk(
    { item: { ...item, recipient_count: recipients.length } },
    { status: 201 }
  );
}
