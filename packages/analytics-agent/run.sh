#!/bin/bash
# Run the analytics agent from source (no build needed).
# Usage: ./run.sh [options]
#
# Examples:
#   ./run.sh
#   ./run.sh --provider anthropic
#   ./run.sh --python .venv/bin/python3

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec npx tsx "$SCRIPT_DIR/src/cli.ts" "$@"
