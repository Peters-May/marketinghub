import Link from "next/link";
import { COMPANY_BOILERPLATE } from "@/lib/brand/factsheet";
import { MEDIA_DESK_EMAIL } from "@/lib/pr/newsroom-view";

export function NewsroomFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 bg-[#071A2E] text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <p className="font-display text-lg">Peters &amp; May</p>
          <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-white/70">
            {COMPANY_BOILERPLATE}
          </p>
        </div>
        <div>
          <h2 className="font-display text-base">Media enquiries</h2>
          <a
            href={`mailto:${MEDIA_DESK_EMAIL}`}
            className="mt-3 inline-block text-sm text-white underline underline-offset-4 hover:text-white/80"
          >
            {MEDIA_DESK_EMAIL}
          </a>
        </div>
        <nav aria-label="Footer">
          <h2 className="font-display text-base">Links</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            <li>
              <a href="https://www.petersandmay.com" className="hover:text-white">
                petersandmay.com
              </a>
            </li>
            <li>
              <Link href="/media" className="hover:text-white">
                Media kit
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-white">
                Staff login
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-6 py-4 text-xs text-white/50">
          © {year} Peters &amp; May. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
