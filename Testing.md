# baby (apps monorepo) — Pending Tests (unconfirmed)

<!-- STRICT pending-manual-test queue (six-doc bible; rules in ~/.claude/CLAUDE.md §5): every
     item = repro steps + pass criteria, runnable cold. Once CONFIRMED, graduate the fact
     (KnowledgeBase / the maps) and DELETE the item — this file holds only the unconfirmed. -->

_Updated 2026-08-08. Machine-verified (not needing human re-test): server static+API round-trips ×3 apps, `/vapid` derivation ×2, deny/redirect/cache headers, the full backup+archival cycle through the file KV, `migrate.mjs`'s fetch→snapshot→PUT→byte-verify path, and the live domain end-to-end (public DNS, split-horizon, TLS, merged app served). Item #3 (firewall probes) confirmed 2026-08-08 and graduated; numbering keeps its gap._

## 1. Rehearsal room end-to-end on baby.defc0n.no — BLOCKS CUTOVER
**Steps:** `server/DEPLOY.md` §1f — on two devices, open `https://baby.defc0n.no/baby-tracker/`, sign in with the family password + slug `rehearse` (isolated empty room). Log a feed on device A. Enable 🔔 notifications on both, send Test. Set the feed alert to 1 min / crit `low`, close the app, wait.
**Pass:** A's entry appears on B in ≤5 s; Test push arrives on both; the feed alert push arrives ≤5 min with the app closed; the 🔔 diagnostics line shows a cron run ≤5 min old.

## 2. Offline-first on the new origin
**Steps:** with the rehearsal room installed as PWA, airplane-mode the phone, reopen the app, log an entry, restore network.
**Pass:** app opens from the SW cache while offline; the entry exists locally; it reaches the other device within one poll (≈3 s) of reconnecting.

## 4. Home Assistant against the new origin (after cutover §2.6)
**Steps:** trigger the HA log path (voice or service call: log a diaper), then wait one summary scan interval.
**Pass:** entry appears in the app with `by: Home Assistant`; the summary sensor updates ≤2 min; no errors in the HA log.

## 5. Post-migration data integrity on every family device (cutover §2.4)
**Steps:** on each device after signing in on the new origin, compare: total entry count, newest entry, 7-day history totals vs the `migrate.mjs` printout; export CSV once.
**Pass:** counts match exactly on every device; running timers (if any) show correctly; CSV contains the full history.

## 6. Push survives a quiet week (background, low priority)
**Steps:** none — after cutover, just note which device goes longest without opening the app.
**Pass:** a device that hasn't opened the app for >1 week still receives an alert push (proves `ensurePush` re-registration + endpoint stability against the new VAPID keys).
