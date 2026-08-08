// Self-hosted harness for the three app workers (deployment: server/DEPLOY.md).
//
// - Serves the repo's static pages (network-first SWs make deploys land fast;
//   html/js are sent no-cache, which also kills the old GitHub Pages
//   max-age=600 staleness gotcha for good).
// - Bridges /api/{baby,pelvic,contraction}/* to each worker's fetch() handler
//   UNCHANGED — the worker files stay the single source of behaviour.
// - A 5-minute loop stands in for the Cloudflare cron triggers.
//
// Env: PORT (8080), DATA_DIR (/data in the container), BABY_VAPID_JWK,
// PELVIC_VAPID_JWK (private VAPID JWKs, see server/DEPLOY.md; without them
// state sync still works but push/cron for that app is skipped).

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { join, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import babyWorker from '../baby-tracker/worker/index.js';
import pelvicWorker from '../pelvic-trainer/worker/index.js';
import contractionWorker from '../contraction-tracker/worker/index.js';
import { makeKV } from './kv.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data');
const PORT = +(process.env.PORT || 8080);
const CRON_MS = +(process.env.CRON_MS || 5 * 60000);
const CRON_FIRST_MS = +(process.env.CRON_FIRST_MS || 20000);

// Trim defensively: a Windows-authored .env can smuggle CRLF/whitespace into
// the value, which would break JSON.parse(env.VAPID_JWK) inside the workers.
const jwkEnv = (v) => ((v || '').trim() || undefined);
const apps = {
  baby: { worker: babyWorker, env: { STATE: makeKV(join(DATA_DIR, 'baby')), VAPID_JWK: jwkEnv(process.env.BABY_VAPID_JWK) } },
  pelvic: { worker: pelvicWorker, env: { STATE: makeKV(join(DATA_DIR, 'pelvic')), VAPID_JWK: jwkEnv(process.env.PELVIC_VAPID_JWK) } },
  contraction: { worker: contractionWorker, env: { STATE: makeKV(join(DATA_DIR, 'contraction')) } },
};
for (const name of ['baby', 'pelvic'])
  if (!apps[name].env.VAPID_JWK)
    console.error(`[boot] ${name.toUpperCase()}_VAPID_JWK is not set — ${name} state sync works, but push/cron is disabled until it is`);

// ---- static files ----

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};
// Top-level dirs (and the per-app worker/ dirs) that are code/ops, not site.
const DENY = new Set(['server', 'worker', 'homeassistant', 'docs', 'backups', 'data', 'node_modules', 'package.json']);

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

async function serveStatic(pathname, method, res) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return send(res, 400, 'bad path'); }
  if (p.includes('\0')) return send(res, 400, 'bad path');
  if (p.endsWith('/')) p += 'index.html';
  const segs = p.split('/').filter(Boolean);
  if (segs.some((s) => s.startsWith('.') || DENY.has(s.toLowerCase()))) return send(res, 404, 'not found');
  const fp = resolve(ROOT, ...segs);
  if (fp !== ROOT && !fp.startsWith(ROOT + sep)) return send(res, 404, 'not found');
  const ext = extname(fp).toLowerCase();
  if (!ext) {
    // extensionless app path like /baby-tracker -> canonical trailing slash
    try { if ((await fs.stat(fp)).isDirectory()) { res.writeHead(301, { Location: pathname + '/' }); return res.end(); } } catch {}
    return send(res, 404, 'not found');
  }
  const mime = MIME[ext];
  if (!mime) return send(res, 404, 'not found');
  let data;
  try { data = await fs.readFile(fp); } catch { return send(res, 404, 'not found'); }
  const cache = ext === '.png' || ext === '.ico' || ext === '.woff2' ? 'public, max-age=86400' : 'no-cache';
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': data.length,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(method === 'HEAD' ? undefined : data);
}

// ---- worker bridging ----

const BODY_CAP = 1_500_000; // workers enforce their own 200/500KB caps below this

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > BODY_CAP) { req.destroy(); return null; }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function bridge(app, subPath, search, req, res) {
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await readBody(req);
    if (body === null) return send(res, 413, 'too large');
  }
  const headers = {};
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  const request = new Request('http://internal' + subPath + search, { method: req.method, headers, body });
  const ctx = { waitUntil: (p) => Promise.resolve(p).catch((e) => console.error('[waitUntil]', e)) };
  const response = await app.worker.fetch(request, app.env, ctx);
  const buf = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(buf);
}

// ---- the 5-minute "cron" ----

let cronRunning = false;
export async function cronTick() {
  if (cronRunning) return;
  cronRunning = true;
  try {
    for (const [name, app] of Object.entries(apps)) {
      if (!app.worker.scheduled) continue;
      if ('VAPID_JWK' in app.env && !app.env.VAPID_JWK) continue; // warned at boot
      const held = [];
      const ctx = { waitUntil: (p) => held.push(Promise.resolve(p)) };
      try {
        await app.worker.scheduled({ scheduledTime: Date.now(), cron: '*/5 * * * *' }, app.env, ctx);
        await Promise.all(held);
      } catch (e) {
        console.error(`[cron:${name}]`, e);
      }
    }
  } finally {
    cronRunning = false;
  }
}
setInterval(cronTick, CRON_MS);
setTimeout(cronTick, CRON_FIRST_MS);

// ---- http server ----

const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/healthz')
      return send(res, 200, JSON.stringify({ ok: true, uptime: Math.round(process.uptime()) }), 'application/json');
    if (u.pathname === '/admin/cron' && req.method === 'POST') {
      // Force one cron pass. Safe unauthenticated: idempotent (maintenance is
      // date-gated, alerts dedup) — handy right after a data migration.
      await cronTick();
      return send(res, 200, 'cron ok');
    }
    const m = u.pathname.match(/^\/api\/(baby|pelvic|contraction)(\/.*)?$/);
    if (m) return await bridge(apps[m[1]], m[2] || '/', u.search, req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    return await serveStatic(u.pathname, req.method, res);
  } catch (e) {
    console.error('[req]', req.method, req.url, e);
    if (!res.headersSent) send(res, 500, 'server error');
    else res.end();
  }
});

process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
process.on('SIGINT', () => process.exit(0));

server.listen(PORT, () => {
  console.log(`[boot] baby suite on :${PORT} — root ${ROOT}, data ${DATA_DIR}, cron every ${CRON_MS / 60000}min`);
});
