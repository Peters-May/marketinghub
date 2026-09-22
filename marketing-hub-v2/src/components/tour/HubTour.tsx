"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  isTourCompleted,
  markTourCompleted,
  sessionRoleToTourAudience,
  type TourAudience,
} from "@/lib/tour/storage";
import { tourStepsFor, tourWelcomeCopy, type TourStep } from "@/lib/tour/steps";
import { dispatchTourPrepare } from "@/lib/tour/bus";
import { cn } from "@/lib/utils";
import type { HubViewMode } from "@/lib/nav";
import type { UserRole } from "@/lib/types";

type TourContextValue = {
  startTour: () => void;
  audience: TourAudience;
};

const TourContext = createContext<TourContextValue | null>(null);

export function useHubTour() {
  return useContext(TourContext);
}

type Rect = { top: number; left: number; width: number; height: number };

/** Fixed tip width — avoids remeasure flicker after first paint. */
const TIP_W = 320;
const TIP_H_EST = 200;

function readRect(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 && r.height < 2) return null;
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  };
}

function pickVisibleElement(selector: string): Element | null {
  // Prefer left-to-right selector parts so fallbacks come last
  const parts = selector
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const groups = parts.length > 0 ? parts : [selector];

  for (const part of groups) {
    const nodes = Array.from(document.querySelectorAll(part));
    for (const node of nodes) {
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const r = node.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      return node;
    }
  }
  return null;
}

function pathMatches(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  if (href === "/media")
    return pathname === "/media" || pathname.startsWith("/media/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function needsMobileNav(selector: string) {
  return (
    selector.includes('data-tour="nav-') ||
    selector.includes("sidebar") ||
    selector.includes("view-toggle") ||
    selector.includes("account-menu")
  );
}

async function waitForSelector(
  selector: string,
  timeoutMs = 2000
): Promise<Element | null> {
  const start = Date.now();
  const el = pickVisibleElement(selector);
  if (el) return el;
  while (Date.now() - start < timeoutMs) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const found = pickVisibleElement(selector);
    if (found) return found;
  }
  return pickVisibleElement(selector);
}

async function waitForPath(
  getPath: () => string,
  href: string,
  timeoutMs = 2500
) {
  if (pathMatches(getPath(), href)) return;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pathMatches(getPath(), href)) return;
    await new Promise((r) => setTimeout(r, 16));
  }
}

function nextFrame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function tooltipPosition(
  rect: Rect,
  placement: TourStep["placement"],
  tipW: number,
  tipH: number
) {
  const gap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = rect.top;
  let left = rect.left;

  const prefer = placement ?? "auto";
  const tryRight = () => {
    left = rect.left + rect.width + gap;
    top = rect.top + rect.height / 2 - tipH / 2;
  };
  const tryLeft = () => {
    left = rect.left - tipW - gap;
    top = rect.top + rect.height / 2 - tipH / 2;
  };
  const tryBottom = () => {
    left = rect.left + rect.width / 2 - tipW / 2;
    top = rect.top + rect.height + gap;
  };
  const tryTop = () => {
    left = rect.left + rect.width / 2 - tipW / 2;
    top = rect.top - tipH - gap;
  };

  if (prefer === "right") tryRight();
  else if (prefer === "left") tryLeft();
  else if (prefer === "bottom") tryBottom();
  else if (prefer === "top") tryTop();
  else if (rect.left < 280 && rect.width < 320) tryRight();
  else tryBottom();

  left = Math.max(12, Math.min(left, vw - tipW - 12));
  top = Math.max(12, Math.min(top, vh - tipH - 12));
  return { top, left };
}

type HubTourProps = {
  userKey: string;
  accessRole?: UserRole;
  audience?: TourAudience;
  onEnsureAdminView?: () => void;
  hubView?: HubViewMode;
  onOpenMobileNav?: () => void;
  className?: string;
};

