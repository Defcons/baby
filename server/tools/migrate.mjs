// One-shot migration: copy each app's live state from the Cloudflare Workers
// to the self-hosted server. READ-ONLY against the old system — it never
// writes to the workers, so it is safe to run any number of times.
//
//   node server/tools/migrate.mjs --password 'family-pw' [--slug name]
//        [--contraction-room id] [--target https://baby.defc0n.no] [--dry-run]
//
// (or put the password in the MIGRATE_PASSWORD env var to keep it out of
// shell history)
//
// Steps per app:
//   1. derive the room id exactly like the app's login does
//   2. GET the state from the old worker
//   3. write a timestamped snapshot into backups/ (gitignored) FIRST
//   4. print entry counts + newest-entry time — eyeball these against the app
//   5. PUT to the new origin, GET it back, verify byte-identical
//
// Baby archives: none exist while the whole log is younger than HOT_DAYS (35)
// — the tool checks anyway, downloads any it finds into the snapshot dir, and
// flags that those need manual placement (see the private run-book).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--dry-run') args.dryRun = true;
  else if (a.startsWith('--')) args[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = process.argv[++i];
}
const password = args.password || process.env.MIGRATE_PASSWORD;
const target = (args.target || 'https://baby.defc0n.no').replace(/\/$/, '');
if (!password && !args.contractionRoom) {
  console.error('need --password (or MIGRATE_PASSWORD env) and/or --contraction-room');
  process.exit(1);
}

const sha256Hex = async (s) => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const SOURCES = {
  baby: args.sourceBaby || 'https://baby-tracker-sync.davidsen908.workers.dev',
  pelvic: args.sourcePelvic || 'https://pelvic-reminders.davidsen908.workers.dev',
  contraction: args.sourceContraction || 'https://contraction-sync.davidsen908.workers.dev',
};

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 17);
const snapDir = join(process.cwd(), 'backups', `migrate-${stamp}`);
mkdirSync(snapDir, { recursive: true });

const fmt = (ts) => (ts ? new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');

function describe(app, state) {
  if (!state) return 'empty';
  if (app === 'baby') {
    const newest = Math.max(0, ...(state.entries || []).map((e) => e.end || e.start || 0));
    const act = Object.entries(state.active || {}).filter(([, v]) => v).map(([k]) => k).join('+') || 'none';
    return `${(state.entries || []).length} entries, newest ${fmt(newest)}, active timers: ${act}, revision ${fmt(state.revision)}`;
  }
  if (app === 'pelvic') {
    const newest = Math.max(0, ...(state.sessions || []).map((s) => s.ts || 0));
    return `${(state.sessions || []).length} sessions, newest ${fmt(newest)}`;
  }
  const newest = Math.max(0, ...(state.contractions || []).map((c) => c.end || c.start || 0));
  return `${(state.contractions || []).length} contractions, newest ${fmt(newest)}`;
}

async function migrateApp(app, room) {
  if (!room) { console.log(`\n[${app}] skipped (no room id)`); return { app, skipped: true }; }
  const src = `${SOURCES[app]}/state/${room}`;
  const res = await fetch(src, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${app}: GET ${src} -> ${res.status}`);
  const text = await res.text();
  writeFileSync(join(snapDir, `${app}-state.json`), text);
  if (text === 'null') { console.log(`\n[${app}] room ${room}: worker has no state — nothing to migrate`); return { app, empty: true }; }
  let state = null;
  try { state = JSON.parse(text); } catch {}
  console.log(`\n[${app}] room ${room}`);
  console.log(`  source: ${describe(app, state)} (${text.length} bytes) — snapshot saved`);

  let archiveWarning = false;
  if (app === 'baby') {
    const ar = await fetch(`${SOURCES.baby}/archive/${room}`);
    if (ar.ok) {
      const { months = [] } = await ar.json();
      for (const mon of months) {
        const at = await (await fetch(`${SOURCES.baby}/archive/${room}/${mon}`)).text();
        writeFileSync(join(snapDir, `baby-archive-${mon}.json`), at);
      }
      if (months.length) {
        archiveWarning = true;
        console.log(`  ⚠ ${months.length} archive month(s) downloaded to the snapshot dir — these need manual`);
        console.log(`    placement on the server (data/baby/archive~${room}~<month>), see the private run-book`);
      }
    }
  }

  if (args.dryRun) { console.log('  dry-run: not writing to the new server'); return { app, dryRun: true }; }

  const dst = `${target}/api/${app}/state/${room}`;
  const put = await fetch(dst, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: text });
  if (!put.ok) throw new Error(`${app}: PUT ${dst} -> ${put.status} ${await put.text()}`);
  const back = await (await fetch(dst, { cache: 'no-store' })).text();
  if (back !== text) throw new Error(`${app}: verification FAILED — GET-back differs from what was uploaded`);
  console.log(`  ✓ uploaded to ${dst} and verified byte-identical`);
  return { app, ok: true, archiveWarning };
}

const rooms = {
  baby: password ? (await sha256Hex(args.slug ? `baby-room-v1:${password}:${args.slug.trim().toLowerCase()}` : 'baby-room-v1:' + password)).slice(0, 32) : null,
  pelvic: password ? (await sha256Hex('pelvic-room-v1:' + password)).slice(0, 32) : null,
  contraction: args.contractionRoom || null,
};

console.log(`Snapshot dir: ${snapDir}`);
console.log(`Target: ${target}${args.dryRun ? ' (dry-run)' : ''}`);
const results = [];
for (const app of ['baby', 'pelvic', 'contraction']) results.push(await migrateApp(app, rooms[app]));

console.log('\n— done. The old workers were only READ; nothing was changed there.');
console.log('  Next: sign in on each device at the new origin and verify the log matches');
console.log('  the counts above (cutover checklist in the private run-book).');
if (rooms.contraction) console.log(`  Contraction devices re-attach via ${target}/contraction-tracker/#r=${rooms.contraction}`);
