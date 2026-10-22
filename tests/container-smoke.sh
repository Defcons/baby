#!/usr/bin/env bash
# The production container in its real shape (docker-compose.yml and the Dockerfile, as the server runs them). The data
# folder starts the way a host can leave it: another user's files, a root-owned file, a folder only its owner can open.
# The init step must give all of it to uid 10001, then the server turns healthy as 10001 on a read-only filesystem, no
# process in it runs as root, and a save through the API lands in the data folder as 10001. A second `up` (what a deploy
# does) must give a file made as root in the meantime to 10001 again. Needs Docker and sudo, as on CI's runner:
#   bash tests/container-smoke.sh
set -euo pipefail
cd "$(dirname "$0")/.."
D="$(mktemp -d)"
sudo install -d -o 1000 -g 1000 -m 750 "$D/data" "$D/data/baby"
sudo install -o 1000 -g 1000 -m 640 /dev/null "$D/data/baby/room~old"
sudo install -o 0 -g 0 -m 600 /dev/null "$D/data/restored-as-root"
touch .env   # compose's env_file; the server's own has the push keys, CI an empty one
export BABY_DATA="$D/data" BABY_PORT=8080 BABY_PUBLISH=18080
C="docker compose -p baby-smoke"
fail() { echo "FAIL: $*" >&2; exit 1; }
trap 'rc=$?; [ "$rc" -eq 0 ] || $C logs --tail 80 >&2 || true; $C down -v >/dev/null 2>&1 || true; sudo rm -rf "$D"' EXIT
not_ours() { sudo find "$D/data" \( ! -uid 10001 -o ! -gid 10001 \) | head -5; }

$C up -d --build --wait --wait-timeout 120

other=$(not_ours)
[ -z "$other" ] || fail "the init step left files in the data folder that are not 10001's: $other"
uids=$(docker top baby -o pid,uid | awk 'NR>1{print $2}' | sort -u | tr '\n' ' ')
[ "$uids" = "10001 " ] || fail "the container's processes run as uid(s) $uids, not 10001 alone"
[ "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' baby)" = true ] || fail "the root filesystem is not read-only"
$C exec -T baby sh -c 'echo ok > /tmp/t.txt' || fail "/tmp is not writable"

url=http://127.0.0.1:18080
curl -fsS "$url/healthz" >/dev/null || fail "/healthz does not answer on the published port"
curl -fsS -X PUT -H 'Content-Type: application/json' --data '{"revision":1}' "$url/api/contraction/state/smoke-room-01" >/dev/null ||
  fail "the API did not take a save"
[ "$(curl -fsS "$url/api/contraction/state/smoke-room-01")" = '{"revision":1}' ] || fail "the save did not read back"
sudo test -f "$D/data/contraction/room~smoke-room-01" || fail "the save is not in the data folder"
[ "$(sudo stat -c %u "$D/data/contraction/room~smoke-room-01")" = 10001 ] || fail "the saved file is not 10001's"

sudo install -o 0 -g 0 -m 600 /dev/null "$D/data/made-as-root-later"
$C up -d --wait --wait-timeout 120
other=$(not_ours)
[ -z "$other" ] || fail "a second up left files in the data folder that are not 10001's: $other"
echo "container smoke: PASS (init gave the data folder to 10001 on both ups, server as 10001 alone, read-only, a save lands as 10001)"
