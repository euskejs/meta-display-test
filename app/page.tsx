"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { isChannel, MAX_MESSAGE_LENGTH } from "@/lib/messages";

export default function Home() {
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("");
  const [displayUrl, setDisplayUrl] = useState("");
  const [status, setStatus] = useState("Ready to send");
  const [sending, setSending] = useState(false);
  useEffect(() => {
    // Load the browser's pairing after hydration, keeping the server render stable.
    Promise.resolve().then(() => {
      const fromUrl = new URLSearchParams(window.location.search).get("channel");
      let saved: string | null = null;
      try { saved = localStorage.getItem("meta-display-channel"); } catch { /* URL still allows recovery. */ }
      const id = isChannel(fromUrl) ? fromUrl : isChannel(saved) ? saved : crypto.randomUUID();
      try { localStorage.setItem("meta-display-channel", id); } catch { /* Show the link even without storage. */ }
      setChannel(id);
      setDisplayUrl(`${window.location.origin}/display?channel=${id}`);
      window.history.replaceState(null, "", `/?channel=${id}`);
    });
  }, []);
  const previewMessage = useMemo(() => message.trim() || "Your message preview", [message]);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending || !channel) return;
    if (!message.trim()) { setStatus("Please enter text before sending."); return; }
    setSending(true);
    setStatus("Sending…");
    try {
      const response = await fetch("/api/message", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, message }), signal: AbortSignal.timeout(12000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Message could not be saved.");
      setStatus("Message saved. Your open glasses display will update shortly.");
    } catch (error) {
      setStatus(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Connection timed out. Please try again.");
    } finally { setSending(false); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(displayUrl); setStatus("Display link copied. Add it in Meta AI once."); }
    catch { setStatus("Select the display link above and copy it manually."); }
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
                maxLength={MAX_MESSAGE_LENGTH}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/40"
                placeholder="Type the message you want to show on the glasses"
              />
            </label>

            <p className="text-sm text-slate-400">{message.length}/{MAX_MESSAGE_LENGTH} characters</p>
            <div className="rounded-2xl border border-cyan-400/20 p-4">
              <label htmlFor="display-link" className="mb-2 block text-sm font-medium text-slate-200">Your glasses display link</label>
              <input id="display-link" readOnly value={displayUrl} onFocus={(event) => event.target.select()} className="w-full rounded-lg bg-slate-950 p-3 text-sm text-cyan-200" />
              <p className="mt-2 text-sm text-slate-300">Add this link in Meta AI once. Keep the display app open on your glasses, then send messages below. Bookmark this composer to return to the same display.</p>
              <button type="button" onClick={copyLink} disabled={!displayUrl} className="mt-3 rounded-full border border-white/20 px-4 py-2 text-sm">Copy display link</button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={sending || !channel}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send to display"}
              </button>
              <a
                href={displayUrl || "/display"}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Open live display
              </a>
            </div>
          </form>

          <p role="status" className="mt-5 text-sm text-slate-300">Status: {status}</p>
        </section>

        <section className="w-full max-w-lg rounded-[36px] border border-cyan-400/30 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950 p-5 shadow-[0_0_40px_rgba(34,211,238,0.2)]">
          <div className="rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.25),_rgba(15,23,42,0.9)_55%)] p-5">
            <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-cyan-200">
              <span>Preview</span>
              <span>Ray-Ban</span>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-black/60 p-5 shadow-inner shadow-cyan-500/10">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="text-xs uppercase tracking-[0.22em] text-slate-300">Display</span>
              </div>

              <div className="min-h-[180px] rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-5">
                <p className="whitespace-pre-wrap text-xl font-medium leading-relaxed text-white [overflow-wrap:anywhere]">{previewMessage}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
