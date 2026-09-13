"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isChannel } from "@/lib/messages";
function DisplayContent() {
  const channel = useSearchParams().get("channel");
  return <LiveDisplay key={channel} channel={channel} />;
}
function LiveDisplay({ channel }: { channel: string | null }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Connecting…");
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
          setStatus(data.message ? "Conncted to FIFA Companion" : "Waiting for your first message");
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
  return (
    <main className="flex min-h-screen flex-col justify-center bg-black p-8 text-white">
      <p role="status" className="mb-6 text-lg text-cyan-200">{status}</p>
      <p aria-live="polite" className="whitespace-pre-wrap text-3xl leading-snug [overflow-wrap:anywhere]">
        {message || "Type a message on the website, then tap Send to display."}
      </p>
    </main>
  );
}
export default function DisplayPage() {
  return <Suspense fallback={<main className="min-h-screen bg-black p-8 text-2xl text-white">Connecting…</main>}><DisplayContent /></Suspense>;
}
