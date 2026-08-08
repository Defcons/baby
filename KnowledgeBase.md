# Knowledge Base — baby (apps monorepo)

<!--
  The distilled, canonical TRUTH about how these apps actually behave.
  The MODEL of the repo bible: OrientationMap + NavigationMap = the machine (where code lives) ·
  KnowledgeBase = the model (what's true) · ResearchJournal = the history (how we learned it).
  Rules (from ~/.claude/CLAUDE.md §5): tag every claim; code-owned numbers are trust-but-verify
  with a symbol pointer (code wins conflicts); cross-link, don't copy; promote durable facts from
  the journal in the verifying commit; bump the stamp.
-->

_Last verified: 2026-08-08 — feature-merge reconciliation: baby config (name/born/sex, `babyRev` LWW) added to the merge model; earlier passes as previously stamped. by Claude Opus 4.8_

_Repo bible: [`OrientationMap.md`](OrientationMap.md) + [`NavigationMap.md`](NavigationMap.md) = where the code lives + gotchas · this file = how the apps behave · [`ResearchJournal.md`](ResearchJournal.md) = how it got here._

## How to read this doc
Every claim is tagged — never mix the tiers:
- **[FACT]** — confirmed by code inspection or repeated evidence.
- **[HYP, NN%]** — hypothesis; carries confidence + evidence + the experiment that would settle it.
- **[ASSUMPTION]** — believed but unverified; flagged for challenge.
- **[UNKNOWN]** — an open question (see Open Questions).

Confidence: 20% weak · 40% some · 60% likely · 80% strong · 95% almost certain · 100% repeated.

**Anti-drift:** where a value is code-owned (poll intervals, quotas, TTLs), this file records it with a pointer to the owning symbol and is trust-but-verify — never the place to CHANGE a number. Code wins; correct the KB.

---

## 1. What this is (the system in one paragraph)

- **[FACT]** Three independent single-page baby apps in one repo, each a static `index.html` on GitHub Pages backed by its own Cloudflare Worker + KV namespace for cross-device sync. No build step, no framework — vanilla JS. — `contraction-tracker/`, `baby-tracker/`, `pelvic-trainer/`, root `index.html` landing page.
- **[FACT]** The apps are **fully siloed**: separate localStorage keys, separate sync rooms, separate Workers/KV namespaces. They only share the family password (see §4) and cross-link via header nav icons (⏱️ / 🍼 / 🌸). Changing one app never touches another's data. — OrientationMap "Repo layout".
- **[FACT]** Everything runs on **free tiers by mandate** (Pages/Workers/KV). Free-tier quotas are a hard design constraint, not an afterthought — see §3 and `CLAUDE.md`. — `CLAUDE.md` "Quota-aware design (MANDATORY)".

## 2. Sync — three deliberately different models

The single most important truth about this repo: **each app uses a different sync conflict model, chosen to fit its data**. Do not "unify" them — the differences are the design.

- **[FACT]** **Contraction timer = wholesale last-write-wins.** Full-state LWW; `revision = Date.now()` of the last local mutation; a later revision wins the whole document. Two devices mutating in the same poll window can clobber one tap — **accepted** because in practice one person logs contractions. — `pull`/`pushState`/`applyRemote` in `contraction-tracker/index.html`.
- **[FACT]** **Baby tracker = entry-level merge (CRDT-ish).** Several caregivers log concurrently without losing taps. Entries union by `id`, higher `mt` (modified-timestamp) wins; deletes are tombstones in `deleted{id:ts}` (60-day TTL) that beat presence; `active` timer slots resolve by `mt`; `alerts` is wholesale LWW by `alertsRev`; `baby` (name/born/sex) is wholesale LWW by `babyRev`; entries older than the server watermark `archivedBefore` are dropped. — `normalizeState`/`mergeState`/`stateSig` in `baby-tracker/sync.js` (pure, DOM-free, node-testable).
- **[FACT]** **Pelvic trainer = union-by-id, append-only.** Sessions-only state; sessions are never deleted so there are no tombstones. — `mergeSessions`/`logSig` in `pelvic-trainer/index.html`.
- **[FACT]** **A content-signature gates push to avoid churn loops.** After each pull, a key-order-independent signature (`stateSig`/`logSig`) decides adopt-vs-push; the client pushes only when the remote actually lacks something. Without it, identical re-sends would burn the KV write quota. — `stateSig` (baby), `logSig` (pelvic).
- **[FACT]** **Worker sync contract is uniform.** Every worker exposes `GET`/`PUT /state/:room` with CORS `*`, validating JSON + a numeric `revision`. KV binding is named `STATE` in all three (must match `env.STATE`). — each `worker/index.js`.
- **[FACT]** **KV is eventually consistent cross-colo (up to ~60s), effectively instant same-household** (devices in one home hit the same colo). Apparent staleness when testing across networks is not a bug. — OrientationMap global landmines.

## 3. KV free-tier quota economy (the binding constraint)

- **[FACT]** **The binding limit is not reads — it's LISTS/writes/deletes.** Workers KV free tier: 100k reads/day but only **1k writes, 1k deletes, 1k LISTs** per day. The cheap-looking op class (lists) is the one that bites. — `CLAUDE.md` §1, OrientationMap "KV ops budget".
- **[FACT]** **Steady-state budget across the whole account** (keep under ~20% of every limit): Lists ~10/day, Reads ~36k/day, Writes ~150-400/day. Recorded in OrientationMap "KV ops budget" — update the math there whenever any recurring op is added. — OrientationMap.
- **[FACT]** **Poll intervals are quota-derived, not UX-derived.** `POLL_MS`: contraction **4000** (short session, one user), baby **10000** (one open tab ≈ 8.6k reads/day), pelvic **60000** (sessions change a few times a day). All three **skip polling while `document.hidden`** and pull on `visibilitychange`. — `POLL_MS` in each `index.html`.
- **[FACT]** **The standing patterns that keep it free** (each proven load-bearing by the July 2026 incident, §RJ): never LIST in a hot path (maintain one blob + one index, migrate legacy keys lazily); skip no-op writes (compare before writing); batch a run's bookkeeping into one write; throttle diagnostics/heartbeats (cron heartbeat written at most every 30 min). — `baby-tracker/worker/index.js`, `CLAUDE.md` §4.
- **[FACT]** **Subscriptions are stored as ONE blob per room** (`subs:<room>` keyed by endpoint hash) + a `subsrooms` index, so the every-5-min cron does **zero** KV LISTs. The old per-key `sub:<room>:<hash>` scheme burned ~600 lists/day — the direct cause of the July 2026 quota-warning emails. Legacy keys migrate in lazily and are deleted. — `baby-tracker/worker/index.js`; same pattern in `pelvic-trainer/worker`.
- **[FACT]** **`dailyMaintenance` discovers rooms by listing `room:` keys** — the one remaining sanctioned list, gated to run once/day via a `maint:last` date key. — `baby-tracker/worker/index.js`.

## 4. Auth & room derivation (shared family password)

- **[FACT]** **The sync room is derived from the password, never stored in the repo.** No `#r=` share link in the baby/pelvic apps. Signing in with the shared password on any device lands it in the same room automatically. — `doLogin`/`sha256Hex`.
  - Baby: `room = sha256('baby-room-v1:' + pw)` (or `'baby-room-v1:' + pw + ':' + slug` when a per-baby slug is set) → first 32 hex → `localStorage['babyAuthRoom_v1']`.
  - Pelvic: `room = sha256('pelvic-room-v1:' + pw)` → `localStorage['pfAuthRoom_v1']`. Different salt → separate KV entry from baby, even with the same password.
- **[FACT]** **The page embeds only `PASS_SHA256`** (sha256 of the password) as a login gate. This is bot-deterrence, not security — a short password is brute-forceable and that is accepted. — `doLogin`.
- **[FACT]** **Changing the family password moves every device to a new room** in BOTH the baby and pelvic apps (each derives its room from the password), abandoning the old rooms' KV state. Change it only when logs are empty, or migrate KV first. — OrientationMap global landmines.
- **[FACT]** **The contraction timer is the exception** — it still uses the `#r=<id>` URL-fragment room mechanism (kept out of the public repo), persisted to `localStorage[ROOM_KEY]`; no fragment ever seen → local-only mode. — `contraction-tracker/index.html`.
- **[FACT]** `crypto.subtle` needs a secure context (https or localhost), so the login/room derivation only works served over https or from localhost.

## 5. Push notifications & alerts (baby + pelvic)

- **[FACT]** **Dependency-free Web Push**, hand-rolled: RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID via WebCrypto, verified by an offline encrypt→decrypt round-trip. — `baby-tracker/worker/webpush.js` (pelvic's is a copy).
- **[FACT]** **VAPID private key is a Worker secret (`VAPID_JWK`), never in the repo.** Baby embeds the public key in `index.html`; pelvic serves its public key from `GET /vapid` (fetched + cached client-side). — worker `wrangler.toml` secrets, `genvapid.mjs` (pelvic).
- **[FACT]** **Apple rejects VAPID JWTs with exp > 24h → tokens use 12h.** — `webpush.js`.
- **[FACT]** **Alert rules are evaluated server-side by the cron** (`*/5 * * * *`) so notifications fire with the app closed. Rules are **per-device**, uploaded with the push subscription (`{...sub, alerts}`); a legacy shared-`alerts` field is dual-written so an un-redeployed worker keeps working. — `checkAlerts`/`dueAlerts`, `subscribePush`.
- **[FACT]** **Criticality tiers** drive repeat cadence: `low` silent/once · `normal` sound/repeat 30 min · `high` "Nag" 10 min + sticky · `alarm` every cron run + rings locally. Alerts fire on crossing, repeat per tier while the condition holds, reset when it clears; per-device quiet hours suppress (tz via `Intl`, invalid tz fails open). — `checkAlerts`, `inQuietHours`, `REPEAT_MS`.
- **[FACT]** **iOS push only works installed to the Home Screen** (`isStandalone` gate shows a hint otherwise). — `baby-tracker/index.html`.
- **[FACT]** **Ringing "alarm" tier rings on any open tab** via a WebAudio loop (unlocked on first pointer gesture) + a full-screen stop overlay; logging the activity on any device silences it within a poll. Stop snoozes 15 min. — `evalLocalAlarms`/`stopAlarm`.

## 6. Durability, archival & PWA

- **[FACT]** **The hot state blob is kept under Cloudflare's 500KB PUT limit forever** by daily archival: entries older than `HOT_DAYS` (**35**) move into `archive:<room>:<YYYY-MM>` keys (union by id) and the `archivedBefore` watermark advances on the trimmed hot state. Archived entries are read-only (history/CSV); clients drop them from hot copies via the watermark. — `dailyMaintenance`, `HOT_DAYS`, `archivedBefore` in `baby-tracker/worker/index.js` + `sync.js`.
- **[FACT]** **`dailyMaintenance` snapshots each room to `backup:<room>:<date>` (14 kept) before trimming.** 404/410 push responses prune dead subscriptions. — `baby-tracker/worker/index.js`.
- **[FACT]** **The baby tracker + pelvic trainer are installable PWAs** with a service worker; same-origin GETs are **network-first with cache fallback** so offline works and deploys are never stale. **The contraction timer is NOT a PWA** — no manifest, no service worker (verified 2026-08-03; this fact previously overclaimed "all three"). — `baby-tracker/`, `pelvic-trainer/` `sw.js` + `manifest.webmanifest`.
- **[FACT]** **Home Assistant integration (baby only):** `POST /log/:room` appends one validated entry server-side (default `by` "Home Assistant"); `GET /summary/:room` returns gaps/today-counts JSON for an external sensor — poll it at ≥120s (budgeted ≈720 reads/day). Room id is the credential, copyable from the 🔔 modal. — `baby-tracker/worker/index.js`, `homeassistant/`.

## 7. Cross-cutting behaviors & gotchas (truth, not navigation)

- **[FACT]** **GitHub Pages serves `Cache-Control: max-age=600`** — for up to ~10 min after a push, browsers/CDN can serve the OLD page. Verified symptom: after a password-hash change the new password gets "Wrong password" because the cached page still embeds the old hash. Hard-refresh or wait; don't debug the app. — OrientationMap global landmines.
- **[FACT]** **Themes are per-device and NOT synced** — separate keys per app (`ctTheme`/`btTheme`/`pfTheme`); an inline head script applies `data-theme` pre-paint. — each `index.html`.
- **[FACT]** **Alert prefs, log filters, UI mode, timeline span are all per-device** (localStorage), not synced — only the actual logged data + (legacy) shared alert config sync. — `baby-tracker/index.html`.
- **[FACT]** **24-hour clock is forced regardless of device locale**, and all "today" boundaries use Europe/Oslo (a timezone audit fixed a CSV UTC-date bug + added Oslo fallbacks). — see `ResearchJournal.md` (2026-07 timezone audit).
- **[FACT]** **Age-aware urgency colors (baby):** feed/diaper/awake gap thresholds loosen with the baby's age (birth date from the synced baby config since `f543e9b`; `AGE_BANDS`, `ageThresholds`) — newborn feed 2.5/3.5h → 12m+ feed 5/6h, etc. Nurse color uses the overall feed gap and pauses while nursing; awake color pauses while the sleep timer runs. — `baby-tracker/index.html`.
- **[FACT]** **Worker PUTs can return CF edge error 1042 for ~1 min after a fresh deploy** — transient, retry. — OrientationMap global landmines.
- **[FACT]** **Single-household trust model:** all three workers expose CORS `*`, no rate limiting, and **no data-deletion endpoint** — acceptable for one family; these were the key blockers in the 2026-08-03 Play-Store feasibility audit (decision: stay personal — see `ResearchJournal.md`).

## 8. Confirmed issues — OPEN

- **[OPEN, accepted]** Contraction timer's wholesale LWW can clobber a concurrent tap in the same poll window. Documented + accepted (single logger in practice) — not a bug to "fix". — §2.
- **[OPEN, ops]** A stale Android WebAPK may show the old app name after a rename; needs uninstall/re-add to pick up `application-name`/manifest `id`. — NavigationMap §Baby activity tracker.

## 9. Open questions / future experiments

- **[UNKNOWN]** Actual measured daily KV op counts vs the OrientationMap budget — the budget is a computed estimate (frequency × ops × devices), not a metered reading. A Cloudflare analytics pull would confirm headroom. The July 2026 incident is the only ground-truth data point so far.
- **[UNKNOWN]** Whether the 60-day tombstone TTL (baby deletes) is long enough for a device that goes offline > 60 days — a returning stale device could resurrect a deleted entry. Untested edge case.

## 10. Confidence summary

Best-understood (≥95%): the three sync models, the KV quota economy + budget, room-derivation auth, the push/alert architecture, and the archival watermark — all read straight from code and corroborated by the git history. Weakest (UNKNOWN): real metered KV usage vs the computed budget, and the long-offline tombstone edge case. These are the priorities for the next verification pass.
