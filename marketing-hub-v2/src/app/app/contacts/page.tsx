import { ContactsClient } from "@/components/contacts/ContactsClient";
import { listContacts } from "@/lib/data/repos";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams?: { id?: string; view?: string };
}) {
  return (
    <ContactsClient
      initial={await listContacts()}
      initialSelectedId={searchParams?.id}
      initialView={searchParams?.view === "lists" ? "lists" : "directory"}
    />
  );
}
