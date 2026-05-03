#!/bin/bash
# Run the travel agent from source (no build needed).
# Usage: ./run.sh [options]
#
# Examples:
#   ./run.sh
#   ./run.sh --provider anthropic
#   ./run.sh --session-id my-trip-2026

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec npx tsx "$SCRIPT_DIR/src/cli.ts" "$@"
