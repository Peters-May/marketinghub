import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import { executeHubCommands } from "@/lib/command/execute";
import { parseHubCommands, type HubCommand } from "@/lib/command/parse";

export const dynamic = "force-dynamic";

function previewSummary(commands: HubCommand[], skippedCount: number) {
  if (commands.length === 1 && skippedCount === 0) return commands[0].summary;
  const countLabel =
    commands.length === 1 ? "1 action" : `${commands.length} actions`;
  const skip =
    skippedCount > 0
      ? ` ${skippedCount} line${skippedCount === 1 ? "" : "s"} could not be read.`
      : "";
  return `${countLabel} ready to save.${skip}`;
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error || !user) return error;

  let body: { text?: unknown; confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Type what to add or update.");
  }

  const text = typeof body.text === "string" ? body.text.slice(0, 12000) : "";
  const parsed = parseHubCommands(text);
  if (!parsed.ok) {
    return jsonOk({
      ok: false,
      error: parsed.message,
      examples: parsed.examples,
    });
  }

  const summary = previewSummary(parsed.commands, parsed.skipped.length);

  if (body.confirm === true && user.role !== "admin") {
    return jsonError("This assistant cannot save records.", 403);
  }

  if (body.confirm !== true) {
    return jsonOk({
      ok: true,
      preview: {
        summary,
        verb: parsed.commands[0].verb,
        href: parsed.commands[0].href,
        items: parsed.commands.map((command) => command.summary),
        skipped: parsed.skipped.slice(0, 8),
        skippedCount: parsed.skipped.length,
      },
    });
  }

  try {
    const result = await executeHubCommands(parsed.commands, user);
    if (!result.ok) return jsonOk({ ok: false, error: result.message });
    const skippedNote =
      parsed.skipped.length > 0
        ? ` ${parsed.skipped.length} line${parsed.skipped.length === 1 ? "" : "s"} could not be read.`
        : "";
    return jsonOk({
      ok: true,
      done: {
        message: `${result.message}${skippedNote}`,
        href: result.href,
        area: result.area,
        areas: result.areas ?? [result.area],
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
