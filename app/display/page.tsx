"use client";
import { Suspense, useEffect, useState } from "react";
import { resolveDisplayPairing } from "@/lib/display-pairing";
import { isChannel } from "@/lib/messages";
import GlassesTeamMenu from "./team-menu";
function DisplayContent() {
  const [pairing, setPairing] = useState<ReturnType<typeof resolveDisplayPairing> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const resolved = resolveDisplayPairing(window.location.search, {
          getItem: (key) => window.localStorage.getItem(key),
          setItem: (key, value) => window.localStorage.setItem(key, value),
        }, () => crypto.randomUUID());
        const url = new URL(window.location.href);
        url.searchParams.delete("channel");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        setPairing(resolved);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to set up this display."); }
    });
    return () => { cancelled = true; };
  }, []);
  if (!pairing) return <main className="min-h-screen bg-black p-8 text-2xl text-white" role="status">{error || "Connecting…"}</main>;
  return <>
    {!pairing.persistent && <p role="status" className="bg-black px-6 pt-4 text-amber-200">This browser cannot remember your display. Reopening the common URL may reset your team selection.</p>}
    <LiveDisplay key={pairing.channel} channel={pairing.channel} initiallyChoosingTeam={pairing.firstVisit} />
  </>;
}
function LiveDisplay({ channel, initiallyChoosingTeam = false }: { channel: string | null; initiallyChoosingTeam?: boolean }) {
  const [message, setMessage] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sequenceId, setSequenceId] = useState("manual");
  const [status, setStatus] = useState("Connecting…");
  const [scoreError, setScoreError] = useState("");
  const [choosingTeam, setChoosingTeam] = useState(initiallyChoosingTeam);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [hasTrackedContent, setHasTrackedContent] = useState(false);
  useEffect(() => {
    if (!isChannel(channel)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refreshScores() {
      try {
        const response = await fetch(`/api/nfl/refresh?channel=${encodeURIComponent(channel!)}`, {
          method: "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]),
        });
        if (!response.ok) throw new Error();
        if (!controller.signal.aborted) setScoreError("");
      } catch {
        if (!controller.signal.aborted && (message || pages.length > 0)) setScoreError("Score refresh delayed. Retrying automatically.");
        else if (!controller.signal.aborted) setScoreError("");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refreshScores, 60000);
      }
    }
    void refreshScores();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [channel, refreshVersion, message, pages.length]);
  useEffect(() => {
    if (!isChannel(channel)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let activeRequest: AbortController | undefined;
    let retryDelay = 2000;
    async function poll() {
      const controller = new AbortController();
      activeRequest = controller;
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(`/api/message?channel=${channel}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Connection interrupted.");
        if (!stopped) {
          setMessage(data.message?.message ?? "");
          const incoming: string[] = data.message?.pages ?? [];
          const hasData = Boolean(data.message?.message || incoming.length);
          setHasTrackedContent(hasData);
          setImageUrl(data.message?.imageUrl ?? null);
          setSequenceId(data.message?.sequenceId ?? "manual");
          setPages((previous) => JSON.stringify(previous) === JSON.stringify(incoming) ? previous : incoming);
          setStatus(hasData ? "Connected to display" : "Waiting for team update");
          if (!hasData) setScoreError("");
        }
        retryDelay = 2000;
      } catch (error) {
        if (!stopped) setStatus(`${error instanceof Error && error.name !== "AbortError" ? error.message : "Connection interrupted."} Retrying…`);
        retryDelay = Math.min(retryDelay * 2, 30000);
      } finally {
        clearTimeout(timeout);
        if (!stopped) timer = setTimeout(poll, retryDelay);
      }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); activeRequest?.abort(); };
  }, [channel]);
  if (!isChannel(channel)) {
    return <main className="flex min-h-screen items-center justify-center bg-black p-8 text-2xl text-white">Open the composer website and copy your glasses display link into Meta AI.</main>;
  }
  if (choosingTeam) {
    return <GlassesTeamMenu channel={channel} onClose={() => setChoosingTeam(false)} onSaved={() => {
        setChoosingTeam(false);
        setRefreshVersion((version) => version + 1);
      }} />;
  }
  return (
    <main className="flex min-h-screen flex-col justify-center bg-black p-8 text-white">
      <button autoFocus type="button" onClick={() => setChoosingTeam(true)} className="focusable mb-5 min-h-11 self-start rounded-xl border border-cyan-300/50 px-4 py-2 text-lg text-cyan-200 focus:outline-2 focus:outline-cyan-300">Change team</button>
      <p role="status" className="mb-6 text-lg text-cyan-200">{status}</p>
      {hasTrackedContent && scoreError && <p role="status" className="mb-3 text-sm text-amber-200">{scoreError}</p>}
      {imageUrl && (
        <div className="mb-5 flex items-center justify-center">
          <img src={imageUrl} alt="Team logo" className="h-20 w-20 rounded-full border border-white/10 bg-white/5 object-contain p-2 shadow-lg shadow-cyan-500/20" />
        </div>
      )}
      {(message || pages.length > 0) && <RotatingMessage key={sequenceId} pages={pages} message={message} />}
    </main>
  );
}
function RotatingMessage({ pages, message }: { pages: string[]; message: string }) {
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => {
    if (pages.length < 2) return;
    const timer = setInterval(() => setPageIndex((index) => (index + 1) % pages.length), 10000);
    return () => clearInterval(timer);
  }, [pages.length]);
  const displayText = pages.length ? pages[pageIndex % pages.length] : message;
  if (!displayText) return null;
  return <>
    {pages.length > 1 && <p className="mb-3 text-sm text-cyan-200">Game {(pageIndex % pages.length) + 1} of {pages.length} · Changes every 10 seconds</p>}
    <p aria-live="polite" className="whitespace-pre-wrap text-3xl leading-snug [overflow-wrap:anywhere]">
      {displayText}
    </p>
  </>;
}
export default function DisplayPage() {
  return <Suspense fallback={<main className="min-h-screen bg-black p-8 text-2xl text-white">Connecting…</main>}><DisplayContent /></Suspense>;
}
