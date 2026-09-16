import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDisplayPairing } from '../lib/display-pairing.ts';
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function storage(initial) {
  const values = new Map(initial ? [['meta-display-channel', initial]] : []);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('common URL creates separate browser channels and reuses them on reopening', () => {
  const first = storage(), second = storage();
  assert.deepEqual(resolveDisplayPairing('', first, () => a), { channel: a, persistent: true, firstVisit: true });
  assert.equal(resolveDisplayPairing('', second, () => b).channel, b);
  assert.deepEqual(resolveDisplayPairing('', first, () => assert.fail('Must reuse pairing')), { channel: a, persistent: true, firstVisit: false });
});
test('existing explicit links override and persist the browser pairing', () => {
  const local = storage(a);
  assert.equal(resolveDisplayPairing(`?channel=${b.toUpperCase()}`, local, () => a).channel, b);
  assert.equal(resolveDisplayPairing('', local, () => a).channel, b);
  assert.throws(() => resolveDisplayPairing('?channel=invalid', local, () => a), /invalid/);
});
test('corrupt storage is replaced and unavailable storage reports a temporary session', () => {
  assert.equal(resolveDisplayPairing('', storage('bad'), () => a).firstVisit, true);
  const unavailable = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  assert.deepEqual(resolveDisplayPairing('', unavailable, () => a), { channel: a, persistent: false, firstVisit: true });
});
