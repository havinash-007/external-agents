# entire-agent-adapter

**Track 3 (Bring Entire to a New Agent or Workflow) — Buildathon 2026.**

A tiny Node.js integration that turns a coding-agent JSONL transcript into an
Entire-checkpoint-shaped summary — `{ intent, outcome, friction[], open_items[], complete }` —
so any external agent's session log can be fed to the same downstream tools that
consume real Entire checkpoints (`ship-check`, PR reviewers, release-readiness bots).

## Why Entire is essential

The checkpoint schema (from `api/checkpoint/metadata.go` in the CLI repo) is the
lingua franca. This adapter is the *bridge*: it lets an agent that doesn't
natively speak checkpoint emit one, so the whole Entire ecosystem — graph
impact analysis, checkpoint search, ship-readiness gates — works against it.

## The Curveball response

The Curveball introduced a new transcript format (v2). The pre-Curveball
implementation had a single, hard-coded parser for v1. The **assumption that
was invalidated:** "there is one transcript shape." The **design change:** a
tiny adapter layer (`src/adapters.mjs`) that:

1. Detects format from the first well-formed event (`type` → v1, `event_type` + `payload` → v2).
2. Routes to an adapter that normalizes events into a shared vocabulary
   (`start`, `prompt`, `assistant_final`, `tool_error`, `open`, `stop`, `unknown`).
3. A shared `bucket()` core turns normalized events into the final summary —
   so the summarizer is written **once**, not per format.

**Why safe:** unknown event types become `unknown` in normalization and add a
warning; they never crash the run. An incomplete transcript (no `session_stop`
/ `lifecycle.stop`) still returns a partial summary with `complete: false` and
a warning naming what was missing. Exit code is `0` for complete, `3` for
partial, `1` for fatal — so CI can distinguish the three without conflation.

## Run it

```
node src/index.mjs fixtures/v1.complete.jsonl
node src/index.mjs fixtures/v2.complete.jsonl
node src/index.mjs fixtures/v2.unknown_events.jsonl
node src/index.mjs fixtures/v1.incomplete.jsonl
```

## Test

```
node test/run.mjs
```

All four Curveball-required cases are covered:
| # | Case | Fixture | Expected |
|---|---|---|---|
| 1 | Original format, complete | `v1.complete.jsonl` | `complete: true, format: v1` |
| 2 | New format, complete | `v2.complete.jsonl` | `complete: true, format: v2` |
| 3 | Unknown events, complete | `v2.unknown_events.jsonl` | `complete: true`, warnings list unknown kinds |
| 4 | Incomplete input | `v1.incomplete.jsonl` | `complete: false`, partial summary, warning names missing stop |

## Design notes for judges

- **Zero dependencies.** Pure Node ≥ 18 — no npm install, no supply-chain surface.
- **No duplication.** Both adapters share `bucket()`; format-specific code is
  ~20 lines each. Adding a v3 later is one more adapter, no core changes.
- **Never crashes on hostile input.** Malformed JSON lines are counted and
  skipped (see `index.mjs`). Missing fields degrade to empty strings, not
  exceptions.
- **The result is honest about its confidence.** `complete: false` is
  surfaced everywhere and reflected in the exit code — a downstream consumer
  (like `ship-check`) that ingests this output can refuse to declare "ready"
  from a partial summary, satisfying Track 1's Privacy-Boundary spirit too.
