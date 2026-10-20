import { NextRequest } from "next/server";
import { jsonOk, requireAdmin } from "@/lib/api";
import { getEmailSettings, updateEmailSettings } from "@/lib/data/repos";
import type { EmailSettings } from "@/lib/types";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return jsonOk({ settings: await getEmailSettings() });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await request.json();
  const patch = (body.patch ?? body) as Partial<EmailSettings>;
  const settings = await updateEmailSettings(patch);
  return jsonOk({ settings });
}
