# Performance Baseline

This file tracks baseline and post-optimization measurements for the CLI app.

## Captured Metrics

- Startup total time from `agent.start.begin` -> `agent.start.total_ms`
- Turn total time from `agent.turn.begin` -> `agent.turn.total_ms`
- Streaming delta counters:
  - `stream.text_delta`
  - `stream.reasoning_delta`

## How to Collect

1. Start the app and observe perf logs:
   - `Perf startup: <ms>ms`
2. Run a long prompt and observe:
   - `Perf turn: <ms>ms textDeltas=<n> thinkingDeltas=<n>`
3. Repeat before/after major optimization batches.

## Notes

- Metrics are lightweight and intended for trend tracking, not microbenchmark precision.
- Keep test prompts and repository state consistent between runs.
