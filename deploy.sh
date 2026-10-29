#!/usr/bin/env bash
# Deploys one commit's images on the server (docs/deployment.md, "Deploy a version"):
#
#   /srv/jsc/deploy.sh <commit sha>
#
# CI's deploy key is pinned to this script in authorized_keys
# (`command="/srv/jsc/deploy.sh",restrict`): the sha arrives as the ssh command.
#
# All of it inside `main`: `git pull` may rewrite this file while it runs, and bash
# reads a script as it goes.
set -euo pipefail

main() {
  local sha=${1:-${SSH_ORIGINAL_COMMAND:-}}
  # The one input from outside: a full commit sha, and nothing else, reaches a command.
  if [[ ! $sha =~ ^[0-9a-f]{40}$ ]]; then
    echo "usage: deploy.sh <40-hex commit sha>" >&2
    exit 2
  fi
  local tag=sha-$sha

  cd "$(dirname "$0")"
  git pull --ff-only
  # Fails here, before anything stops, if CI never published this tag.
  JSC_TAG=$tag docker compose pull
  # Prisma migrations are not transactional: a backup first, every time — the script
  # cannot tell whether this version carries one. Blocks until done (a oneshot unit).
  sudo systemctl start backup.service
  sed -i "s/^JSC_TAG=.*/JSC_TAG=$tag/" .env
  # --wait fails the deploy if jsc-migrate fails or a service never turns healthy.
  docker compose up -d --wait --wait-timeout 300
  echo "deployed $tag"
}

main "$@"
exit
