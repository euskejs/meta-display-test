"use client";

import { useEffect, useRef, useState } from "react";
import { CONFERENCES, DIVISIONS, NFL_TEAMS, findTeam } from "@/lib/nfl-teams";

type Step = "conference" | "division" | "team" | "confirm";
export default function GlassesTeamMenu({ channel, onClose, onSaved }: {
  channel: string; onClose: () => void; onSaved: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const savingRef = useRef(false);
  const [step, setStep] = useState<Step>("conference");
  const [conference, setConference] = useState("");
  const [division, setDivision] = useState("");
  const [team, setTeam] = useState("");
  const [savedTeam, setSavedTeam] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/nfl/preferences?channel=${encodeURIComponent(channel)}`, {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (controller.signal.aborted) return;
        const selected = findTeam(result.team?.id);
        setConference(selected?.conference ?? ""); setDivision(selected?.division ?? ""); setTeam(selected?.id ?? "");
        setSavedTeam(selected?.id ?? ""); setEnabled(result.enabled === true); setLoadFailed(false); setError("");
      } catch {
        if (!controller.signal.aborted) { setLoadFailed(true); setError("Could not load your team. Please retry."); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [channel, retry]);

  const selected = step === "conference" ? conference : step === "division" ? division : step === "team" ? team : "follow";
  useEffect(() => {
    const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const target = buttons.find((button) => button.dataset.value === selected) ?? buttons[0];
    target?.focus();
    target?.scrollIntoView({ block: "nearest" });
  }, [step, loading, saving, error, selected]);

  function back() {
    if (savingRef.current) return;
    setError("");
    if (step === "conference") onClose();
    else setStep(step === "confirm" ? "team" : step === "team" ? "division" : "conference");
  }
  async function save(id: string, active: boolean) {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      const response = await fetch("/api/nfl/preferences", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, team: id, enabled: active }), signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error();
      onSaved();
    } catch { setError("Could not save. Select the button to retry."); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const buttonClass = "focusable min-h-12 w-full rounded-xl border-2 border-slate-600 bg-slate-900 px-4 py-2 text-left text-2xl! leading-tight! text-white outline-none focus:border-cyan-200 focus:bg-cyan-950 focus:shadow-[0_0_16px_rgba(34,211,238,0.5)] disabled:opacity-50";
  const title = { conference: "Choose conference", division: "Choose division", team: "Choose team", confirm: `Follow ${findTeam(team)?.name}?` }[step];
  return <main ref={root} className="flex h-dvh max-h-[600px] w-full max-w-[600px] flex-col gap-3 bg-black p-5 text-white" onKeyDown={(event) => {
    if (event.key === "Enter" && event.repeat) { event.preventDefault(); return; }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); back(); return; }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
    const next = buttons[(index + direction + buttons.length) % buttons.length];
    next.focus(); next.scrollIntoView({ block: "nearest" });
  }}>
    <header>
      <p className="text-base text-cyan-200">NFL · Step {(["conference", "division", "team", "confirm"] as Step[]).indexOf(step) + 1} of 4{step !== "conference" ? ` · ${conference}${step === "team" || step === "confirm" ? ` ${division}` : ""}` : ""}</p>
      <h1 className="mt-1 text-3xl font-semibold leading-tight">{title}</h1>
    </header>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-1">
      {loading ? <p role="status" className="text-xl">Loading your saved team…</p> : loadFailed ?
        <button className={buttonClass} onClick={() => { setLoading(true); setError(""); setRetry((value) => value + 1); }}>Retry loading</button> : <>
          {step === "conference" && CONFERENCES.map((value) => <button key={value} disabled={saving} data-value={value} className={buttonClass} onClick={() => {
            if (conference !== value) { setDivision(""); setTeam(""); }
            setConference(value); setStep("division");
          }}>{value}</button>)}
          {step === "division" && DIVISIONS.map((value) => <button key={value} data-value={value} className={buttonClass} onClick={() => {
            if (division !== value) setTeam("");
            setDivision(value); setStep("team");
          }}>{value}</button>)}
          {step === "team" && NFL_TEAMS.filter((value) => value.conference === conference && value.division === division).map((value) =>
            <button key={value.id} data-value={value.id} className={buttonClass} onClick={() => { setTeam(value.id); setStep("confirm"); }}>{value.name}</button>)}
          {step === "confirm" && <>
            <p className="mb-4 text-xl text-slate-200">Live scores and results will replace the text on this display.</p>
            <button data-value="follow" disabled={saving} className={buttonClass} onClick={() => void save(team, true)}>{saving ? "Saving…" : "Follow team"}</button>
          </>}
          {step === "conference" && savedTeam && <>
            <p className="pt-2 text-base text-slate-200">Following {findTeam(savedTeam)?.name}{enabled ? "" : " · Paused"}</p>
            <button disabled={saving} className={buttonClass} onClick={() => void save(savedTeam, !enabled)}>{saving ? "Saving…" : enabled ? "Pause updates" : "Resume updates"}</button>
          </>}
        </>}
    </div>
    {error && <p role="alert" className="text-lg text-amber-200">{error}</p>}
    <button disabled={saving} className={buttonClass} onClick={back}>{step === "conference" ? "Back to display" : "Back"}</button>
    <p className="text-base text-cyan-100">Up/down to move · Select to choose</p>
  </main>;
}
