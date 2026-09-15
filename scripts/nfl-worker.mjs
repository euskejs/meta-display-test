// Run on an always-on host with Node.js 22.18+; no secrets are printed.
import { setTimeout } from 'node:timers/promises';

const target = process.env.NFL_SYNC_URL;
const secret = process.env.CRON_SECRET;
if (!target || !secret || secret.length < 32) {
  throw new Error('Set NFL_SYNC_URL and a CRON_SECRET of at least 32 characters.');
}
const url = new URL(target);
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  throw new Error('Use HTTPS for the remote sync endpoint.');
}
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });
do {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      redirect: 'error', signal: AbortSignal.timeout(55000),
    });
    console.log(`${new Date().toISOString()} NFL sync: HTTP ${response.status}`);
  } catch { console.error(`${new Date().toISOString()} NFL sync unavailable; retrying next minute.`); }
  if (process.argv.includes('--once') || stopped) break;
  await setTimeout(Math.max(1000, 60000 - (Date.now() - started)));
} while (!stopped);
