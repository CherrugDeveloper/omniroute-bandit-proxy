#!/usr/bin/env bash
# generate-slash-command skill script
# Generates a slash command Markdown file and optional wrapper script

set -euo pipefail

# Default values
GENERATE_WRAPPER=true
TARGET_SCRIPT=""
ENV_VARS=""
EXIT_CODES=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --name)
            NAME="$2"
            shift 2
            ;;
        --description)
            DESCRIPTION="$2"
            shift 2
            ;;
        --arguments)
            ARGUMENTS="$2"
            shift 2
            ;;
        --usage-examples)
            USAGE_EXAMPLES="$2"
            shift 2
            ;;
        --features)
            FEATURES="$2"
            shift 2
            ;;
        --env-vars)
            ENV_VARS="$2"
            shift 2
            ;;
        --exit-codes)
            EXIT_CODES="$2"
            shift 2
            ;;
        --generate-wrapper)
            GENERATE_WRAPPER="$2"
            shift 2
            ;;
        --target-script)
            TARGET_SCRIPT="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "${NAME:-}" ]]; then
    echo "Error: --name is required"
    exit 1
fi
if [[ -z "${DESCRIPTION:-}" ]]; then
    echo "Error: --description is required"
    exit 1
fi
if [[ -z "${ARGUMENTS:-}" ]]; then
    echo "Error: --arguments is required"
    exit 1
fi
if [[ -z "${USAGE_EXAMPLES:-}" ]]; then
    echo "Error: --usage-examples is required"
    exit 1
fi
if [[ -z "${FEATURES:-}" ]]; then
    echo "Error: --features is required"
    exit 1
fi
if [[ "${GENERATE_WRAPPER}" == "true" && -z "${TARGET_SCRIPT:-}" ]]; then
    echo "Error: --target-script is required when --generate-wrapper is true"
    exit 1
fi

# Set up paths
COMMAND_MD_PATH=".roo/commands/${NAME}.md"
WRAPPER_SH_PATH=".roo/commands/${NAME}.sh"

# Read templates
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMMAND_TEMPLATE="${SKILL_DIR}/assets/command-template.md"
WRAPPER_TEMPLATE="${SKILL_DIR}/assets/wrapper-template.sh"

# Generate Markdown file
if [[ -f "${COMMAND_TEMPLATE}" ]]; then
    # Prepare replacements
    TITLE="${NAME//-/ }"  # Convert hyphens to spaces for title
    TITLE="${TITLE^}"     # Capitalize first letter
    LONG_DESCRIPTION="${DESCRIPTION}"
    OPTIONS_LIST="${ARGUMENTS}"
    FEATURES_LIST="${FEATURES}"

    if [[ -n "${ENV_VARS:-}" ]]; then
        ENV_VARS_LIST="${ENV_VARS}"
    else
        ENV_VARS_LIST="None"
    fi

    if [[ -n "${EXIT_CODES:-}" ]]; then
        EXIT_CODES_LIST="${EXIT_CODES}"
    else
        EXIT_CODES_LIST="None"
    fi

    # Use sed with @ as delimiter to avoid conflicts with / in content
    sed \
        -e "s@{{description}}@${DESCRIPTION}@g" \
        -e "s@{{arguments}}@${ARGUMENTS}@g" \
        -e "s@{{title}}@${TITLE}@g" \
        -e "s@{{long_description}}@${LONG_DESCRIPTION}@g" \
        -e "s@{{name}}@${NAME}@g" \
        -e "s@{{options_list}}@${OPTIONS_LIST}@g" \
        -e "s@{{usage_examples}}@${USAGE_EXAMPLES}@g" \
        -e "s@{{features_list}}@${FEATURES_LIST}@g" \
        -e "s@{{env_vars_list}}@${ENV_VARS_LIST}@g" \
        -e "s@{{exit_codes_list}}@${EXIT_CODES_LIST}@g" \
        "${COMMAND_TEMPLATE}" > "${COMMAND_MD_PATH}"

    echo "Generated slash command Markdown at ${COMMAND_MD_PATH}"
else
    echo "Error: Command template not found at ${COMMAND_TEMPLATE}"
    exit 1
fi

# Generate wrapper script if requested
if [[ "${GENERATE_WRAPPER}" == "true" ]]; then
    if [[ -f "${WRAPPER_TEMPLATE}" ]]; then
        # Use sed with @ as delimiter
        sed \
            -e "s@{{name}}@${NAME}@g" \
            -e "s@{{target_script}}@${TARGET_SCRIPT}@g" \
            "${WRAPPER_TEMPLATE}" > "${WRAPPER_SH_PATH}"

        chmod +x "${WRAPPER_SH_PATH}"
        echo "Generated wrapper script at ${WRAPPER_SH_PATH}"
    else
        echo "Error: Wrapper template not found at ${WRAPPER_TEMPLATE}"
        exit 1
    fi
fi
