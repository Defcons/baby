# ToDo — baby (apps monorepo)

<!-- STRICT deferral ledger (six-doc bible; rules in ~/.claude/CLAUDE.md §5): EVERY deferred
     item, idea set aside, or "later" promise gets logged here AT THE MOMENT of deferral —
     nothing lives only in chat. Prune the Done section on next touch. Privacy rule applies
     here too: infra topology stays in the PRIVATE homelab run-book; items point, not copy. -->

_Updated 2026-08-08 — self-hosting migration queue, post feature-merge + history-squash decision (ResearchJournal 2026-08-08)._

## Open

- [ ] **Rehearsal room** (David's phones — Testing.md #1, blocks cutover): private run-book §1f.
- [ ] **Cutover evening** (after rehearsal passes): migrate data (dry-run first, eyeball counts), switch every family device AND the HA URLs the same evening, remove old github.io PWA icons. Ground rule: nobody logs on the old origin mid-window.
- [ ] Copy `backups/baby-full-history-2026-08-08.bundle` (the only archive of the pre-squash history) into the offsite backup set.
- [ ] **Watch period → retirement** (1–2 weeks after cutover): flip `MOVED_BANNER` ×3 apps, final snapshot, delete the three CF workers, disable GitHub Pages, consider flipping the repo private, rewrite the then-obsolete quota docs (OrientationMap KV budget, CLAUDE.md quota mandate, KnowledgeBase §3) + graduate Testing.md items.
- [ ] Add `/healthz` on the new origin to the homelab uptime monitoring once live — alert delivery depends on the home server now (was Cloudflare's SLA).
- [ ] _(pre-existing, RJ backlog)_ The docs-claimed node tests (`sync.js` merge, `checkAlerts`/`dueAlerts`) are not in the repo — find or rebuild before next touching merge/alert logic.

## Blocked / needs the user

## Done (prune on next touch)

- [x] 2026-08-08: server host setup through healthz (private run-book §1a/§1b/§1d) — build green, `.env` loaded, deploy key + script entry installed.
- [x] 2026-08-08: feature-merge with the remote line reconciled (growth chart / bath / grams / paging / age chip preserved together with the origin-aware self-host work).
- [x] 2026-08-08: history squash landed — clean root force-pushed as `main`, `selfhost` branch deleted, full history bundled locally; first CI deploy green end-to-end; server clone on `main`.
- [x] 2026-08-08: infra complete + verified — firewall rule with positive/negative probes, tunnel hostname + proxy host, split-horizon confirmed, `https://baby.defc0n.no/healthz` green from LAN and public DNS live (Testing.md #3 graduated to the private run-book's security record).
