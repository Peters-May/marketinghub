import Link from "next/link";
import type { NewsroomSettings } from "@/lib/types";
import { BRAND_LOGO_SRC } from "@/components/shell/BrandLockup";

export type NewsroomSection = "news" | "media" | "release";

const linkBase =
  "rounded-sm px-1 py-1 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007DC5]";

function NavLink({
  href,
  current,
  children,
  className = "",
}: {
  href: string;
  current?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`${linkBase} ${
        current
          ? "font-medium text-[#0B2545] underline decoration-[#007DC5] decoration-2 underline-offset-[10px]"
          : "text-[#4D5C6A] hover:text-[#0B2545]"
      } ${className}`}
    >
      {children}
    </Link>
  );
}

/**
 * Shared header for the public newsroom, release pages and media kit.
 */
export function NewsroomHeader({
  settings,
  active = "news",
}: {
  settings: NewsroomSettings;
  active?: NewsroomSection;
}) {
  const logo = settings.logo_url || BRAND_LOGO_SRC;
  return (
    <header className="border-b border-[#E3E6E9] bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-4">
        <Link
          href="/newsroom"
          className="flex items-center gap-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007DC5]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="Peters & May" className="h-9 w-auto" />
          <span className="h-7 w-px bg-[#E3E6E9]" aria-hidden />
          <span className="font-display text-lg tracking-tight text-[#0B2545]">
            Newsroom
          </span>
        </Link>
        <nav aria-label="Newsroom" className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <NavLink href="/newsroom#releases" current={active === "news"}>
            Press releases
          </NavLink>
          <NavLink href="/media" current={active === "media"}>
            Media kit
          </NavLink>
          <NavLink href="/newsroom#press-office">Press contacts</NavLink>
          <a
            href="https://www.petersandmay.com"
            className={`${linkBase} hidden text-[#4D5C6A] hover:text-[#0B2545] md:inline`}
          >
            petersandmay.com
          </a>
        </nav>
      </div>
    </header>
  );
}
