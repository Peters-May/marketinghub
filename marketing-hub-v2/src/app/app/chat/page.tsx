import { ChatClient } from "@/components/chat/ChatClient";
import { canAccessWebsiteChat } from "@/lib/auth/chat-access";
import { getSessionUser } from "@/lib/auth/session";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: { session?: string };
}) {
  const user = await getSessionUser();
  if (!canAccessWebsiteChat(user)) {
    redirect(user?.role === "seo" ? "/app/enquiries" : "/app");
  }

  return (
    <ChatClient
      configured={hasServiceRoleKey()}
      initialSessionId={searchParams?.session}
    />
  );
}
