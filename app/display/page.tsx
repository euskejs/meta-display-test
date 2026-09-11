"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function DisplayContent() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message") ?? "Hello from your glasses display";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050816] px-6 py-10 text-white">
      <div className="w-full max-w-2xl rounded-[32px] border border-cyan-400/30 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950 p-5 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
        <div className="rounded-[26px] border border-white/10 bg-black/60 p-8">
          <div className="mb-6 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-cyan-200">
            <span>Ray-Ban</span>
            <span>Live</span>
          </div>

          <div className="rounded-3xl border border-cyan-400/20 bg-slate-950/80 p-8">
            <p className="text-3xl font-medium leading-relaxed text-white sm:text-4xl">
              {message}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function DisplayPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#050816] px-6 py-10 text-white">
          <div className="w-full max-w-xl rounded-[32px] border border-white/10 bg-slate-900/80 p-8 text-center text-xl text-cyan-200">
            Loading display...
          </div>
        </main>
      }
    >
      <DisplayContent />
    </Suspense>
  );
}
