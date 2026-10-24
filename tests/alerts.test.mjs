// When the baby tracker's alert rules fire (dueAlerts) and quiet hours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueAlerts, inQuietHours } from '../baby-tracker/worker/index.js';

const NOW = Date.UTC(2026, 9, 24, 12);
const MIN = 60000, HOUR = 3600000;
const keys = (due) => due.map((d) => d.key).sort();
const rule = (min, crit) => ({ on: true, min, ...(crit ? { crit } : {}) });

test('a rule fires once its gap is crossed, not before', () => {
  const state = { alerts: { diaper: rule(180) }, entries: [{ id: 'd', type: 'diaper', start: NOW - 179 * MIN }] };
  assert.deepEqual(dueAlerts(state, NOW), []);
  const due = dueAlerts(state, NOW + 2 * MIN);
  assert.deepEqual(keys(due), ['diaper']);
  assert.equal(due[0].crit, 'normal');
  assert.match(due[0].body, /3h 01m/);
});

test('a rule that is off, or has nothing logged yet, stays silent', () => {
  const entries = [{ id: 'd', type: 'diaper', start: NOW - 10 * HOUR }];
  assert.deepEqual(dueAlerts({ alerts: { diaper: { on: false, min: 60 } }, entries }, NOW), []);
  assert.deepEqual(dueAlerts({ alerts: { feed: rule(60) }, entries }, NOW), []);
});

test('feed counts nurse, bottle and solid, from the end of the latest one', () => {
  const alerts = { feed: rule(120, 'high') };
  const entries = [
    { id: 'n', type: 'nurse', start: NOW - 5 * HOUR, end: NOW - 4 * HOUR },
    { id: 'b', type: 'bottle', start: NOW - 150 * MIN, end: NOW - 100 * MIN },
  ];
  assert.deepEqual(dueAlerts({ alerts, entries }, NOW), []);
  const due = dueAlerts({ alerts, entries }, NOW + 30 * MIN);
  assert.deepEqual(keys(due), ['feed']);
  assert.equal(due[0].crit, 'high');
});

test('a running nurse timer holds the feed alert', () => {
  const state = { alerts: { feed: rule(60) }, entries: [{ id: 'b', type: 'bottle', start: NOW - 5 * HOUR }], active: { nurse: { start: NOW - 10 * MIN } } };
  assert.deepEqual(dueAlerts(state, NOW), []);
});

test('awake counts from the last sleep, and only while no sleep runs', () => {
  const entries = [{ id: 's', type: 'sleep', start: NOW - 5 * HOUR, end: NOW - 3 * HOUR }];
  assert.deepEqual(keys(dueAlerts({ alerts: { awake: rule(150) }, entries }, NOW)), ['awake']);
  assert.deepEqual(dueAlerts({ alerts: { awake: rule(150) }, entries, active: { sleep: { start: NOW - 5 * MIN } } }, NOW), []);
});

test('sleep fires while the sleep timer runs past its gap', () => {
  const state = { alerts: { sleep: rule(120, 'low') }, entries: [], active: { sleep: { start: NOW - 3 * HOUR } } };
  const due = dueAlerts(state, NOW);
  assert.deepEqual(keys(due), ['sleep']);
  assert.equal(due[0].crit, 'low');
});

test('a forgotten timer nags even with every rule off', () => {
  const nurse = dueAlerts({ entries: [], active: { nurse: { start: NOW - 2 * HOUR - MIN } } }, NOW);
  assert.deepEqual(keys(nurse), ['nursetimer']);
  assert.deepEqual(dueAlerts({ entries: [], active: { nurse: { start: NOW - 2 * HOUR + MIN } } }, NOW), []);
  const sleep = dueAlerts({ entries: [], active: { sleep: { start: NOW - 14 * HOUR - MIN } } }, NOW);
  assert.deepEqual(keys(sleep), ['sleeptimer']);
});

test('quiet hours across midnight, in the configured timezone', () => {
  const q = { quiet: { on: true, from: '22:00', to: '07:00', tz: 'Europe/Oslo' } };
  // 24 Oct 2026 is summer time in Oslo, UTC+2
  assert.equal(inQuietHours(q, new Date(Date.UTC(2026, 9, 24, 21, 30))), true);  // 23:30
  assert.equal(inQuietHours(q, new Date(Date.UTC(2026, 9, 24, 4, 59))), true);   // 06:59
  assert.equal(inQuietHours(q, new Date(Date.UTC(2026, 9, 24, 5, 0))), false);   // 07:00
  assert.equal(inQuietHours(q, new Date(Date.UTC(2026, 9, 24, 19, 59))), false);  // 21:59
});

test('quiet hours within one day, switched off, or with a bad timezone', () => {
  const day = { quiet: { on: true, from: '13:00', to: '15:00', tz: 'UTC' } };
  assert.equal(inQuietHours(day, new Date(Date.UTC(2026, 9, 24, 14))), true);
  assert.equal(inQuietHours(day, new Date(Date.UTC(2026, 9, 24, 15))), false);
  assert.equal(inQuietHours({ quiet: { ...day.quiet, on: false } }, new Date(Date.UTC(2026, 9, 24, 14))), false);
  assert.equal(inQuietHours({ quiet: { ...day.quiet, tz: 'Not/AZone' } }, new Date(Date.UTC(2026, 9, 24, 14))), false);
  assert.equal(inQuietHours(null, new Date()), false);
});
