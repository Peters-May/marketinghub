import { AppShell } from "@/components/shell/AppShell";
import { getSessionUser } from "@/lib/auth/session";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { redirect } from "next/navigation";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user) {
    redirect("/login?next=/shop");
  }
  if (user.role === "media_guest") {
    redirect("/media");
  }

  return (
    <AppShell
      userName={user.full_name}
      userEmail={user.email}
      accessRole={user.role}
      websiteChat={user.websiteChat}
    >
      {children}
    </AppShell>
  );
}
