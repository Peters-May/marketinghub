import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import { executeHubCommand } from "@/lib/command/execute";
import { parseHubCommand } from "@/lib/command/parse";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error || !user) return error;

  let body: { text?: unknown; confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Type what to add or update.");
  }

  const text = typeof body.text === "string" ? body.text.slice(0, 500) : "";
  const parsed = parseHubCommand(text);
  if (!parsed.ok) {
    return jsonOk({
      ok: false,
      error: parsed.message,
      examples: parsed.examples,
    });
  }

  if (body.confirm !== true) {
    return jsonOk({
      ok: true,
      preview: {
        summary: parsed.command.summary,
        verb: parsed.command.verb,
        href: parsed.command.href,
      },
    });
  }

  try {
    const result = await executeHubCommand(parsed.command, user);
    if (!result.ok) return jsonOk({ ok: false, error: result.message });
    return jsonOk({
      ok: true,
      done: {
        message: result.message,
        href: result.href,
        area: result.area,
      },
    });
  } catch (err) {
    console.error("[api/command] failed", err);
    return jsonError(
      err instanceof Error ? err.message : "The hub could not save that.",
      500
    );
  }
}
