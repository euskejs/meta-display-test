import { isChannel } from "./messages.ts";

export function resolveDisplayPairing(search: string, storage: Pick<Storage, "getItem" | "setItem">, generate: () => string) {
  const explicit = new URLSearchParams(search).get("channel");
  if (explicit !== null && !isChannel(explicit)) throw new Error("This display link is invalid. Open /display to create your own display, or copy a new paired link from the composer.");
  let saved: string | null = null;
  try { saved = storage.getItem("meta-display-channel"); } catch { /* A session can still run without persistence. */ }
  const channel = (explicit ?? (isChannel(saved) ? saved : generate())).toLowerCase();
  let persistent = true;
  try { storage.setItem("meta-display-channel", channel); } catch { persistent = false; }
  return { channel, persistent, firstVisit: explicit === null && !isChannel(saved) };
}
