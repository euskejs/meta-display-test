import { PUBLISH_SCRIPT, GUARDED_SET_SCRIPT } from '../../lib/nfl-store.ts';

// In-memory transport for tests and isolated local UI QA; never uses real Redis.
export function fakeRedis() {
  const values = new Map(), hashes = new Map(), expiry = new Map();
  let beforePublish;
  function execute(args) {
    const [command, key, ...rest] = args;
    for (const [name, time] of expiry) if (Date.now() >= time) { values.delete(name); expiry.delete(name); }
    if (command === 'GET') return values.get(key) ?? null;
    if (command === 'SET') {
      if (rest.includes('NX') && values.has(key)) return null;
      values.set(key, rest[0]);
      const seconds = rest[rest.indexOf('EX') + 1];
      if (rest.includes('EX')) expiry.set(key, Date.now() + Number(seconds) * 1000);
      else expiry.delete(key);
      return 'OK';
    }
    if (command === 'DEL') return Number(values.delete(key));
    if (command === 'HGET') return hashes.get(key)?.get(rest[0]) ?? null;
    if (command === 'HSET') {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key).set(rest[0], rest[1]); return 1;
    }
    if (command === 'HDEL') return Number(hashes.get(key)?.delete(rest[0]) ?? false);
    if (command === 'HGETALL') return [...(hashes.get(key)?.entries() ?? [])].flat();
    if (command === 'EVAL') {
      const count = rest[0], keys = rest.slice(1, count + 1), argv = rest.slice(count + 1);
      if (key === PUBLISH_SCRIPT) {
        beforePublish?.();
        if (values.get(keys[3]) !== argv[4] || hashes.get(keys[0])?.get(argv[0]) !== argv[1] || values.get(keys[2]) === argv[2]) return 0;
        execute(['SET', keys[1], argv[3], 'EX', 604800]);
        execute(['SET', keys[2], argv[2], 'EX', 604800]);
        return 1;
      }
      if (key === GUARDED_SET_SCRIPT) {
        if (values.get(keys[0]) !== argv[0]) return 0;
        values.set(keys[1], argv[1]); return 1;
      }
      if (values.get(keys[0]) === argv[0]) return Number(values.delete(keys[0]));
      return 0;
    }
    throw new Error(`Unsupported test command: ${command}`);
  }
  return { values, hashes, execute, setBeforePublish(fn) { beforePublish = fn; },
    transport: async (_url, init) => Response.json({ result: execute(JSON.parse(init.body)) }) };
}
