import { NextResponse } from "next/server";
import { applyChatCors, chatCorsPreflight } from "@/lib/chat/auth";

export function chatOptions(request: Request) {
  return chatCorsPreflight(request);
}

export function chatJson(
  request: Request,
  data: unknown,
  init?: { status?: number }
) {
  const res = NextResponse.json(data, { status: init?.status ?? 200 });
  return applyChatCors(request, res);
}

export function chatError(
  request: Request,
  message: string,
  status = 400
) {
  return chatJson(request, { error: message }, { status });
}
