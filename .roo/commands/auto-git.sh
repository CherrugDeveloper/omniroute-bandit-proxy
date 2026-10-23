#!/usr/bin/env bash
set -euo pipefail
echo "DEBUG: auto-git called at $(date)" >> /tmp/auto-git.log
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
echo "DEBUG: running node ${WORKSPACE_ROOT}/scripts/auto-git.mjs" >> /tmp/auto-git.log
exec /usr/bin/node "${WORKSPACE_ROOT}/scripts/auto-git.mjs" "$@"
