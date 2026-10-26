"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { format, parseISO } from "date-fns";
import { Draggable } from "@fullcalendar/interaction";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export type IdeaPanelPost = {
  id: string;
  text: string;
  scheduledAt: string | null;
  platform: string;
  platforms: string[];
  category?: string;
  status?: string;
  owner?: string;
};

const UNCATEGORISED = "Uncategorised";

function platformLabel(post: IdeaPanelPost): string {
  const names = post.platforms.length ? post.platforms : [post.platform];
  return names.filter(Boolean).join(" · ") || "Social";
}

function categoryOf(post: IdeaPanelPost): string {
  const value = (post.category || "").trim();
  return value || UNCATEGORISED;
}

function ParkedIdeaCard({
  post,
  onOpen,
  onPlace,
  preview,
}: {
  post: IdeaPanelPost;
  onOpen: (id: string) => void;
  onPlace: (id: string, dueDate: string) => void;
  preview?: ReactNode;
}) {
  const [day, setDay] = useState("");

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-sand/40">
      <div
        role="button"
        tabIndex={0}
        data-idea-id={post.id}
        data-idea-title={post.text || "Untitled"}
        className="flex cursor-grab items-start gap-2 px-2.5 py-2 text-left active:cursor-grabbing"
        onClick={() => onOpen(post.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(post.id);
          }
        }}
      >
        <GripVertical
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400"
          aria-hidden
        />
        {preview ? (
          <div className="min-w-0 flex-1 [&_.hub-cal-card]:border-0 [&_.hub-cal-card]:bg-transparent [&_.hub-cal-card]:p-0 [&_.hub-cal-card]:shadow-none">
            {preview}
            {post.owner ? (
              <span className="mt-1 block text-[10px] text-muted">
                Suggested by {post.owner}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="min-w-0">
            <span className="block line-clamp-2 text-xs font-medium leading-snug text-slate-800">
              {post.text || "Untitled"}
            </span>
            <span className="mt-0.5 block text-[10px] text-muted">
              {[
                post.status,
                platformLabel(post),
                categoryOf(post),
                post.owner ? `Suggested by ${post.owner}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 border-t border-slate-200/80 px-2.5 py-2">
        <label className="sr-only" htmlFor={`place-${post.id}`}>
          Place on date
        </label>
        <input
          id={`place-${post.id}`}
          className="field min-w-0 flex-1 px-2 py-1.5 text-xs"
          type="date"
          value={day}
          onChange={(event) => setDay(event.target.value)}
        />
        <button
          type="button"
          className="btn-secondary shrink-0 px-2.5 py-1.5 text-xs"
          disabled={!day}
          onClick={() => onPlace(post.id, day)}
        >
          Place
        </button>
      </div>
    </div>
  );
}

export function SocialIdeasPanel({
  panelRef,
  parked,
  placed,
  creating,
  parkingId,
  parkingActive,
  kinds,
  renderPreview,
  onOpen,
  onCreate,
  onPlace,
  onPark,
}: {
  panelRef: RefObject<HTMLElement>;
  parked: IdeaPanelPost[];
  placed: IdeaPanelPost[];
  creating: boolean;
  parkingId: string | null;
  parkingActive: boolean;
  /** When set, a new idea can be social, editorial, or another type. */
  kinds?: { value: string; label: string }[];
  /** Same card as the calendar day cell: image, channels, title, status. */
  renderPreview?: (post: IdeaPanelPost) => ReactNode;
  onOpen: (id: string) => void;
  onCreate: (title: string, caption: string, kind?: string) => Promise<boolean>;
  onPlace: (id: string, dueDate: string) => void;
  onPark: (id: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [kind, setKind] = useState(kinds?.[0]?.value ?? "");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [adding, setAdding] = useState(false);

  const categories = useMemo(() => {
    const present = new Set(parked.map(categoryOf));
    return Array.from(present).sort((a, b) => {
      if (a === UNCATEGORISED) return 1;
      if (b === UNCATEGORISED) return -1;
      return a.localeCompare(b);
    });
  }, [parked]);

  const visibleParked = useMemo(() => {
    if (categoryFilter === "all") return parked;
    return parked.filter((post) => categoryOf(post) === categoryFilter);
  }, [parked, categoryFilter]);

  useEffect(() => {
    if (categoryFilter !== "all" && !categories.includes(categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [categories, categoryFilter]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const draggable = new Draggable(el, {
      itemSelector: "[data-idea-id]",
      minDistance: 8,
      appendTo: document.body,
      eventData(eventEl) {
        return {
          title: eventEl.getAttribute("data-idea-title") || "Untitled",
          create: false,
        };
      },
    });
    return () => draggable.destroy();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextTitle = title;
    const nextCaption = caption;
    setTitle("");
    setCaption("");
    const ok = await onCreate(nextTitle, nextCaption, kind || undefined);
    if (!ok) {
      setTitle(nextTitle);
      setCaption(nextCaption);
      return;
    }
    setAdding(false);
  }

  return (
    <aside
      ref={panelRef}
      className={cn(
        "surface-card flex max-h-[28rem] w-full shrink-0 flex-col overflow-hidden max-lg:order-first lg:sticky lg:top-4 lg:order-none lg:h-[calc(100vh-11rem)] lg:max-h-[calc(100vh-11rem)]",
        parkingActive && "ring-2 ring-sky-300"
      )}
      aria-label="Unscheduled posts"
    >
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-brand">Unscheduled</h2>
          <span className="text-[11px] text-muted">{parked.length}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Posts without a date stay here. Drag one onto a day, or drop a card
          back here to hold it for later.
        </p>
        {parkingActive ? (
          <p className="mt-2 text-xs font-medium text-sky-800">
            Drop here to take the date off and keep this post.
          </p>
        ) : null}
        <label className="mt-3 block">
          <span className="sr-only">Filter by category</span>
          <select
            className="field px-2 py-1.5 text-xs"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            aria-label="Filter unscheduled posts by category"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border-b border-border px-4 py-3">
        <button
          type="button"
          className="btn-secondary w-full px-2.5 py-1.5 text-xs"
          onClick={() => setAdding((open) => !open)}
        >
          {adding ? "Close" : "Add idea"}
        </button>
      </div>

      {adding ? (
      <form
        onSubmit={(event) => void submit(event)}
        className="space-y-2 border-b border-border p-4"
      >
        <div>
          <label className="label" htmlFor="idea-title">
            New idea
          </label>
          <input
            id="idea-title"
            className="field"
            placeholder="Working title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="idea-caption">
            Caption
          </label>
          <textarea
            id="idea-caption"
            className="field min-h-[72px]"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />
        </div>
        {kinds && kinds.length > 0 ? (
          <div>
            <label className="label" htmlFor="idea-kind">
              Type
            </label>
            <select
              id="idea-kind"
              className="field"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              {kinds.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button type="submit" className="btn-primary w-full" disabled={creating}>
          {creating ? "Saving…" : "Add idea"}
        </button>
      </form>
      ) : null}

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {parked.length === 0 ? (
          <p className="px-1 py-3 text-xs text-muted">
            Nothing waiting. Add an idea here, or drag a card off the calendar
            to hold it without a date.
          </p>
        ) : visibleParked.length === 0 ? (
          <p className="px-1 py-3 text-xs text-muted">
            Nothing in {categoryFilter}. Choose All categories to see the rest.
          </p>
        ) : (
          visibleParked.map((post) => (
            <ParkedIdeaCard
              key={post.id}
              post={post}
              onOpen={onOpen}
              onPlace={onPlace}
              preview={renderPreview?.(post)}
            />
          ))
        )}
      </div>

      {placed.length > 0 ? (
        <div className="max-h-40 overflow-y-auto border-t border-border p-3">
          <h3 className="px-1 pb-2 text-xs font-semibold text-brand">
            On the calendar
          </h3>
          <ul className="space-y-2">
            {placed.map((post) => (
              <li
                key={post.id}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => onOpen(post.id)}
                >
                  <span className="block line-clamp-2 text-xs font-medium leading-snug text-slate-800">
                    {post.text || "Untitled"}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted">
                    {post.scheduledAt
                      ? format(parseISO(post.scheduledAt), "d MMM yyyy")
                      : "Dated"}
                    {" · "}
                    {platformLabel(post)}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-secondary mt-2 w-full px-2.5 py-1.5 text-xs"
                  disabled={parkingId === post.id}
                  onClick={() => onPark(post.id)}
                >
                  {parkingId === post.id ? "Moving…" : "Hold without a date"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
