# Changelog

All notable changes to `@mariozechner/pi-travel-agent` will be documented in this file.

## [Unreleased]

### Added
- Stagehand search provider that drives a local Playwright Chromium instance for agentic web search. Configuration is fully externalized via `STAGEHAND_*` environment variables (model, API key, base URL, headless, search engine, result enrichment, timeout, verbosity). The Stagehand LLM is independent from the travel-agent's LLM, with the travel-agent's API key used as a last-resort fallback for non-Ollama models.
- Default Stagehand LLM is `ollama/minimax-m2.7:cloud` on Ollama Cloud (https://ollama.com/api). Set `OLLAMA_API_KEY` (create one at https://ollama.com/settings/keys) to use it.

### Changed
- Stagehand is now the default web search provider. Opt out with `USE_STAGEHAND=0` to fall back to the previous priority chain (Brave > Linkup > Google Gemini > Obscura).
