// The baby tracker's merge rules (baby-tracker/sync.js, a plain script the page loads).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.runInNewContext(readFileSync(new URL('../baby-tracker/sync.js', import.meta.url), 'utf8') +
  '\nthis.mergeState = mergeState; this.stateSig = stateSig; this.normalizeState = normalizeState;', ctx);
const { mergeState, stateSig, normalizeState } = ctx;

const NOW = Date.UTC(2026, 9, 24, 12);
const MIN = 60000, DAY = 86400000;
const plain = (v) => JSON.parse(JSON.stringify(v)); // vm objects fail deepEqual's prototype check
const ids = (s) => plain(s.entries.map((e) => e.id));

test('entries from both sides are kept, sorted by start', () => {
  const a = { entries: [{ id: 'b', type: 'diaper', start: NOW - 10 * MIN }] };
  const b = { entries: [{ id: 'a', type: 'bottle', start: NOW - 30 * MIN }] };
  assert.deepEqual(ids(mergeState(a, b, NOW)), ['a', 'b']);
});

test('the copy with the newer mt wins, whichever side it is on', () => {
  const old = { id: 'x', type: 'bottle', start: NOW - 60 * MIN, mt: NOW - 60 * MIN, ml: 90 };
  const edited = { ...old, mt: NOW - 5 * MIN, ml: 120 };
  assert.equal(mergeState({ entries: [old] }, { entries: [edited] }, NOW).entries[0].ml, 120);
  assert.equal(mergeState({ entries: [edited] }, { entries: [old] }, NOW).entries[0].ml, 120);
});

test('an entry without mt counts as modified at its start', () => {
  assert.equal(normalizeState({ entries: [{ id: 'x', start: 5 }] }).entries[0].mt, 5);
});

test('a tombstone removes the entry from the merged state', () => {
  const e = { id: 'x', type: 'diaper', start: NOW - 60 * MIN };
  const m = mergeState({ entries: [e] }, { deleted: { x: NOW - MIN } }, NOW);
  assert.deepEqual(ids(m), []);
  assert.equal(m.deleted.x, NOW - MIN);
});

test('tombstones keep the newest delete time and expire after 60 days', () => {
  const m = mergeState({ deleted: { x: NOW - 3 * DAY, old: NOW - 61 * DAY } }, { deleted: { x: NOW - DAY } }, NOW);
  assert.deepEqual(plain(m.deleted), { x: NOW - DAY });
});

test('entries older than the archive watermark are not re-added', () => {
  const a = { archivedBefore: NOW - 35 * DAY, entries: [] };
  const b = { entries: [{ id: 'old', start: NOW - 40 * DAY }, { id: 'new', start: NOW - DAY }] };
  const m = mergeState(a, b, NOW);
  assert.deepEqual(ids(m), ['new']);
  assert.equal(m.archivedBefore, NOW - 35 * DAY);
});

test('a running timer: the later writer wins', () => {
  const early = { start: NOW - 60 * MIN, mt: NOW - 60 * MIN };
  const late = { start: NOW - 20 * MIN, mt: NOW - 20 * MIN };
  assert.equal(mergeState({ active: { sleep: early } }, { active: { sleep: late } }, NOW).active.sleep.start, late.start);
  assert.equal(mergeState({ active: { sleep: late } }, { active: { sleep: early } }, NOW).active.sleep.start, late.start);
});

test('a running timer whose stop entry exists or was deleted is over', () => {
  const start = NOW - 60 * MIN;
  const stopped = mergeState({ active: { sleep: { start } } }, { entries: [{ id: 's' + start, type: 'sleep', start, end: NOW }] }, NOW);
  assert.equal(stopped.active.sleep, null);
  const deleted = mergeState({ active: { nurse: { start } } }, { deleted: { ['n' + start]: NOW - MIN } }, NOW);
  assert.equal(deleted.active.nurse, null);
});

test('alerts and baby details: the higher rev wins as a whole', () => {
  const a = { alerts: { feed: { on: true, min: 180 } }, alertsRev: 2, baby: { sex: 'f' }, babyRev: 1 };
  const b = { alerts: { feed: { on: false, min: 120 } }, alertsRev: 3, baby: { sex: 'm' }, babyRev: 0 };
  const m = mergeState(a, b, NOW);
  assert.deepEqual(plain(m.alerts), b.alerts);
  assert.equal(m.alertsRev, 3);
  assert.deepEqual(plain(m.baby), a.baby);
  assert.equal(m.babyRev, 1);
});

test('a side that has no alerts yet does not wipe the other side\'s', () => {
  const m = mergeState({ alerts: null, alertsRev: 5 }, { alerts: { diaper: { on: true } }, alertsRev: 1 }, NOW);
  assert.deepEqual(plain(m.alerts), { diaper: { on: true } });
});

test('merging is order-independent and settles after one round', () => {
  const a = { revision: 4, entries: [{ id: 'p', start: NOW - 9 * MIN }, { id: 'q', start: NOW - 8 * MIN, mt: NOW }], deleted: { r: NOW - MIN } };
  const b = { revision: 7, entries: [{ id: 'q', start: NOW - 8 * MIN }, { id: 'r', start: NOW - 7 * MIN }], active: { nurse: { start: NOW - MIN } } };
  const ab = mergeState(a, b, NOW), ba = mergeState(b, a, NOW);
  assert.equal(stateSig(ab), stateSig(ba));
  assert.equal(ab.revision, 7);
  assert.equal(stateSig(mergeState(ab, b, NOW)), stateSig(ab));
});

test('stateSig ignores revision and key order, and sees an edit', () => {
  const s = { revision: 1, entries: [{ id: 'x', start: 1, mt: 1 }], alerts: { a: 1, b: 2 } };
  assert.equal(stateSig(s), stateSig({ ...s, revision: 9, alerts: { b: 2, a: 1 } }));
  assert.notEqual(stateSig(s), stateSig({ ...s, entries: [{ id: 'x', start: 1, mt: 2 }] }));
});
