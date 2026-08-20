# OrientationMap — baby (apps monorepo)

<!-- The INJECTED map hub (six-doc bible; rules in ~/.claude/CLAUDE.md §5): bounded orientation
     ONLY — shape, subsystem index, GLOBAL cross-cutting landmines, the account-wide KV ops
     budget. Per-file symbols + app-LOCAL gotchas live in NavigationMap.md — read its section
     when entering an app, and land new map knowledge THERE by default (promote here only what
     bites from UNRELATED work). Anchor to SYMBOLS, never line numbers. Target ≤ ~20 KB.
     The stamp below is ONE line, not a changelog. -->

_Last verified: 2026-08-20 @ 14dc005 — bible verification pass: file paths and the subsystem index re-checked against code, no drift found. KV budget + landmines still describe the live Pages/Workers stack until cutover._

## What this is
A family of small baby apps, one folder per app — historically a static page on GitHub Pages + a Cloudflare Worker per app for cross-device sync; NOW MID-MIGRATION to one self-hosted server (`server/` — NavigationMap §Self-host server, RJ 2026-08-08; deployment topology lives in the PRIVATE homelab run-book). Both stacks run in parallel until cutover; the pages are origin-aware.

## The repo bible (this file is one of six — §5)
- **`OrientationMap.md`** (this) = the injected hub: shape, subsystem index, global landmines, the KV ops budget.
- **`NavigationMap.md`** = per-app detail: file/symbol pointers, app-local gotchas. Entering an app = read its section FIRST; new map knowledge lands there BY DEFAULT.
- **`KnowledgeBase.md`** = the MODEL: distilled TRUTH about how the apps behave (the three sync models, quota economy, auth/rooms, push) with FACT/HYP tags. Read first for behaviour/design reasoning.
- **`ResearchJournal.md`** = the HISTORY: append-only milestone ledger + the July 2026 KV-quota investigation + open backlog.
- **`ToDo.md`** = STRICT deferral ledger — everything set aside, recorded at the moment of deferral.
- **`Testing.md`** = STRICT pending-manual-test queue — repro steps + pass criteria, runnable cold.
- **Boundary:** code-owned numbers live in CODE; KnowledgeBase records them trust-but-verify with a symbol pointer (code wins conflicts); the Journal narrates how each was learned. Cross-link, don't duplicate.
- Other layers: `CLAUDE.md` (quota-aware design rules — MANDATORY before adding ANY recurring operation).

## Repo layout & conventions
- **`index.html`** (root) — tiny landing page linking the apps; no logic, reuses either app's saved theme pref.
- **`contraction-tracker/`** — contraction timer (`index.html` + `worker/`).
- **`baby-tracker/`** — feeds/diapers/sleep tracker (`index.html` + `worker/`).
- **`pelvic-trainer/`** — postpartum pelvic floor exercise trainer (`index.html` + `worker/`).

Apps cross-link via small nav icons in the header (⏱️ / 🍼 / 🌸) but are fully independent — separate localStorage keys, separate sync rooms, separate Workers/KV namespaces. Each `worker/` dir contains `index.js` + its own `wrangler.toml`; deploy from inside that dir with `npx wrangler deploy` (needs `wrangler login`, account davidsen908).

History note: the repo began as `contraction-timer` with the timer at the root; it was renamed/restructured 2026-07-19. GitHub Pages URLs moved (`/contraction-timer/` → `/baby/contraction-tracker/`) but localStorage survived since it's keyed by origin, so existing devices kept their sync room + log without re-opening a share link.

## Subsystem index
_One row per app; the full file/symbol detail + app-local gotchas live in [NavigationMap.md](NavigationMap.md) under the same heading. Behaviour truths → KnowledgeBase; the "how we found it" → ResearchJournal._

- **Contraction timer** — the original app: vanilla-JS timer, wholesale last-write-wins full-state sync, `#r=<id>` fragment room (the one app still using share links). Entry: `contraction-tracker/index.html` (the whole app), `contraction-tracker/worker/index.js` (Worker `contraction-sync`). → Nav §Contraction timer
- **Baby activity tracker** — feeds/diapers/sleep local-first PWA; ENTRY-LEVEL merge sync (concurrent caregivers never lose taps), password-derived room, server-side cron alerts + web push, daily backup/archival, Home Assistant endpoints. Entry: `baby-tracker/index.html`, `baby-tracker/sync.js` (pure merge logic), `baby-tracker/worker/index.js`, `baby-tracker/worker/webpush.js`. → Nav §Baby activity tracker
- **Pelvic trainer** — guided pelvic-floor (PFMT) session player + synced session log (union-by-id, sessions never deleted) + per-device time reminders via cron push; same family password, different room salt. Entry: `pelvic-trainer/index.html`, `pelvic-trainer/worker/index.js` (Worker `pelvic-reminders`). → Nav §Pelvic trainer

## KV ops budget (free tier: 100k reads / 1k writes / 1k deletes / 1k LISTS per day — see CLAUDE.md)

Approximate steady state across the whole account (update when adding any recurring operation):

- **Lists ~10/day** (was ~865 before 2026-07 blob-storage fix): only `dailyMaintenance` room/backup scans. NEVER add a list to a cron or request hot path.
- **Reads ~36k/day**: baby-tracker polls (10s, ~3 visible tabs ≈ 26k) + pelvic polls (60s ≈ 1.4k) + crons (2×288 runs × ~4 reads ≈ 2.3k) + Home Assistant `/summary` sensor (120s scan ≈ 720) + page loads. Hidden tabs don't poll.
- **Writes ~150-400/day**: state PUTs per logged event, alerted/sent maps (batched, written only on change), cron heartbeat (≤48), sub blobs (only when actually changed).

## Global landmines
_Cross-cutting rules that bite from ANY task. App-LOCAL gotchas → NavigationMap; the discovery saga is in ResearchJournal._

- GitHub Pages serves with `Cache-Control: max-age=600`: for up to ~10 min after a push, browsers (and the CDN) can serve the OLD page even though curl from another network sees the new one. Verified symptom: after a password-hash change, the correct new password gets "Wrong password" because the cached page still embeds the old hash — hard-refresh or wait, don't debug the app.
- Changing the family password moves every device to a different sync room in BOTH the baby tracker and the pelvic trainer (each derives its room from the password with its own salt), abandoning the old rooms' KV state — change it only when the logs are empty, or migrate the KV values first.
- KV is eventually consistent cross-colo (up to ~60s); same-household devices hit the same colo so sync is effectively instant. Don't "fix" apparent staleness when testing from different networks.
- Worker PUTs can return CF edge error 1042 for ~1 min right after a fresh deploy — transient, retry.

## Deferred
`ToDo.md` is the STRICT deferral ledger; `Testing.md` is the pending-manual-test queue (both seeded empty in the 2026-08-03 six-doc migration; items deferred before then live in ResearchJournal "Open questions / backlog"). Headline gap: the docs' claimed node tests (`sync.js` merge, `checkAlerts`/`dueAlerts`) are NOT in the repo — locate or rebuild them before next touching merge/alert logic (RJ backlog).
