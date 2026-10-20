import { ChatClient } from "@/components/chat/ChatClient";
import { hasServiceRoleKey } from "@/lib/supabase/admin";

export default function ChatPage({
  searchParams,
}: {
  searchParams?: { session?: string };
}) {
  return (
    <ChatClient
      configured={hasServiceRoleKey()}
      initialSessionId={searchParams?.session}
    />
  );
}
