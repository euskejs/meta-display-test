"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [message, setMessage] = useState("Meet me at the café in 10 minutes.");
  const [targetUrl, setTargetUrl] = useState("");
  const [status, setStatus] = useState("Ready to send");

  const previewMessage = useMemo(
    () => message.trim() || "Write a note to preview it in the glasses display.",
    [message],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload = message.trim();
    if (!payload) {
      setStatus("Please enter text before sending.");
      return;
    }

    const target = targetUrl.trim();

    if (target) {
      try {
        const destination = new URL(target, window.location.origin);
        destination.searchParams.set("message", payload);
        window.open(destination.toString(), "_blank", "noopener,noreferrer");
        setStatus(`Sending to ${destination.toString()}`);
        return;
      } catch {
        setStatus("That target URL is invalid. Try a full URL or leave it blank.");
        return;
      }
    }

    router.push(`/display?message=${encodeURIComponent(payload)}`);
    setStatus("Sent to the glasses display page");
  };

  return (
    <main className="min-h-screen bg-[#050816] px-6 py-10 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <section className="w-full max-w-xl rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-900/20 backdrop-blur-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-lg font-semibold text-slate-950">
              M
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Meta AI</p>
              <h1 className="text-2xl font-semibold">Ray-Ban Display Composer</h1>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Text to display</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={6}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/40"
                placeholder="Type the message you want to show on the glasses"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Target web app URL</span>
              <input
                type="url"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                placeholder="https://your-app.vercel.app/display"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/40"
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                className="inline-flex flex-1 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110"
              >
                Send to display
              </button>
              <a
                href="/display?message=hello"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Open demo display
              </a>
            </div>
          </form>

          <p className="mt-5 text-sm text-slate-300">Status: {status}</p>
        </section>

        <section className="w-full max-w-lg rounded-[36px] border border-cyan-400/30 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950 p-5 shadow-[0_0_40px_rgba(34,211,238,0.2)]">
          <div className="rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.25),_rgba(15,23,42,0.9)_55%)] p-5">
            <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-cyan-200">
              <span>Live</span>
              <span>Ray-Ban</span>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-black/60 p-5 shadow-inner shadow-cyan-500/10">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="text-xs uppercase tracking-[0.22em] text-slate-300">Display</span>
              </div>

              <div className="min-h-[180px] rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-5">
                <p className="text-xl font-medium leading-relaxed text-white">{previewMessage}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
