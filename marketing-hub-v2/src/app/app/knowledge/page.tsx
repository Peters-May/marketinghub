import { KnowledgeClient } from "@/components/knowledge/KnowledgeClient";
import { canAccessWebsiteChat } from "@/lib/auth/chat-access";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function KnowledgePage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const canPublic = canAccessWebsiteChat(user);
  const canInternal = user.role === "admin";
  if (!canPublic && !canInternal) {
    redirect(user.role === "seo" ? "/app/enquiries" : "/app");
  }

  return <KnowledgeClient canEditInternal={canInternal} />;
}
