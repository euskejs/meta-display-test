"use client";

import { FormEvent, useEffect, useState } from "react";
import { CONFERENCES, DIVISIONS, NFL_TEAMS, findTeam } from "@/lib/nfl-teams";
import NflResults from "./nfl-results";

export default function NflPicker({ channel }: { channel: string }) {
  const [conference, setConference] = useState("");
  const [division, setDivision] = useState("");
  const [team, setTeam] = useState("");
  const [savedTeam, setSavedTeam] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading your saved team…");
  const [reload, setReload] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/nfl/preferences?channel=${encodeURIComponent(channel)}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]), cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (controller.signal.aborted) return;
        const selected = findTeam(result.team?.id);
        setConference(selected?.conference ?? "");
        setDivision(selected?.division ?? "");
        setTeam(selected?.id ?? "");
        setSavedTeam(selected?.id ?? "");
        setEnabled(result.enabled === true);
        setLoadFailed(false);
        setStatus(selected ? `Saved team: ${selected.name}.` : "Choose a conference to get started.");
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadFailed(true);
        setStatus(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Could not load your team. Please retry.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [channel, reload]);

  async function save(id: string | null, autoUpdates = true) {
    setSaving(true);
    setStatus("Saving…");
    try {
      const response = await fetch("/api/nfl/preferences", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, team: id, enabled: autoUpdates }), signal: AbortSignal.timeout(12000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSavedTeam(id ?? "");
      setEnabled(result.enabled === true);
      if (id === null) { setConference(""); setDivision(""); setTeam(""); }
      setStatus(id ? `${findTeam(id)?.name}: ${autoUpdates ? "live and final updates enabled" : "automatic updates paused"}.` : "Saved team removed.");
    } catch (error) {
      setStatus(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Saving timed out. Retry to confirm your selection.");
    } finally { setSaving(false); }
  }

  const disabled = loading || saving || loadFailed;
  const selectClass = "mt-2 w-full min-w-0 rounded-xl border border-white/15 bg-slate-950 px-3 py-3 text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-40";
  return (
    <section aria-labelledby="nfl-heading" className="mt-7 border-t border-white/10 pt-6">
      <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">NFL</p>
      <h2 id="nfl-heading" className="mt-1 text-xl font-semibold">Choose your team</h2>
      <p className="mt-2 text-sm text-slate-300">Follow live scores and final results on your glasses. Choose a conference, then a division and team.</p>
      <form className="mt-4 space-y-4" onSubmit={(event: FormEvent) => { event.preventDefault(); if (team && !disabled) void save(team); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-medium">Conference
            <select value={conference} disabled={disabled} className={selectClass} onChange={(event) => {
              setConference(event.target.value); setDivision(""); setTeam(""); setStatus("Choose a division, then a team. Save to apply your changes.");
            }}>
              <option value="">Select conference</option>
              {CONFERENCES.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-sm font-medium">Division
            <select value={division} disabled={disabled || !conference} className={selectClass} onChange={(event) => {
              setDivision(event.target.value); setTeam(""); setStatus("Choose a team. Save to apply your changes.");
            }}>
              <option value="">{conference ? "Select division" : "Choose a conference first"}</option>
              {conference && DIVISIONS.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium">Team
          <select value={team} disabled={disabled || !division} className={selectClass} onChange={(event) => {
            setTeam(event.target.value); setStatus("Save to apply your selection to this display.");
          }}>
            <option value="">{division ? "Select team" : "Choose a division first"}</option>
            {NFL_TEAMS.filter((item) => item.conference === conference && item.division === division).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {savedTeam && <p className="text-sm text-cyan-200">{findTeam(savedTeam)?.name} · {enabled ? "Automatic updates enabled" : "Updates paused"}</p>}
        <div className="flex flex-wrap gap-3">
          <button disabled={disabled || !team || (team === savedTeam && enabled)} className="rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-40">{saving ? "Saving…" : savedTeam && team === savedTeam && !enabled ? "Resume updates" : "Track this team"}</button>
          {savedTeam && enabled && <button type="button" disabled={disabled} onClick={() => void save(savedTeam, false)} className="rounded-full border border-white/20 px-4 py-2.5 text-sm disabled:opacity-40">Pause automatic updates</button>}
          {savedTeam && <button type="button" disabled={disabled} onClick={() => void save(null)} className="rounded-full border border-white/20 px-4 py-2.5 text-sm disabled:opacity-40">Remove saved team</button>}
          {loadFailed && <button type="button" onClick={() => { setLoading(true); setStatus("Loading your saved team…"); setReload((value) => value + 1); }} disabled={loading} className="rounded-full border border-white/20 px-4 py-2.5 text-sm">Retry loading</button>}
        </div>
      </form>
      <p role="status" className="mt-3 text-sm text-slate-300">{status}</p>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">Scores refresh about once a minute while this page or your glasses display is open. Automatic updates replace manual text. Pause them before composing a message you want to keep. Keep the display app open on your glasses.</p>
      {savedTeam && <NflResults key={`${savedTeam}:${enabled}`} team={savedTeam} channel={channel} enabled={enabled} />}
    </section>
  );
}
