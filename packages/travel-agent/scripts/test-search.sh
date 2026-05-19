#!/bin/bash
# Manual end-to-end test for the Stagehand+Playwright web_search tool.
#
# Usage:
#   ./scripts/test-search.sh "your search query"
#   STAGEHAND_HEADLESS=0 STAGEHAND_VERBOSE=2 ./scripts/test-search.sh "tokyo ramen"
#
# Requires OLLAMA_API_KEY (https://ollama.com/settings/keys) for the default
# ollama/minimax-m2.7:cloud model. See scripts/test-search.ts for all env vars.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec npx tsx "$SCRIPT_DIR/test-search.ts" "$@"
