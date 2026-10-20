import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  draftFromBrief,
  improvePreview,
  rewriteCopy,
  suggestSubjects,
} from "@/lib/email/ai-assist";

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "subjects") {
      const options = await suggestSubjects({
        brief: String(body.brief ?? ""),
        excerpt: String(body.excerpt ?? ""),
      });
      return jsonOk({ options });
    }

    if (action === "preview") {
      const options = await improvePreview({
        subject: String(body.subject ?? ""),
        excerpt: String(body.excerpt ?? ""),
      });
      return jsonOk({ options });
    }

    if (action === "rewrite") {
      const tone = body.tone as "clearer" | "shorter" | "more_formal";
      if (!["clearer", "shorter", "more_formal"].includes(tone)) {
        return jsonError("Invalid tone", 400);
      }
      const text = await rewriteCopy({
        text: String(body.text ?? ""),
        html: body.html === true,
        tone,
      });
      return jsonOk({ text });
    }

    if (action === "draft_from_brief") {
      const draft = await draftFromBrief({
        brief: String(body.brief ?? ""),
        audience: String(body.audience ?? ""),
      });
      return jsonOk({ draft });
    }

    return jsonError("Unknown action", 400);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI assist failed";
    const status = /not configured/i.test(message) ? 503 : 500;
    return jsonError(message, status);
  }
}
