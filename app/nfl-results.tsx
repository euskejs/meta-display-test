"use client";

import { useEffect, useState } from "react";
import type { Game } from "@/lib/nfl-scores";
import { findTeam } from "@/lib/nfl-teams";

type Results = {
  pending: boolean; season: number; fetchedAt?: string; stale?: boolean;
  lastSync: string | null; record?: string; games?: Game[]; live?: Game; latest?: Game; next?: Game;
};
function when(date: string) {
  return new Date(date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}
function scoreLine(game: Game) {
  return game.state === "pre" ? `${game.away} at ${game.home}` : `${game.away} ${game.awayScore ?? "—"} · ${game.home} ${game.homeScore ?? "—"}`;
}
export default function NflResults({ team }: { team: string }) {
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch(`/api/nfl/results?team=${encodeURIComponent(team)}`, {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!controller.signal.aborted) { setData(result); setError(""); }
      } catch {
        if (!controller.signal.aborted) setError("Unable to refresh scores. Showing the last available results; retrying automatically.");
      } finally { if (!controller.signal.aborted) timer = setTimeout(refresh, 30000); }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [team, retry]);
  const active = data?.live ?? data?.latest;
  return (
    <section aria-label={`${findTeam(team)?.name} results`} className="mt-5 rounded-2xl border border-cyan-400/20 bg-slate-950/60 p-4">
      <h3 className="font-semibold">{findTeam(team)?.name} {data?.season ?? ""}</h3>
      {error && <p role="status" className="mt-2 text-sm text-amber-200">{error} <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>Retry now</button></p>}
      {!data && !error && <p role="status" className="mt-2 text-sm text-slate-300">Loading scores…</p>}
      {data?.pending && <p role="status" className="mt-2 text-sm text-amber-200">Waiting for the score service’s first refresh. Your team is saved; automatic display updates will begin when scores are available.</p>}
      {data && !data.pending && <>
        <p className="mt-1 text-sm text-slate-300">Regular season W–L–T: {data.record}</p>
        {data.stale && <p role="status" className="mt-2 text-sm text-amber-200">Score updates are delayed. These are the last available results.</p>}
        {active ? <div className="mt-4">
          <p className="text-xs uppercase tracking-widest text-cyan-300">{data.live ? "In progress" : "Latest result"}</p>
          <p className="mt-1 text-xl font-semibold">{scoreLine(active)}</p>
          <p className="text-sm text-slate-300">{active.status} · {when(active.date)}</p>
        </div> : <p className="mt-3 text-sm text-slate-300">No results yet this season.</p>}
        <p className="mt-4 text-sm text-slate-300">{data.next ? `Next: ${scoreLine(data.next)} · ${when(data.next.date)}` : "No upcoming game is currently scheduled."}</p>
        {!!data.games?.length && <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-cyan-200">Season schedule and results</summary>
          <ul className="mt-2 divide-y divide-white/10">
            {data.games.map((game) => <li key={game.id} className="py-2">
              <p>{game.phase === 3 ? "Playoffs" : `Week ${game.week}`} · {scoreLine(game)}</p>
              <p className="text-xs text-slate-400">{game.status} · {when(game.date)}</p>
            </li>)}
          </ul>
        </details>}
        <p className="mt-4 text-xs text-slate-400">Source: ESPN · Refreshed {data.fetchedAt ? when(data.fetchedAt) : "—"}</p>
      </>}
    </section>
  );
}
