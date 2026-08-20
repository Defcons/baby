# Research Journal — baby (apps monorepo)

<!--
  The append-only chronological history: how this repo got to where it is.
  The HISTORY of the repo bible: OrientationMap/NavigationMap = the machine · KnowledgeBase = the model · this = the history.
  Rules (from ~/.claude/CLAUDE.md §5): append, never rewrite; log in-flight work here with pending
  verdicts; when an iteration confirms a durable fact, PROMOTE the distilled statement to
  KnowledgeBase.md; cross-link, don't copy; bump the stamp.
-->

_Last verified: 2026-08-20 @ 14dc005 — appended the 2026-08-20 bible verification pass entry (no drift found)._

_Repo bible: [`OrientationMap.md`](OrientationMap.md) + [`NavigationMap.md`](NavigationMap.md) = where the code lives · [`KnowledgeBase.md`](KnowledgeBase.md) = what's true now · this file = how it got here._

## What this is / mission
A family of small, single-purpose baby apps (contraction timer, activity tracker, pelvic-floor trainer) built for one household, each a free-tier static page + Cloudflare Worker. There is no experiment loop here in the Dreadmark sense; this journal is a **chronological milestone ledger** distilled from the git history, plus the one genuine investigation the project has had (the July 2026 KV-quota incident). When a durable behavioral fact settles, it is promoted to `KnowledgeBase.md`.

## Standing rules of the repo
- **Free tier is a hard constraint.** Any change adding a recurring operation (cron, poll, per-load hook, new device sharing a namespace) must redo the ops math and update the OrientationMap "KV ops budget". — `CLAUDE.md`.
- **Snapshot live KV state to `backups/` (gitignored — the room id is the credential) BEFORE pushing app changes.**
- **Hand-edited pages win.** These are David's household apps; match existing vanilla-JS style, no build step, no framework.

## Current state (read this first)
- Three shipped, in-use apps: `contraction-tracker/`, `baby-tracker/`, `pelvic-trainer/`, plus a root landing page. All on GitHub Pages + per-app Cloudflare Workers/KV.
- The baby tracker is the most-developed: entry-merge sync, PWA + server-side push alerts with criticality tiers, timeline, archival, Home Assistant integration.
- KV usage is comfortably back under the free tier after the July 2026 ~100× list-quota cut (see below). Steady-state budget lives in `OrientationMap.md`.
- The tracker went from prenatal build to daily live use around the birth (mid-2026; the birth date lives in the synced baby config — was hardcoded `BIRTH_TS` until `f543e9b` — and per the privacy rule stays out of this repo).

## Milestone ledger (chronological, from git history)

