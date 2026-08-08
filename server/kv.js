// File-backed drop-in for the subset of the Cloudflare Workers KV API the app
// workers actually use: get / put / delete / list({ prefix }) with string
// values, no TTLs, no metadata, no cursor pagination (household scale).
//
// One file per key inside the app's data dir. ':' in key names maps to '~' on
// disk (no worker-generated key ever contains '~' — enforced in put()).
// Writes are atomic (tmp file + rename) so a crash can never leave a
// half-written state blob.

import { mkdirSync, promises as fs } from 'node:fs';
import { join } from 'node:path';

const KEY_RE = /^[A-Za-z0-9:._-]+$/; // everything the workers generate; notably no '~'
let tmpSeq = 0;

export function makeKV(dir) {
  mkdirSync(dir, { recursive: true });
  const file = (key) => join(dir, key.replaceAll(':', '~'));
  return {
    async get(key) {
      try { return await fs.readFile(file(key), 'utf8'); }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async put(key, value) {
      if (!KEY_RE.test(key)) throw new Error('bad KV key: ' + key);
      const target = file(key);
      const tmp = `${target}.tmp-${process.pid}-${++tmpSeq}`;
      await fs.writeFile(tmp, String(value));
      await fs.rename(tmp, target);
    },
    async delete(key) {
      try { await fs.unlink(file(key)); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    },
    async list({ prefix = '' } = {}) {
      let names;
      try { names = await fs.readdir(dir); }
      catch (e) { if (e.code === 'ENOENT') return { keys: [], list_complete: true }; throw e; }
      const keys = names
        .filter((n) => !n.includes('.tmp-'))
        .map((n) => n.replaceAll('~', ':'))
        .filter((k) => k.startsWith(prefix))
        .sort()
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}
