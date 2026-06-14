# Changelog

All notable changes to `@mariozechner/pi-travel-agent` will be documented in this file.

## [Unreleased]

### Added
- Preference-fit scoring module (`src/core/preference-fit.ts`) that scores Stage 2 destination cards against the actual run preferences across eight axes (beaches, culture, food, easy logistics, family/kids, budget, season/dates, trip length). Derives relevant axes from preferences, computes per-card fit, requires each tradeoff to map to at least one relevant axis, and checks menu-level theme coverage. Exported from the package public API.
- Tradeoff severity classification (`classifyTradeoffSeverity`, `TradeoffSeverity`, `SEVERITY_LABEL`) that labels each card's tradeoff as low/medium/high from keyword cues (strong negatives → high; softeners → low; mitigated negatives and neutral → medium). Surfaced per-card and aggregated in the preference-fit report. Exported from the package public API.
- `test/preference-fit.test.ts` with deterministic unit coverage for axis derivation, per-card scoring, tradeoff mapping, severity classification, menu coverage, and the report formatter.
- Fresh live eval (`scripts/fresh-live-eval.ts`) now runs the preference-fit layer and reports per-card fit ratios, theme coverage, uncovered axes, per-card and aggregate tradeoff severity, and non-contextual tradeoffs as `preference-fit:` failures that count toward run pass/fail.
- Dedicated `save_destination_shortlist` tool with a narrow schema for saving destination shortlists / choice cards directly to `destinationResearch`, so the model no longer needs the generic `update_travel_state` with `field="destination_research"`.
- Stage 2 (shortlist) prompt and web-search budget-cap messaging now instruct the model to call `save_destination_shortlist` instead of `update_travel_state` for destination research.
- Stage 2 (shortlist) prompt and `save_destination_shortlist` schema now explicitly require every option card's `tradeoff` to be contextual to a stated user preference axis (logistics, kids/family, budget, season/dates, beaches, culture, food, trip length), with good/bad examples, so the model no longer emits generic tradeoffs that fail the preference-fit eval.
- Stagehand search provider that drives a local Playwright Chromium instance for agentic web search. Configuration is fully externalized via `STAGEHAND_*` environment variables (model, API key, base URL, headless, search engine, result enrichment, timeout, verbosity). The Stagehand LLM is independent from the travel-agent's LLM, with the travel-agent's API key used as a last-resort fallback for non-Ollama models.
- Default Stagehand LLM is `ollama/minimax-m2.7:cloud` on Ollama Cloud (https://ollama.com/api). Set `OLLAMA_API_KEY` (create one at https://ollama.com/settings/keys) to use it.

### Changed
- Destination research normalization/validation logic extracted into a shared `destination-research` module used by both `save_destination_shortlist` and `update_travel_state`.
- The preference-fit report (`formatShortlistPreferenceFit`) now includes an aggregate tradeoff-severity line and a per-card severity tag on each tradeoff.
- Stagehand is now the default web search provider. Opt out with `USE_STAGEHAND=0` to fall back to the previous priority chain (Brave > Linkup > Google Gemini > Obscura).
