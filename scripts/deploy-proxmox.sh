#!/usr/bin/env bash
# Deploy SkinCapital to the Proxmox LXC from this machine (run in Git Bash).
#
# Procedure (the box has NO dev tooling — never build there):
#   1. build the SPA locally (npm run build)
#   2. git archive HEAD  → source tarball (no node_modules/.env/data — they're
#      gitignored, so extracting over /opt/cs2 keeps the box's .env + DB)
#   3. push both tarballs into the container, extract, npm install --omit=dev
#      (tsx is a prod dep, the runtime needs no devDeps), replace dist/
#   4. systemctl restart cs2, then HTTP health check
#
# Usage: scripts/deploy-proxmox.sh [--skip-checks]
#   PVE_HOST (default root@192.168.1.50), CTID (default 107) overridable via env.
set -euo pipefail

PVE_HOST="${PVE_HOST:-root@192.168.1.50}"
CTID="${CTID:-107}"
APP_DIR="/opt/cs2"
APP_URL="http://192.168.1.60:3000"
SRC_TAR="skincapital-src.tar.gz"
DIST_TAR="skincapital-dist.tar.gz"

cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain)" ]]; then
  echo "!! Working tree is dirty — git archive deploys HEAD, not your edits." >&2
  echo "   Commit first (or accept that uncommitted changes will NOT ship)." >&2
  read -r -p "   Continue anyway? [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || exit 1
fi

if [[ "${1:-}" != "--skip-checks" ]]; then
  echo "==> Checks (lint + typecheck + tests)"
  npm run lint
  npm run typecheck
  npm test
fi

echo "==> Local client build"
npm run build

echo "==> Tarballs"
git archive --format=tar.gz -o "/tmp/${SRC_TAR}" HEAD
tar -czf "/tmp/${DIST_TAR}" dist

echo "==> Upload to ${PVE_HOST}"
scp "/tmp/${SRC_TAR}" "/tmp/${DIST_TAR}" "${PVE_HOST}:/tmp/"

echo "==> Deploy into LXC ${CTID}"
# --no-same-owner/--no-same-permissions: tarballs made on Windows carry uids the
# unprivileged LXC cannot chown to (tar exits 2 otherwise).
# PATH: pct exec is no login shell — /usr/local/bin (npm symlink) isn't there.
ssh "${PVE_HOST}" "
  set -euo pipefail
  pct push ${CTID} /tmp/${SRC_TAR} /tmp/${SRC_TAR}
  pct push ${CTID} /tmp/${DIST_TAR} /tmp/${DIST_TAR}
  pct exec ${CTID} -- bash -c '
    set -euo pipefail
    export PATH=/opt/node/bin:/usr/local/bin:\$PATH
    tar -xzf /tmp/${SRC_TAR} -C ${APP_DIR} --no-same-owner --no-same-permissions
    cd ${APP_DIR} && npm install --omit=dev --no-audit --no-fund
    rm -rf ${APP_DIR}/dist
    tar -xzf /tmp/${DIST_TAR} -C ${APP_DIR} --no-same-owner --no-same-permissions
    rm -f /tmp/${SRC_TAR} /tmp/${DIST_TAR}
    systemctl restart cs2
  '
  rm -f /tmp/${SRC_TAR} /tmp/${DIST_TAR}
"

echo "==> Health check ${APP_URL}"
sleep 3
if curl -fsS -o /dev/null "${APP_URL}/api/profiles"; then
  echo "OK — SkinCapital is up at ${APP_URL}"
else
  echo "!! Health check FAILED — inspect with: ssh ${PVE_HOST} 'pct exec ${CTID} -- journalctl -u cs2 -n 50'" >&2
  exit 1
fi
