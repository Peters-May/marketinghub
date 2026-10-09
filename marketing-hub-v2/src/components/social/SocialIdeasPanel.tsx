"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
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
};

function platformLabel(post: IdeaPanelPost): string {
  const names = post.platforms.length ? post.platforms : [post.platform];
  return names.filter(Boolean).join(" · ") || "Social";
}

function ParkedIdeaCard({
  post,
  onOpen,
  onPlace,
}: {
  post: IdeaPanelPost;
  onOpen: (id: string) => void;
  onPlace: (id: string, dueDate: string) => void;
}) {
  const [day, setDay] = useState("");

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-sand/40">
      <div
        role="button"
        tabIndex={0}
        data-idea-id={post.id}
        data-idea-title={post.text || "Idea"}
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
        <span className="min-w-0">
          <span className="block line-clamp-2 text-xs font-medium leading-snug text-slate-800">
            {post.text || "Untitled idea"}
          </span>
          <span className="mt-0.5 block text-[10px] text-muted">
            {platformLabel(post)}
          </span>
        </span>
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
  onOpen,
  onCreate,
  onPlace,
  onPark,
}: {
  panelRef: RefObject<HTMLElement | null>;
  parked: IdeaPanelPost[];
  placed: IdeaPanelPost[];
  creating: boolean;
  parkingId: string | null;
  parkingActive: boolean;
  onOpen: (id: string) => void;
  onCreate: (title: string, caption: string) => Promise<boolean>;
  onPlace: (id: string, dueDate: string) => void;
  onPark: (id: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const draggable = new Draggable(el, {
      itemSelector: "[data-idea-id]",
      minDistance: 8,
      appendTo: document.body,
      eventData(eventEl) {
        return {
          title: eventEl.getAttribute("data-idea-title") || "Idea",
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
    const ok = await onCreate(nextTitle, nextCaption);
    if (!ok) {
      setTitle(nextTitle);
      setCaption(nextCaption);
    }
  }

  return (
    <aside
      ref={panelRef}
      className={cn(
        "surface-card flex w-full shrink-0 flex-col xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:w-80 xl:overflow-y-auto",
        parkingActive && "ring-2 ring-sky-300"
      )}
      aria-label="Idea posts"
    >
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-brand">Ideas</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Fillers stay here, off the calendar, until you need them. Drag one
          onto a day, or drop a placed idea back here. They stay ideas.
        </p>
        {parkingActive ? (
          <p className="mt-2 text-xs font-medium text-sky-800">
            Drop here to park this post as an idea.
          </p>
        ) : null}
      </div>

      <form onSubmit={(event) => void submit(event)} className="space-y-2 border-b border-border p-4">
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
        <button type="submit" className="btn-primary w-full" disabled={creating}>
          {creating ? "Saving…" : "Add idea"}
        </button>
      </form>

      <div ref={listRef} className="space-y-2 p-3">
        {parked.length === 0 ? (
          <p className="px-1 py-3 text-xs text-muted">
            No parked ideas. Add one here so it does not take a calendar slot.
          </p>
        ) : (
          parked.map((post) => (
            <ParkedIdeaCard
              key={post.id}
              post={post}
              onOpen={onOpen}
              onPlace={onPlace}
            />
          ))
        )}
      </div>

      {placed.length > 0 ? (
        <div className="border-t border-border p-3">
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
                    {post.text || "Untitled idea"}
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
                  {parkingId === post.id ? "Moving…" : "Move to ideas"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
