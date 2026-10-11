#!/usr/bin/env bash
# git-auto-commit wrapper - resolves workspace root and invokes skill script
# Forwards all arguments, environment variables, and exit codes

set -euo pipefail

# Resolve workspace root relative to this wrapper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Path to the skill script
SKILL_SCRIPT="${WORKSPACE_ROOT}/.roo/skills/git-auto-commit/scripts/git-auto-commit.sh"

# Verify skill script exists
if [[ ! -f "${SKILL_SCRIPT}" ]]; then
    echo "Error: Skill script not found at ${SKILL_SCRIPT}" >&2
    exit 1
fi

# Execute skill script with all arguments, forwarding environment
# Use exec to replace current process and propagate exit code
exec "${SKILL_SCRIPT}" "$@"
