import { NextRequest } from "next/server";
import { getAiKeyPublicStatus, saveAiKey } from "@/lib/ai/ai-key";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return jsonOk({ status: await getAiKeyPublicStatus() });
}

export async function POST(request: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body", 400);
  }

  const apiKey = typeof body.api_key === "string" ? body.api_key : "";
  const expiresOn = typeof body.expires_on === "string" ? body.expires_on : "";

  try {
    const status = await saveAiKey({
      apiKey,
      expiresOn,
      updatedBy: user.email,
    });
    return jsonOk({ status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save the key.";
    return jsonError(message, 400);
  }
}
