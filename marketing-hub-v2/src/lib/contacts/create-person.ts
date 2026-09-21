import type { Contact } from "@/lib/types";

export type CreatePersonContactInput = {
  name: string;
  organisation?: string;
  role?: string;
  email?: string;
  phone?: string;
};

export async function createPersonContact(
  nameOrInput: string | CreatePersonContactInput
): Promise<Contact> {
  const input =
    typeof nameOrInput === "string"
      ? { name: nameOrInput }
      : nameOrInput;
  const trimmed = input.name.trim();
  if (!trimmed) {
    throw new Error("Enter a name");
  }
  const res = await fetch("/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: trimmed,
      kind: "person",
      organisation: input.organisation?.trim() ?? "",
      role: input.role?.trim() ?? "",
      email: input.email?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    item?: Contact;
    error?: string;
  };
  if (!res.ok || !data.item) {
    throw new Error(
      typeof data.error === "string" && data.error.trim()
        ? data.error
        : "Could not add this person"
    );
  }
  return data.item;
}
