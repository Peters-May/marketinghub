"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { AssetUploadField } from "@/components/content/AssetUploadField";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import {
  RELEASE_BLOCK_GROUPS,
  createReleaseBlock,
  emptyReleasePerson,
} from "@/lib/pr/release-blocks";
import { parseAssetUrls } from "@/lib/data/normalize";
import { uid } from "@/lib/utils";
import type { ReleaseBlock, ReleasePerson } from "@/lib/types";

export type ReleaseSpokesperson = {
  id: string;
  name: string;
  role: string;
  organisation: string;
  email: string;
  phone: string;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass = "w-full rounded-md border border-brand/15 px-3 py-2 text-sm";

function PersonFields({
  people,
  onChange,
  spokespeople,
}: {
  people: ReleasePerson[];
  onChange: (people: ReleasePerson[]) => void;
  spokespeople?: ReleaseSpokesperson[];
}) {
  const rows = people.length ? people : [emptyReleasePerson()];
  return (
    <div className="space-y-3">
      {spokespeople && spokespeople.length > 0 ? (
        <select
          className={inputClass}
          defaultValue=""
          onChange={(event) => {
            const person = spokespeople.find((row) => row.id === event.target.value);
            event.target.value = "";
            if (!person) return;
            onChange([
              ...rows.filter((row) => row.name || row.email),
              {
                name: person.name,
                role: person.role,
                organisation: person.organisation,
                email: person.email,
                phone: person.phone,
              },
            ]);
          }}
        >
          <option value="">Add a spokesperson…</option>
          {spokespeople.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      ) : null}
      {rows.map((person, index) => (
        <div key={index} className="grid gap-2 rounded-lg border border-brand/10 p-3 sm:grid-cols-2">
          {(
            [
              ["name", "Name"],
              ["role", "Role"],
              ["organisation", "Organisation"],
              ["email", "Email"],
              ["phone", "Phone"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                className={inputClass}
                value={person[key]}
                onChange={(event) => {
                  const next = rows.slice();
                  next[index] = { ...person, [key]: event.target.value };
                  onChange(next);
                }}
              />
            </Field>
          ))}
          <div className="flex items-end">
            <button
              type="button"
              className="text-xs text-muted underline"
              onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="text-sm text-accent underline"
        onClick={() => onChange([...rows, emptyReleasePerson()])}
      >
        Add person
      </button>
    </div>
  );
}

function BlockFields({
  block,
  spokespeople,
  onChange,
}: {
  block: ReleaseBlock;
  spokespeople: ReleaseSpokesperson[];
  onChange: (block: ReleaseBlock) => void;
}) {
  switch (block.type) {
    case "text":
    case "lead":
    case "annotation":
      return (
        <RichTextEditor
          value={block.html}
          onChange={(html) => onChange({ ...block, html })}
          minHeight={block.type === "text" ? "160px" : "96px"}
          placeholder={
            block.type === "lead"
              ? "The standfirst"
              : block.type === "annotation"
                ? "A short note"
                : "Write this section"
          }
        />
      );
    case "header":
    case "subheader":
      return (
        <input
          className={`w-full border-0 bg-transparent font-display outline-none ${
            block.type === "header" ? "text-2xl" : "text-xl"
          }`}
          value={block.text}
          aria-label={block.type === "header" ? "Header" : "Sub header"}
          placeholder={block.type === "header" ? "Header" : "Sub header"}
          onChange={(event) => onChange({ ...block, text: event.target.value })}
        />
      );
    case "ul":
    case "ol": {
      const items = block.items.length ? block.items : [""];
      return (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex gap-2">
              <input
                className={inputClass}
                value={item}
                onChange={(event) => {
                  const next = items.slice();
                  next[index] = event.target.value;
                  onChange({ ...block, items: next });
                }}
              />
              <button
                type="button"
                className="text-xs text-muted"
                onClick={() =>
                  onChange({ ...block, items: items.filter((_, row) => row !== index) })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm text-accent underline"
            onClick={() => onChange({ ...block, items: [...items, ""] })}
          >
            Add item
          </button>
        </div>
      );
    }
    case "quote":
      return (
        <div className="space-y-2">
          <textarea
            className={inputClass}
            rows={3}
            value={block.text}
            aria-label="Quote"
            placeholder="The quote"
            onChange={(event) => onChange({ ...block, text: event.target.value })}
          />
          <input
            className={inputClass}
            value={block.attribution}
            aria-label="Quote attribution"
            placeholder="Name, role"
            onChange={(event) => onChange({ ...block, attribution: event.target.value })}
          />
        </div>
      );
    case "table": {
      const rows = block.rows.length ? block.rows : [["", ""]];
      const width = Math.max(...rows.map((row) => row.length), 1);
      const padded = rows.map((row) => {
        const next = row.slice(0, width);
        while (next.length < width) next.push("");
        return next;
      });
      return (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {padded.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="border border-brand/15 p-1">
                        <input
                          className="w-full min-w-[6rem] px-2 py-1"
                          value={cell}
                          onChange={(event) => {
                            const next = padded.map((line) => line.slice());
                            next[rowIndex][cellIndex] = event.target.value;
                            onChange({ ...block, rows: next });
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 text-sm">
            <button
              type="button"
              className="text-accent underline"
              onClick={() => onChange({ ...block, rows: [...padded, padded[0].map(() => "")] })}
            >
              Add row
            </button>
            <button
              type="button"
              className="text-accent underline"
              onClick={() =>
                onChange({ ...block, rows: padded.map((row) => [...row, ""]) })
              }
            >
              Add column
            </button>
          </div>
        </div>
      );
    }
    case "divider":
      return <hr className="border-brand/15" />;
    case "image":
    case "full_image":
      return (
        <div className="space-y-2">
          <AssetUploadField
            label={block.type === "full_image" ? "Full width image" : "Image"}
            value={block.src}
            onChange={(src) => onChange({ ...block, src })}
          />
          <input
            className={inputClass}
            value={block.alt}
            placeholder="Alt text"
            onChange={(event) => onChange({ ...block, alt: event.target.value })}
          />
          <input
            className={inputClass}
            value={block.caption}
            placeholder="Caption"
            onChange={(event) => onChange({ ...block, caption: event.target.value })}
          />
        </div>
      );
    case "gallery":
      return (
        <div className="space-y-2">
          <AssetUploadField
            multiple
            label="Gallery"
            value={block.images.map((image) => image.src).join("\n")}
            onChange={(joined) => {
              const urls = parseAssetUrls(joined);
              onChange({
                ...block,
                images: urls.map(
                  (src) => block.images.find((image) => image.src === src) ?? { src, alt: "" }
                ),
              });
            }}
          />
          {block.images.map((image, index) => (
            <input
              key={image.src}
              className={inputClass}
              value={image.alt}
              placeholder="Alt text"
              onChange={(event) => {
                const images = block.images.slice();
                images[index] = { ...image, alt: event.target.value };
                onChange({ ...block, images });
              }}
            />
          ))}
        </div>
      );
    case "full_video":
      return (
        <div className="space-y-2">
          <AssetUploadField
            label="Video"
            hint="Upload a video file, or paste a direct file URL."
            value={block.src}
            onChange={(src) => onChange({ ...block, src })}
          />
          <AssetUploadField
            label="Poster image"
            value={block.poster}
            onChange={(poster) => onChange({ ...block, poster })}
          />
        </div>
      );
    case "button":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className={inputClass}
            value={block.label}
            aria-label="Button label"
            placeholder="Button label"
            onChange={(event) => onChange({ ...block, label: event.target.value })}
          />
          <input
            className={inputClass}
            value={block.href}
            aria-label="Button link"
            placeholder="https://"
            onChange={(event) => onChange({ ...block, href: event.target.value })}
          />
        </div>
      );
    case "authors":
      return (
        <PersonFields
          people={block.people}
          onChange={(next) => onChange({ ...block, people: next })}
        />
      );
    case "spokespeople":
      return (
        <PersonFields
          people={block.people}
          spokespeople={spokespeople}
          onChange={(next) => onChange({ ...block, people: next })}
        />
      );
    default:
      return null;
  }
}

const BLOCK_LABEL: Record<ReleaseBlock["type"], string> = {
  text: "Text",
  header: "Header",
  subheader: "Sub header",
  lead: "Lead",
  ul: "Unordered list",
  ol: "Ordered list",
  quote: "Quote",
  annotation: "Annotation",
  table: "Table",
  divider: "Divider",
  image: "Image",
  gallery: "Gallery",
  full_image: "Full width image",
  full_video: "Full width video",
  button: "Call-to-action button",
  authors: "Authors",
  spokespeople: "Spokespeople",
};

export function ReleaseBlockEditor({
  blocks,
  spokespeople,
  onChange,
}: {
  blocks: ReleaseBlock[];
  spokespeople: ReleaseSpokesperson[];
  onChange: (blocks: ReleaseBlock[]) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  function add(type: ReleaseBlock["type"]) {
    onChange([...blocks, createReleaseBlock(type, uid("blk"))]);
    setMenuOpen(false);
  }

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= blocks.length) return;
    const next = blocks.slice();
    const [row] = next.splice(index, 1);
    next.splice(nextIndex, 0, row);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <section key={block.id} className="rounded-lg border border-brand/10 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-wide text-muted">
              {BLOCK_LABEL[block.type]}
            </p>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Move up" onClick={() => move(index, -1)}>
                <ChevronUp className="h-4 w-4 text-muted" />
              </button>
              <button type="button" aria-label="Move down" onClick={() => move(index, 1)}>
                <ChevronDown className="h-4 w-4 text-muted" />
              </button>
              <button
                type="button"
                aria-label="Remove block"
                onClick={() => onChange(blocks.filter((row) => row.id !== block.id))}
              >
                <Trash2 className="h-4 w-4 text-muted" />
              </button>
            </div>
          </div>
          <BlockFields
            block={block}
            spokespeople={spokespeople}
            onChange={(next) =>
              onChange(blocks.map((row) => (row.id === block.id ? next : row)))
            }
          />
        </section>
      ))}

      <div className="relative">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Plus className="h-4 w-4" />
          Add block
        </button>
        {menuOpen ? (
          <div className="absolute z-20 mt-2 w-full max-w-md rounded-xl border border-border bg-white p-3 shadow-lg">
            {RELEASE_BLOCK_GROUPS.map((group) => (
              <div key={group.label} className="mb-3 last:mb-0">
                <p className="text-xs uppercase tracking-wide text-muted">{group.label}</p>
                <ul className="mt-1">
                  {group.items.map((item) => (
                    <li key={item.type}>
                      <button
                        type="button"
                        className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-mist"
                        onClick={() => add(item.type)}
                      >
                        <span className="text-sm text-brand">{item.label}</span>
                        <span className="text-xs text-muted">{item.hint}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
