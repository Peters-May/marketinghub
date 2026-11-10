import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import {
  listMerchIssuedKit,
  replaceMerchIssuedKit,
} from "@/lib/data/repos";
import { isMerchAdmin } from "@/lib/merch/access";
import type { MerchIssuedPerson } from "@/lib/types";

export async function GET() {
  const { user, error } = await requireStaff();
  if (error) return error;
  if (!isMerchAdmin(user)) return jsonError("Forbidden", 403);
  return jsonOk({ people: await listMerchIssuedKit() });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error) return error;
  if (!isMerchAdmin(user)) return jsonError("Forbidden", 403);

  const body = await request.json().catch(() => ({}));
  const people = Array.isArray(body.people)
    ? (body.people as MerchIssuedPerson[])
    : null;
  if (!people) return jsonError("people array required", 400);

  const saved = await replaceMerchIssuedKit(people);
  return jsonOk({ people: saved });
}