export function HubTourProvider({
  children,
  userKey,
  accessRole,
  audience: audienceProp,
  onEnsureAdminView,
  hubView,
  onOpenMobileNav,
}: HubTourProps & { children: React.ReactNode }) {
  const audience = audienceProp ?? sessionRoleToTourAudience(accessRole);
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const [phase, setPhase] = useState<"idle" | "welcome" | "running">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tipReady, setTipReady] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipHRef = useRef(TIP_H_EST);
  const steps = useMemo(() => tourStepsFor(audience), [audience]);
  const welcome = useMemo(() => tourWelcomeCopy(audience), [audience]);
  const runningRef = useRef(false);
  const pendingRunRef = useRef(false);
  const stepIndexRef = useRef(0);
  const onOpenMobileNavRef = useRef(onOpenMobileNav);
  onOpenMobileNavRef.current = onOpenMobileNav;
  const onEnsureAdminViewRef = useRef(onEnsureAdminView);
  onEnsureAdminViewRef.current = onEnsureAdminView;

  const finish = useCallback(
    (persist: boolean) => {
      runningRef.current = false;
      pendingRunRef.current = false;
      setLeaveConfirmOpen(false);
      setTipReady(false);
      setAdvancing(false);
      setPhase("idle");
      setStepIndex(0);
      setRect(null);
      if (persist) markTourCompleted(audience, userKey);
    },
    [audience, userKey]
  );

  const requestLeave = useCallback(() => {
    if (phase === "running") {
      setLeaveConfirmOpen(true);
      return;
    }
    finish(dontShowAgain);
  }, [phase, dontShowAgain, finish]);

  const startTour = useCallback(() => {
    if (audience === "admin") onEnsureAdminViewRef.current?.();
    setDontShowAgain(true);
    setLeaveConfirmOpen(false);
    setTipReady(false);
    setRect(null);
    setStepIndex(0);
    setPhase("welcome");
  }, [audience]);

  useEffect(() => {
    if (!userKey) return;
    if (isTourCompleted(audience, userKey)) return;
    const t = window.setTimeout(() => {
      if (!runningRef.current && phase === "idle") {
        if (audience === "admin") onEnsureAdminViewRef.current?.();
        setPhase("welcome");
      }
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, userKey]);

  /** Navigate + prepare tabs + measure before painting the tip. */
  const showStep = useCallback(
    async (index: number) => {
      const step = steps[index];
      if (!step) return;

      setAdvancing(true);
      setTipReady(false);

      if (audience === "admin") onEnsureAdminViewRef.current?.();

      const onTargetPath =
        !step.href || pathMatches(pathnameRef.current, step.href);

      if (step.href && !onTargetPath) {
        setRect(null);
        router.push(step.href);
        await waitForPath(() => pathnameRef.current, step.href);
      }

      if (
        typeof window !== "undefined" &&
        window.innerWidth < 768 &&
        needsMobileNav(step.selector)
      ) {
        onOpenMobileNavRef.current?.();
        await nextFrame();
      }

      if (step.prepare?.length) {
        dispatchTourPrepare(step.prepare);
        // Let React apply tab / selection updates
        await nextFrame();
        await nextFrame();
        await new Promise((r) => setTimeout(r, 30));
      }

      const el = await waitForSelector(step.selector, 2000);
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
      await nextFrame();

      let nextRect = readRect(pickVisibleElement(step.selector) ?? el);
      if (!nextRect) {
        await new Promise((r) => setTimeout(r, 40));
        nextRect = readRect(pickVisibleElement(step.selector));
      }

      stepIndexRef.current = index;
      setStepIndex(index);
      setRect(nextRect);
      setPhase("running");
      setTipReady(Boolean(nextRect));
      setAdvancing(false);
    },
    [steps, audience, router]
  );

  const beginSteps = () => {
    runningRef.current = true;
    setTipReady(false);
    setRect(null);
    setPhase("running");
    if (audience === "admin") {
      onEnsureAdminViewRef.current?.();
      if (hubView && hubView !== "admin") {
        pendingRunRef.current = true;
        setAdvancing(true);
        return;
      }
    }
    pendingRunRef.current = false;
    void showStep(0);
  };

  useEffect(() => {
    if (!pendingRunRef.current) return;
    if (audience !== "admin") return;
    if (hubView !== "admin") {
      onEnsureAdminViewRef.current?.();
      return;
    }
    pendingRunRef.current = false;
    void showStep(0);
  }, [hubView, audience, showStep]);

  // Keep spotlight aligned on resize/scroll only (not on step change)
  useEffect(() => {
    if (phase !== "running") return;
    const step = steps[stepIndex];
    if (!step) return;

    const sync = () => {
      const el = pickVisibleElement(step.selector);
      const next = readRect(el);
      if (next) setRect(next);
    };

    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [phase, stepIndex, steps]);

  // Soft-prefetch the next route while the user reads
  useEffect(() => {
    if (phase !== "running") return;
    const next = steps[stepIndex + 1];
    if (next?.href) router.prefetch(next.href);
  }, [phase, stepIndex, steps, router]);

  // Measure actual tip height once without shifting position mid-animation
  useEffect(() => {
    if (!tipReady || !tipRef.current) return;
    const h = tipRef.current.getBoundingClientRect().height;
    if (h > 40) tipHRef.current = h;
  }, [tipReady, stepIndex]);

  const goNext = () => {
    if (advancing) return;
    if (stepIndex >= steps.length - 1) {
      finish(dontShowAgain);
      return;
    }
    void showStep(stepIndex + 1);
  };

  const goBack = () => {
    if (advancing) return;
    if (stepIndex <= 0) {
      setPhase("welcome");
      setTipReady(false);
      setRect(null);
      return;
    }
    void showStep(stepIndex - 1);
  };

  const skip = () => requestLeave();
  const confirmLeave = () => finish(dontShowAgain);

  const ctx = useMemo(
    () => ({ startTour, audience }),
    [startTour, audience]
  );

  const step = steps[stepIndex];
  const tipPos =
    rect && tipReady && phase === "running"
      ? tooltipPosition(rect, step?.placement, TIP_W, tipHRef.current)
      : null;

  const pad = 8;
  const showTourChrome = phase === "running" && step;

  return (
    <TourContext.Provider value={ctx}>
      {children}

      {phase === "welcome" ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 md:left-sidebar"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hub-tour-welcome-title"
        >
          <div className="surface-card w-full max-w-md p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-accent">
                  Getting started
                </p>
                <h2
                  id="hub-tour-welcome-title"
                  className="mt-1 font-display text-2xl text-brand"
                >
                  {welcome.title}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted hover:bg-sand hover:text-foreground"
                aria-label="Close"
                onClick={() => finish(dontShowAgain)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-sm text-muted">{welcome.body}</p>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="accent-[var(--brand)]"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
              />
              Don&apos;t show this again
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => finish(dontShowAgain)}
              >
                Skip
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={beginSteps}
                disabled={advancing}
              >
                {advancing ? "Starting…" : "Start tour"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* preparing state uses running chrome with full dim */}
      {showTourChrome ? (
        <div className="fixed inset-0 z-[100] md:left-sidebar" aria-live="polite">
          <div
            className="pointer-events-auto absolute inset-0"
            onClick={skip}
            aria-hidden
          >
            {rect && tipReady ? (
              <div
                className="absolute rounded-xl ring-2 ring-accent"
                style={{
                  top: rect.top - pad,
                  left: rect.left - pad,
                  width: rect.width + pad * 2,
                  height: rect.height + pad * 2,
                  boxShadow: "0 0 0 9999px rgba(15, 28, 36, 0.55)",
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-black/45" />
            )}
          </div>

          {tipPos ? (
            <div
              ref={tipRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="hub-tour-step-title"
              className={cn(
                "pointer-events-auto absolute z-[101] rounded-2xl border border-border bg-white p-4 shadow-xl",
                advancing && "opacity-80"
              )}
              style={{
                top: tipPos.top,
                left: tipPos.left,
                width: TIP_W,
                maxWidth: "calc(100vw - 1.5rem)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium text-muted">
                    {stepIndex + 1} of {steps.length}
                  </p>
                  <h3
                    id="hub-tour-step-title"
                    className="mt-0.5 font-display text-lg text-brand"
                  >
                    {step.title}
                  </h3>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1 text-muted hover:bg-sand hover:text-foreground"
                  aria-label="Close tour"
                  onClick={skip}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-sm text-muted">{step.body}</p>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  className="accent-[var(--brand)]"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                />
                Don&apos;t show again when finished
              </label>
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1.5 text-xs"
                  onClick={skip}
                >
                  Skip tour
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary !px-3 !py-1.5 text-xs"
                    onClick={goBack}
                    disabled={advancing}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn-primary !px-3 !py-1.5 text-xs"
                    onClick={goNext}
                    disabled={advancing}
                  >
                    {advancing
                      ? "…"
                      : stepIndex >= steps.length - 1
                        ? "Done"
                        : "Next"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {leaveConfirmOpen ? (
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 md:left-sidebar"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="hub-tour-leave-title"
              aria-describedby="hub-tour-leave-desc"
              onClick={() => setLeaveConfirmOpen(false)}
            >
              <div
                className="surface-card w-full max-w-sm p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3
                  id="hub-tour-leave-title"
                  className="font-display text-xl text-brand"
                >
                  Leave the tour?
                </h3>
                <p id="hub-tour-leave-desc" className="mt-2 text-sm text-muted">
                  You can restart anytime from Account → Take a tour.
                </p>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="accent-[var(--brand)]"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                  />
                  Don&apos;t show this tour again
                </label>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setLeaveConfirmOpen(false)}
                  >
                    Keep going
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={confirmLeave}
                  >
                    Leave tour
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </TourContext.Provider>
  );
}

export const HubTour = HubTourProvider;
