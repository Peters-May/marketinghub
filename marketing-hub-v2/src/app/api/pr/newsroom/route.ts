import { NextRequest } from "next/server";
import { jsonOk, requireAdmin } from "@/lib/api";
import {
  getNewsroomSettings,
  updateNewsroomSettings,
} from "@/lib/data/repos";
import type { NewsroomSettings } from "@/lib/types";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return jsonOk({ settings: await getNewsroomSettings() });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await request.json();
  const patch = (body.patch ?? body) as Partial<NewsroomSettings>;
  const settings = await updateNewsroomSettings(patch);
  return jsonOk({ settings });
}
