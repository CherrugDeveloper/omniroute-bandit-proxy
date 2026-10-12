#!/usr/bin/env bash
# {{name}} wrapper - resolves workspace root and invokes target script
# Forwards all arguments, environment variables, and exit codes

set -euo pipefail

# Resolve workspace root relative to this wrapper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Path to the target script
TARGET_SCRIPT="${WORKSPACE_ROOT}/{{target_script}}"

# Verify target script exists
if [[ ! -f "${TARGET_SCRIPT}" ]]; then
    echo "Error: Target script not found at ${TARGET_SCRIPT}" >&2
    exit 1
fi

# Execute target script with all arguments, forwarding environment
# Use exec to replace current process and propagate exit code
exec "${TARGET_SCRIPT}" "$@"
