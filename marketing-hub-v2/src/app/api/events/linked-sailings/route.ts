import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api";

/**
 * Read-only sailing links for an event. The website owns the relationship.
 */
export async function GET(request: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const eventId = request.nextUrl.searchParams.get("event_id") || "";
  if (!eventId) {
    return NextResponse.json({ error: "event_id is required" }, { status: 400 });
  }

  const base = process.env.WP_PLANNER_LINKS_URL || "";
  const secret = process.env.WP_PLANNER_LINKS_SECRET || "";
  if (!base || !secret) {
    return NextResponse.json(
      { error: "Website link lookup is not configured", sailings: [] },
      { status: 503 }
    );
  }

  const url = new URL(base);
  url.searchParams.set("event_id", eventId);

  try {
    const res = await fetch(url, {
      headers: { "X-Planner-Secret": secret },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Website could not be reached", sailings: [] },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { sailings?: unknown };
    return NextResponse.json({
      sailings: Array.isArray(data.sailings) ? data.sailings : [],
    });
  } catch {
    return NextResponse.json(
      { error: "Website could not be reached", sailings: [] },
      { status: 502 }
    );
  }
}
