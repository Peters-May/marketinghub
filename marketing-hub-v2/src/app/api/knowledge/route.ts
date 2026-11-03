import { jsonError, jsonOk, requireAdmin, requireWebsiteChatAccess } from "@/lib/api";
import {
  deleteKbDocument,
  listKbCatalogue,
  upsertKbDocument,
} from "@/lib/chat/data";
import {
  listChatKbSuggestions,
  updateChatKbSuggestion,
} from "@/lib/chat/kb-suggestions";
import {
  deleteHubHelpDocument,
  listHubHelpDocuments,
  publicKnowledgeOverview,
  upsertHubHelpDocument,
} from "@/lib/knowledge/hub-help";
import { isKnowledgeAudience } from "@/lib/knowledge/audience";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import { HUB_HOW_TO_TOPICS } from "@/lib/ai/hub-how-to";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const audience = url.searchParams.get("audience") || "public";
  if (!isKnowledgeAudience(audience)) {
    return jsonError("audience must be public or internal", 400);
  }

  if (audience === "public") {
    const gate = await requireWebsiteChatAccess();
    if (gate.error) return gate.error;
  } else {
    const gate = await requireAdmin();
    if (gate.error || !gate.user) return gate.error;
  }

  if (!hasServiceRoleKey()) {
    return jsonOk({ configured: false });
  }

  const view = url.searchParams.get("view") || "overview";

  try {
    if (audience === "internal") {
      if (view === "documents") {
        const documents = await listHubHelpDocuments();
        return jsonOk({
          configured: true,
          audience,
          documents,
          tool_coverage: [
            "search_events",
            "event_outstanding",
            "event_costs",
            "search_tasks",
            "search_content",
            "search_campaigns",
            "search_contacts",
            "budget_summary",
            "enquiry_stats",
            "search_awards",
            "hub_how_to",
          ],
          how_to_topics: HUB_HOW_TO_TOPICS.map((t) => ({
            id: t.id,
            title: t.title,
            href: t.href,
          })),
        });
      }
      return jsonOk({
        configured: true,
        audience,
        overview: {
          audience: "internal",
          pages_indexed: 0,
          pages_active: 0,
          documents_active: (await listHubHelpDocuments()).filter((d) => d.active)
            .length,
          suggestions_pending: 0,
          last_sync_hint: "Static how-to + hub_help_documents",
        },
      });
    }

    if (view === "documents") {
      const documents = await listKbCatalogue();
      return jsonOk({ configured: true, audience, documents });
    }
    if (view === "suggestions") {
      const status = url.searchParams.get("status") || "pending";
      const suggestions = await listChatKbSuggestions(status);
      return jsonOk({ configured: true, audience, suggestions });
    }
    const overview = await publicKnowledgeOverview();
    return jsonOk({ configured: true, audience, overview });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return jsonError(message, 500);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return jsonError("JSON body required");
  const audience = isKnowledgeAudience(body.audience)
    ? body.audience
    : "public";
  const action = String(body.action ?? "");

  if (audience === "internal") {
    const gate = await requireAdmin();
    if (gate.error || !gate.user) return gate.error;
  } else {
    const gate = await requireWebsiteChatAccess();
    if (gate.error) return gate.error;
  }

  if (!hasServiceRoleKey()) {
    return jsonError("Knowledge storage is not configured", 503);
  }

  try {
    if (audience === "internal") {
      if (action === "upsert_document") {
        const document = await upsertHubHelpDocument({
          id: typeof body.id === "string" ? body.id : undefined,
          title: String(body.title ?? ""),
          body: String(body.body ?? ""),
          source_url:
            typeof body.source_url === "string" ? body.source_url : "",
          active: body.active !== false,
        });
        return jsonOk({ document });
      }
      if (action === "delete_document") {
        await deleteHubHelpDocument(String(body.id ?? ""));
        return jsonOk({ ok: true });
      }
      return jsonError("Unknown internal action", 400);
    }

    if (action === "upsert_document") {
      const document = await upsertKbDocument({
        id: typeof body.id === "string" ? body.id : undefined,
        title: String(body.title ?? ""),
        body: String(body.body ?? ""),
        source_url:
          typeof body.source_url === "string" ? body.source_url : "",
        active: body.active !== false,
      });
      return jsonOk({ document });
    }
    if (action === "delete_document") {
      await deleteKbDocument(String(body.id ?? ""));
      return jsonOk({ ok: true });
    }
    if (action === "update_suggestion") {
      const updated = await updateChatKbSuggestion(String(body.id ?? ""), {
        ...(typeof body.status === "string"
          ? {
              status: body.status as "pending" | "approved" | "dismissed",
            }
          : {}),
        ...(typeof body.sample_answer === "string"
          ? { sample_answer: body.sample_answer }
          : {}),
        ...(typeof body.question === "string"
          ? { question: body.question }
          : {}),
      });
      if (
        updated &&
        body.status === "approved" &&
        updated.sample_answer.trim()
      ) {
        await upsertKbDocument({
          title: updated.question.slice(0, 120) || "FAQ",
          body: updated.sample_answer,
          source_url: "",
          active: true,
          sort_order: 50,
        });
      }
      return jsonOk({ suggestion: updated });
    }
    return jsonError("Unknown action", 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return jsonError(message, 500);
  }
}
