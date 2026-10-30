import { jsonError, jsonOk, requireEnquiriesAccess } from "@/lib/api";
import {
  getChatInsights,
  latestMessagePreviews,
  getChatSettings,
  listChatSessions,
  getKbDocument,
  listKbCatalogue,
  updateChatSettings,
  upsertKbDocument,
  deleteKbDocument,
  createChatSession,
  addChatMessage,
  listChatMessages,
  getChatSession,
  updateChatSession,
} from "@/lib/chat/data";
import { generateAssistantReply } from "@/lib/chat/rag";
import { emailVisitorStaffReply } from "@/lib/chat/notify";
import { syncClosedChatSessionToPortal } from "@/lib/chat/lead";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import type { ChatSessionStatus } from "@/lib/types";

/** Staff: list sessions, settings, KB, insights — action via query or body. */
export async function GET(request: Request) {
  const gate = await requireEnquiriesAccess();
  if (gate.error) return gate.error;
  if (!hasServiceRoleKey()) {
    return jsonOk({ configured: false });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "sessions";

  try {
    if (view === "settings") {
      const settings = await getChatSettings();
      return jsonOk({
        configured: true,
        settings,
        site_key_configured: Boolean(process.env.CHAT_SITE_KEY?.trim()),
      });
    }
    if (view === "kb") {
      const documents = await listKbCatalogue();
      return jsonOk({ configured: true, documents });
    }
    if (view === "insights") {
      const insights = await getChatInsights(url.searchParams.get("from"));
      return jsonOk({ configured: true, insights });
    }

    const statusRaw = url.searchParams.get("status");
    const status =
      statusRaw === "open" ||
      statusRaw === "all" ||
      statusRaw === "ai" ||
      statusRaw === "waiting" ||
      statusRaw === "human" ||
      statusRaw === "closed"
        ? (statusRaw as ChatSessionStatus | "open" | "all")
        : "open";
    const sessions = await listChatSessions({ status, limit: 150 });
    const previews = await latestMessagePreviews(sessions.map((s) => s.id));
    return jsonOk({
      configured: true,
      sessions: sessions.map((s) => ({
        ...s,
        last_body: previews[s.id] ?? "",
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return jsonError(message, 500);
  }
}

export async function POST(request: Request) {
  const gate = await requireEnquiriesAccess();
  if (gate.error) return gate.error;
  if (!hasServiceRoleKey()) {
    return jsonError("Chat storage is not configured", 503);
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return jsonError("JSON body required");

  const action = String(body.action ?? "");

  try {
    if (action === "update_settings") {
      const settings = await updateChatSettings({
        ...(typeof body.deployed === "boolean"
          ? { deployed: body.deployed }
          : {}),
        ...(typeof body.greeting === "string"
          ? { greeting: body.greeting }
          : {}),
        ...(typeof body.guidance === "string"
          ? { guidance: body.guidance }
          : {}),
        ...(typeof body.office_hours_note === "string"
          ? { office_hours_note: body.office_hours_note }
          : {}),
        ...(typeof body.notify_email === "string"
          ? { notify_email: body.notify_email }
          : {}),
      });
      return jsonOk({ settings });
    }

    if (action === "upsert_kb") {
      const doc = await upsertKbDocument({
        id: typeof body.id === "string" ? body.id : undefined,
        title: String(body.title ?? ""),
        body: String(body.body ?? ""),
        source_url:
          typeof body.source_url === "string" ? body.source_url : "",
        active: body.active !== false,
        sort_order:
          typeof body.sort_order === "number" ? body.sort_order : 100,
      });
      return jsonOk({ document: doc });
    }

    if (action === "get_kb") {
      const id = String(body.id ?? "");
      if (!id) return jsonError("id required");
      const document = await getKbDocument(id);
      if (!document) return jsonError("Not found", 404);
      return jsonOk({ document });
    }

    if (action === "delete_kb") {
      const id = String(body.id ?? "");
      if (!id) return jsonError("id required");
      await deleteKbDocument(id);
      return jsonOk({ ok: true });
    }

    if (action === "test") {
      const message = String(body.message ?? "").trim();
      if (!message) return jsonError("message required");
      const existingId =
        typeof body.session_id === "string" ? body.session_id : "";
      let session = existingId ? await getChatSession(existingId) : null;
      let welcomeId = "";
      if (!session || !session.is_test) {
        const created = await createChatSession({
          page_url: "https://hub-playground.local/",
          page_title: "Hub playground",
          is_test: true,
        });
        session = created.session;
        welcomeId = created.welcome.id;
      }
      await addChatMessage({
        session_id: session.id,
        role: "visitor",
        body: message,
      });
      const history = await listChatMessages(session.id);
      const guidanceOverride =
        typeof body.guidance === "string" ? body.guidance : undefined;
      const reply = await generateAssistantReply({
        visitorMessage: message,
        history: history
          .filter((m) => m.id !== welcomeId)
          .slice(0, -1),
        guidanceOverride,
      });
      const saved = await addChatMessage({
        session_id: session.id,
        role: "assistant",
        body: reply.body,
        sources: reply.sources,
      });
      return jsonOk({
        session,
        reply: saved,
        choices: reply.choices,
        handoff: reply.forceHandoff,
      });
    }

    if (action === "reply") {
      const sessionId = String(body.session_id ?? "");
      const text = String(body.body ?? "").trim();
      if (!sessionId || !text) {
        return jsonError("session_id and body required");
      }
      const session = await getChatSession(sessionId);
      if (!session) return jsonError("Not found", 404);
      if (session.status === "closed") {
        return jsonError(
          "The visitor closed this chat, so it cannot be taken over.",
          409
        );
      }
      const fullName = (gate.user.full_name || "").trim();
      const emailLocal = (gate.user.email || "").split("@")[0] || "";
      const rawFirst =
        (fullName.split(/\s+/)[0] || emailLocal.split(/[._-]/)[0] || "Team").trim();
      const authorName =
        rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase();
      const msg = await addChatMessage({
        session_id: sessionId,
        role: "staff",
        body: text,
        author_name: authorName,
      });
      if (session.status === "waiting" || session.status === "ai") {
        await updateChatSession(sessionId, {
          status: "human",
          assignee_email: gate.user.email ?? "",
        });
      }
      const visitorEmail = session.visitor_email.trim();
      if (visitorEmail) {
        void emailVisitorStaffReply({
          to: visitorEmail,
          reply: text,
          authorName,
        });
      }
      return jsonOk({ message: msg });
    }

    if (action === "patch_session") {
      const sessionId = String(body.session_id ?? "");
      if (!sessionId) return jsonError("session_id required");
      const status = body.status as ChatSessionStatus | undefined;
      const existing = await getChatSession(sessionId);
      if (!existing) return jsonError("Not found", 404);
      if (existing.status === "closed" && status && status !== "closed") {
        return jsonError(
          "The visitor closed this chat, so it cannot be taken over.",
          409
        );
      }
      const updated = await updateChatSession(sessionId, {
        ...(status ? { status } : {}),
        ...(typeof body.assignee_email === "string"
          ? { assignee_email: body.assignee_email }
          : {}),
      });
      if (!updated) return jsonError("Not found", 404);

      // Closing with contact details → Hub enquiry + Portal (full transcript).
      let portal_sync: Awaited<
        ReturnType<typeof syncClosedChatSessionToPortal>
      > | null = null;
      if (status === "closed") {
        portal_sync = await syncClosedChatSessionToPortal(sessionId);
      }

      return jsonOk({ session: updated, portal_sync });
    }

    if (action === "get_session") {
      const sessionId = String(body.session_id ?? "");
      if (!sessionId) return jsonError("session_id required");
      const session = await getChatSession(sessionId);
      if (!session) return jsonError("Not found", 404);
      const messages = await listChatMessages(sessionId);
      return jsonOk({ session, messages });
    }

    return jsonError("Unknown action");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return jsonError(message, 500);
  }
}
