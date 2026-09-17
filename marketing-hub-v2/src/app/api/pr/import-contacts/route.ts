import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createContact,
  listContacts,
  updateContact,
} from "@/lib/data/repos";
import type { Contact } from "@/lib/types";

type CsvRow = Record<string, string>;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inQuotes) {
      if (c === '"' && n === '"') {
        field += '"';
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        continue;
      }
      field += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === "," || c === ";") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && n === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((x) => x.trim() !== "")) rows.push(row);
  }
  return rows;
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function pick(row: CsvRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v?.trim()) return v.trim();
  }
  return "";
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const csv = String(body.csv ?? "");
  const mediaListId = body.media_list_id ? String(body.media_list_id) : null;
  if (!csv.trim()) return jsonError("CSV text required", 400);

  const grid = parseCsv(csv);
  if (grid.length < 2) return jsonError("CSV needs a header and at least one row", 400);

  const headers = grid[0].map(normHeader);
  const existing = await listContacts();
  const byEmail = new Map(
    existing
      .filter((c) => c.email.trim())
      .map((c) => [c.email.trim().toLowerCase(), c] as const)
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const contactIds: string[] = [];

  for (const cells of grid.slice(1)) {
    const row: CsvRow = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });

    const first = pick(row, ["first_name", "firstname", "first"]);
    const last = pick(row, ["last_name", "lastname", "last"]);
    const name =
      pick(row, ["name", "full_name", "fullname"]) ||
      [first, last].filter(Boolean).join(" ").trim();
    const email = pick(row, ["email", "e-mail", "mail"]).toLowerCase();
    const outlet = pick(row, [
      "outlet",
      "publication",
      "media",
      "organisation",
      "organization",
      "company",
    ]);
    const organisation = pick(row, ["organisation", "organization", "company"]) || outlet;
    const beat = pick(row, ["beat", "press_field", "topic", "topics"]);
    const country = pick(row, ["country", "market", "region"]);
    const role = pick(row, ["role", "title", "job_title", "position"]);
    const phone = pick(row, ["phone", "telephone", "mobile"]);
    const website = pick(row, ["website", "url", "profile"]);
    const preferred = pick(row, ["preferred_topics", "topics"]);

    if (!name && !email && !outlet) {
      skipped++;
      continue;
    }

    const tags = ["Press"];
    const pressFields = {
      is_press: true,
      beat,
      outlet: outlet || organisation,
      country,
      preferred_topics: preferred || beat,
      organisation,
      role,
      phone,
      website,
      tags,
    };

    if (email && byEmail.has(email)) {
      const existingContact = byEmail.get(email) as Contact;
      const nextTags = Array.from(
        new Set([...(existingContact.tags || []), "Press"])
      );
      await updateContact(existingContact.id, {
        is_press: true,
        beat,
        outlet: outlet || organisation,
        country,
        preferred_topics: preferred || beat,
        organisation,
        role,
        phone,
        website,
        tags: nextTags,
        name: name || existingContact.name,
      });
      contactIds.push(existingContact.id);
      updated++;
    } else {
      const item = await createContact({
        name: name || outlet || "Press contact",
        kind: "person",
        email,
        services: "",
        notes: "",
        user_id: null,
        last_contacted_at: null,
        ...pressFields,
      });
      byEmail.set(email || item.id, item);
      contactIds.push(item.id);
      created++;
    }
  }

  if (mediaListId && contactIds.length) {
    const { updateMediaList, listMediaLists } = await import("@/lib/data/repos");
    const lists = await listMediaLists();
    const list = lists.find((l) => l.id === mediaListId);
    if (list) {
      const merged = Array.from(new Set([...list.contact_ids, ...contactIds]));
      await updateMediaList(mediaListId, { contact_ids: merged });
    }
  }

  return jsonOk({ created, updated, skipped, contact_ids: contactIds });
}