| date / commit | milestone | what shipped / was learned |
|---|---|---|
| origin `f9c643f` | **Contraction timer static site** | The repo began as a single static contraction timer (`contraction-timer` at the root). |
| `983a671` | **Cross-device sync** | Added the Cloudflare Worker + KV sync layer (wholesale LWW, `revision = Date.now()`); fixed stale stats on reset. Established the `GET/PUT /state/:room` worker contract reused by every later app. |
| `5dc9989`+ | **CODE-MAP + theme/edit** | First CodeMap; light/dark theme (per-device, not synced), per-row edit/delete, average-window picker, optional note field. |
| `d942eda` | **Baby activity tracker added** | Second app alongside the timer: feeds/diapers/sleep. Chose **entry-level merge** (not the timer's wholesale LWW) so multiple caregivers never lose taps — the first deliberate divergence in sync model. |
| `76e7a0e` | **Monorepo restructure (2026-07-19)** | `contraction-timer` → `contraction-tracker/` + `baby-tracker/`. Pages URLs moved but localStorage survived (keyed by origin), so devices kept their room + log without re-sharing. |
| `3845f34` | **Login gate + password-derived rooms** | Baby tracker got the full-screen login gate; the sync room is **derived from the shared password** (`sha256('baby-room-v1:'+pw)`), removing the `#r=` share link for that app. Wheel-picker quick-log, 24h timeline. |
| `48e698b` → `665b1c9` | **PWA + web push + criticality** | Dependency-free Web Push (RFC 8291/8292 via WebCrypto, offline round-trip tested); server-side cron evaluates shared alert rules so notifications arrive with the app closed. Then per-alert criticality (Quiet / Normal / Nag). |
| `6b5686f` | **Durability + coverage overhaul** | Full-audit pass hardening merge/tombstone/archival correctness. |
| `af4b363` … `56087ed` | **Baby tracker UX overhaul** | Timeline detail + span toggle, tablet two-column layout, quick mode, date editing; collapsible day sections + type filter chips; clock-time x-axis + draggable scrubber; auto-stop a running sleep when activity is logged (`autoWake`); custom inline-SVG diaper/pump icons. |
| `066a7af` | **Per-device alerts + Alarm tier + diagnostics** | Alert rules moved from one shared config to **per-device** (uploaded with each push subscription); added the ringing `alarm` tier and the in-app cron/subscription diagnostics line. Legacy shared-`alerts` field dual-written for un-redeployed workers. |
| `094cdca` | **Pelvic trainer added (3rd app)** | Guided postpartum pelvic-floor trainer + reminder worker; **union-by-id append-only** sync (sessions never deleted → no tombstones — the third distinct sync model). Shares the family password with a different room salt. |
| **`15824e4`** | **KV ops cut ~100× (THE incident)** | See investigation below. The July 2026 quota-warning emails were traced to the every-5-min cron's **per-key subscription LIST scans** (~600 lists/day, 87% of the 1k/day list quota). Fix: store subscriptions as ONE blob per room + a `subsrooms` index; cron now does **zero** lists. Legacy `sub:*` keys migrate in lazily. Promoted to `KnowledgeBase.md` §3. |
| `e89c76f` | **Timezone audit** | Fixed a CSV UTC-date bug; Europe/Oslo "today" fallbacks throughout. |
| `2ad1ed8` | **Force 24h clock** | All apps display 24h regardless of device locale. |
| `a9a045a` | **Quota rule codified** | Added the mandatory "quota-aware design" section to `CLAUDE.md` + the KV ops budget to CodeMap — the incident's lesson turned into a standing rule so it can't recur silently. |
| `2a81d84` → `6a6ad7e` | **Home Assistant integration** | `POST /log/:room` (server-side entry append) + `GET /summary/:room` (gaps/counts sensor JSON, ≥120s poll); later HA voice scripts + worker timer actions. |
| `f543e9b` | **Configurable baby name + one room per baby** | Baby name + birth date configurable; room derivation gained an optional `:slug` (`'baby-room-v1:'+pw+':'+slug`) so one family can run separate rooms per baby. _(CodeMap still shows the pre-slug derivation — minor drift, noted in KB §4.)_ |
| `028988d` | **Triad naming** | `CODE-MAP.md` → `CodeMap.md` across all repos (this deep-pass round). |

## Investigation: the July 2026 KV list-quota blowout (`15824e4`)

The one real debugging episode, worth keeping because it produced the repo's governing constraint.

- **Symptom:** Cloudflare quota-warning emails — the KV **daily list quota** (1k/day) was ~87% consumed while reads/writes were nowhere near their limits.
- **Root cause:** the baby-tracker cron (`*/5 * * * *` = 288 runs/day) discovered push subscriptions by **LIST-scanning `sub:<room>:<hash>` keys** every run — ~600 lists/day from that one path. The binding limit was the op class nobody watches (lists), not reads.
- **Fix:** collapse all of a room's subscriptions into ONE blob (`subs:<room>`, keyed by endpoint hash) + a `subsrooms` index the cron reads directly → **zero lists** in the hot path. Legacy per-key subs migrate in lazily on first access, then are deleted. Identical re-subscribes skip the write. The same one-blob pattern was applied to the pelvic trainer's `subs` blob.
- **Durable lessons (promoted to `KnowledgeBase.md` §3 + `CLAUDE.md`):** (1) know the per-class limits before designing — the cheap-looking class is rarely the binding one; (2) **never LIST in a cron/poll/per-load hot path** — maintain index+blob keys instead; (3) write the ops math down and keep every class under ~20% of its limit; (4) the only remaining sanctioned list is `dailyMaintenance`'s once-a-day `room:` scan.

## 2026-08-03 — Play-Store feasibility audit (decision: stay personal)

Considered publishing the three apps as separate, de-linked Play Store apps (TWA route). Full audit run against `613efc8`; verdict: packaging is the easy ~15% — the apps are **single-household by design**, and public distribution would mean reworking auth, quota economics, and multi-tenant assumptions. **David's decision: not worth it — staying personal projects.** Don't re-propose unless distribution intent actually changes.

Findings worth keeping (all verified in code this pass):
- **Password-derived rooms collide across strangers** — `sha256('baby-room-v1:'+pw)` means two families picking the same password would silently share a room. Fine for one household; the core public-distribution blocker.
- **Free tier structurally cannot serve the public**: 1k KV writes/day ≈ 20–40 active families total; free-plan cron limits (50 subrequests/invocation, ~10ms CPU vs per-push WebCrypto) bind at ~a dozen rooms. A paid tier would be the floor — mandate exception never needed since we're staying personal.
- baby + pelvic embed the **same `PASS_SHA256`** (shared family password confirmed in code); workers are CORS `*`, no rate limiting, **no deletion endpoint** (promoted to KB §7 as the "single-household trust model" fact).
- **The contraction tracker is not a PWA** (no manifest/sw) — KB §6 had overclaimed "all three"; corrected this pass.
- `Europe/Oslo` hardcoded in 6 places (baby app ×1, baby worker ×2, pelvic worker ×3) — correct for one family, would break multi-tenant.
- Same pass reconciled doc drift: CodeMap now records the `:slug` room variant and the configurable birth date (`f543e9b` removed `BIRTH_TS`).

## 2026-08-08 — Self-hosting migration IN FLIGHT (`selfhost` branch)

Motivation (David): worker latency feel, dislike of the github.io URL, wanting the stack on the home server. Decision: all three apps move to **`baby.defc0n.no`**, self-hosted (ingress model per the private homelab config); Workers/KV/quotas exit entirely. Hard constraints from David: **no downtime, no data loss.**

Built this session (branch `selfhost`, NOT yet merged or deployed):
- `server/`: file-backed KV shim (`:`→`~`, atomic writes) + Node bridge running the three **unchanged** worker fetch handlers + 5-min internal cron + `/healthz` + idempotent `POST /admin/cron`; the baby worker gained `GET /vapid` (mirrors pelvic).
- Packaging: node:22-alpine Dockerfile + compose + GH Actions deploy over the tailnet; the run-book lives in the private homelab config (`server/DEPLOY.md` here is a pointer stub).
- Origin-aware clients (`SELF_HOSTED` sniff): github.io keeps the legacy workers → both stacks run in parallel with zero flag-day; self-hosted uses same-origin `/api/*`, baby poll 10s→3s, VAPID fetched from `/vapid`; SWs exclude `/api/*` (caches bumped `bt-v3`/`pf-v2`); gated `MOVED_BANNER` pre-staged for retirement.
- `server/tools/migrate.mjs`: snapshot-FIRST copier with GET-back byte-verify; baby archives are moot for now (`HOT_DAYS` 35 vs the age of the log) but handled anyway.

Machine-verified (local smoke, Node 24): static+API round-trips ×3 apps, `/vapid` derivation ×2 (proves the WebCrypto push path in Node), deny/redirect/cache headers, the **full backup+archival cycle through the shim** (backup~ key, `archive~…~2026-06`, watermark, hot-trim), and migrate.mjs end-to-end against the local server. Two things learned: WHATWG URL normalizes `../` before handlers see it (the resolve+prefix guard is the backstop, not the first line); the boot-time first cron tick claims `maint:last` for the day, so data imported after boot gets its first DAILY backup the next UTC day — accepted, migrate snapshots cover day 0.

Pending → ToDo.md (David's infra hour + merge call) and Testing.md (#1 rehearsal e2e blocks cutover). Retirement (incl. rewriting the then-obsolete KV-budget docs) comes after the 1–2 week parallel watch.

## 2026-08-08 (later) — Remote divergence discovered; public history squashed

Right before the infra hand-off, the merge push bounced: `origin/main` carried **25 commits made away from this laptop** — two weeks of baby-tracker features in live family use (WHO weight-for-age growth chart keyed on `baby.sex`, bath entry type, weights in grams, log paging, selectable history average window, age chip), plus an MIT license and a personal-data scrub that also codified the CLAUDE.md privacy rule. The local clone had never pulled, so today's self-host work (and the first server build) sat on a 2-week-stale app. Reconciled by merge on `squash-prep`: their features and the origin-aware self-host edits coexist (one doc conflict — the map absorbed their `CODE-MAP.md` updates).

The bounce also triggered a **full public-history audit** (David raised the bar to "absolutely safe to have public"). Findings across all 85 commits: **room ids never leaked** (the data credential is clean — no password rotation needed); the baby's name and the old hardcoded birth date exist in pre-scrub history; today's branch leaked infra topology (run-book + ledger passages + two commit messages). Decision (David): **squash the public history to a single audited root** — full history preserved in the private Gitea first, name/birth-date/topology scrubbed from the tip everywhere, run-book relocated to the private homelab config. Rationale: proving 85 trees clean of every string variant is exactly the verification trap the homelab audit documented; one fresh grep-audited tree is provable.

Lessons, both promoted to practice: (1) **fetch and compare against origin before building on any repo** — a clean `git status` says nothing about the remote; (2) topology-bearing run-books belong in the private config repo from the first line, never retrofitted out of a public one.

## 2026-08-08 (evening) — CUTOVER EXECUTED: the family runs self-hosted

David ran the real migration at 14:31 (ahead of script — the rehearsal folded into device setup). Verification was programmatic, not eyeballed: old-vs-new state diff **identical** (510 entries, matching id sets in both directions, same revision, same live sleep timer), pelvic 1/1, cron warmed, `/summary` live on the new origin, HA repointed (David-confirmed), phones switched the same evening. The freeze rule held — zero entries logged old-side after the copy. The old Pages/Workers stack stays untouched as the fallback through a 1–2 week watch (retirement checklist in ToDo).

Post-cutover model: same worker logic and entry-merge sync, served by the home container; 3 s polls (origin-aware constant); pushes sent by the container's internal cron through the browsers' push services. Remaining human proofs live in Testing (first real closed-app alert, offline round-trip, push after a quiet week).

## 2026-08-20 — Bible verification pass (no drift found)

Scheduled maintenance pass, 12 days into the post-cutover watch period (not yet due — ~2026-08-22). Re-verified all six docs against the two feature commits made since the last pass (`b47d061`/`14dc005`, multi-day timeline + days-view type chips) — both had already self-updated NavigationMap/Testing correctly. Checked every file path, a ~30-symbol sample spanning all three apps + the server, and the quota constants (`POLL_MS`×3, `HOT_DAYS`, `NURSE_TIMER_MS`/`SLEEP_TIMER_MS`) against code: all exact, zero stale pointers found. Confirmed no `docs/` dir exists yet (root stays the doc home) and no share-link/token leaked into any doc. Only change this pass: the six stamps.

## Open questions / backlog
- Confirm the OrientationMap KV budget against **metered** Cloudflare analytics (the budget is currently a computed estimate; the incident is the only ground-truth data point).
- Tombstone TTL (60 days, baby deletes) vs a device offline > 60 days — untested resurrection edge case (KB §9).
- Helm mesh gap and other per-app polish items live in each app; this journal tracks cross-repo milestones, not per-app TODOs.
- NavigationMap (§Baby activity tracker) says `sync.js` is "eval'd by node tests" and `checkAlerts`/`dueAlerts` are "exported for tests", but **no test files exist in the repo** (globbed `**/*test*` + `**/*.mjs` on 2026-08-03 — only `genvapid.mjs`). Find where they live (untracked? another machine?) or rebuild them before next touching merge/alert logic.
