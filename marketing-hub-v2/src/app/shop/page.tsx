import Link from "next/link";
import { ClothingShopClient } from "@/components/merch/ClothingShopClient";

export const dynamic = "force-dynamic";

export default function PublicShopPage() {
  return (
    <div className="min-h-screen bg-[#E3E6E9] text-[#0B2545]">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-black/50">
              Peters &amp; May
            </p>
            <h1 className="font-display text-2xl leading-tight sm:text-3xl">
              Corporate clothing
            </h1>
          </div>
          <Link
            href="/login?next=/app/shop"
            className="text-sm text-[#007DC5] underline-offset-2 hover:underline"
          >
            Staff login
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="mb-8 max-w-2xl text-sm leading-relaxed text-black/65">
          Browse the catalogue, choose colour and size, then submit a request.
          There is no payment online — Marketing will fulfil orders.
        </p>
        <ClothingShopClient publicMode hideIntro />
      </main>

      <footer className="border-t border-black/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-black/50 sm:px-6">
          <span>Peters &amp; May Marketing</span>
          <Link href="/app" className="hover:text-[#0B2545]">
            Marketing Hub
          </Link>
        </div>
      </footer>
    </div>
  );
}
