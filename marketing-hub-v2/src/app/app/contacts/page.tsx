import { ContactsClient } from "@/components/contacts/ContactsClient";
import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { listContacts } from "@/lib/data/repos";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams?: { id?: string; view?: string };
}) {
  await requireAdminPage();
  return (
    <ContactsClient
      initial={await listContacts()}
      initialSelectedId={searchParams?.id}
      initialView={searchParams?.view === "lists" ? "lists" : "directory"}
    />
  );
}
