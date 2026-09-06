# entire-agent-adapter

## One-sentence summary
A Node.js integration that converts a coding-agent JSONL transcript into an Entire-checkpoint-shaped summary, so any external agent can plug into the Entire ecosystem.

## Problem, intended user and why it matters
Every coding agent (Claude Code, Codex, Cursor, Gemini CLI, Copilot, …) emits transcripts in its own shape. The Entire checkpoint schema is stable and drives the rest of the platform (graph search, ship-readiness, PR review). Today, wiring a *new* agent to Entire means writing a bespoke parser for that agent's log format. **entire-agent-adapter** is the reusable, format-tolerant seam. Intended users: agent authors adding Entire support, and platform engineers whose CI produces JSONL agent logs they want checkpointed.

## Selected Entire track and why Entire is essential
**Track 3 — Bring Entire to a New Agent or Workflow.**
Without Entire's checkpoint schema, this tool has nothing to normalize *to*. The value is precisely that the summary shape is Entire's — so once an agent's transcript is fed through this adapter, every downstream Entire tool works against it unchanged (graph impact analysis, ship-check-style readiness gates, checkpoint search).

## Architecture and main workflow
```
  transcript.jsonl
        │
        ▼
  parseLines()    ── skip malformed, count as warning
        │
        ▼
  detectFormat()  ── v1 (flat {type,...}) vs v2 ({event_type, payload})
        │
        ▼
  adapters[fmt].summarize()
        │             │
        ▼             ▼
  normalize events → shared bucket()  ── one summarizer, all formats
        │
        ▼
  { intent, outcome, friction[], open_items[], complete, warnings, format }
```
Format-specific code is ~20 lines per adapter; the summarizer is written **once**.

## Entire Graph findings and verification
Ran `entire graph init-agents --repo .` and inspected which functions in `src/index.mjs` and `src/adapters.mjs` depend on the transcript event schema. The impact set for the Curveball change:
- `detectFormat` (new, added)
- `ADAPTERS` map (new, added)
- v1 adapter path (moved out of `index.mjs` into `adapters.mjs`)
- `bucket()` — the shared summarizer (unchanged internals; contract preserved)

Verification: the pre-Curveball tests (fixtures 1 & 4 — the two v1 cases) continue to pass, confirming the extraction didn't regress v1 behavior. v2 fixtures (2 & 3) exercise the new adapter and the unknown-event tolerance.

## Noon Curveball: what changed and how we adapted
**Assumption invalidated:** "There is one transcript format." The agent shipped a new v2 format with a nested `{event_type, payload}` shape, and existing users still emit v1.

**Design change:** Introduced an adapter layer with format detection. A **shared normalization vocabulary** — `start`, `prompt`, `assistant_final`, `tool_error`, `open`, `stop`, `unknown` — sits between raw events and the summarizer, so the summarizer is written **once** and handles all formats.

**Why safe:**
1. Unknown event types → `unknown` kind + warning. Never a crash.
2. Malformed JSON lines → skipped + warning. Never a crash.
3. Missing `start` or `stop` → `complete: false` + warning naming what's missing. Never a false claim of completeness.
4. Exit codes distinguish outcomes: `0` = complete, `3` = partial, `1` = fatal. CI can gate without conflating partial with crash.
5. v1 tests still pass — proving existing behavior preserved.

## Checkpoint links and what each checkpoint proves
- **Checkpoint #1–4 (Final)** — [b69e308](https://github.com/havinash-007/external-agents/commit/b69e3087a216f2d22bfc1831233173e41a1b7459) — `01M1TRMJ95NZJYGCKDZFT6X6QR` — Final submission verification: all 4 tests pass, graph context wired, Track 3 verification checkpoint recorded by Entire hooks.

## Setup, run and test instructions
Node ≥ 18 required. Zero dependencies.

```
cd agents/entire-agent-adapter
node src/index.mjs fixtures/v1.complete.jsonl
node src/index.mjs fixtures/v2.complete.jsonl
node src/index.mjs fixtures/v2.unknown_events.jsonl
node src/index.mjs fixtures/v1.incomplete.jsonl
node test/run.mjs
```

Expected: all 4 tests pass. Exit code of the CLI reflects completeness (0 = complete, 3 = partial).

## Known limitations and next steps
- Adapter-only — not yet packaged as a real GitHub Action end-to-end. `action.yml` is present so the wiring is one step away.
- Two formats covered; a v3 later is one file, no core changes.
- Summarization is rule-based, not LLM-based. Deterministic and fast, but doesn't paraphrase.
- Next step: publish as `entire-agent-adapter` on the Entire marketplace and hook to `entire session` so an agent that runs through this adapter produces real checkpoints automatically.

## Submission verified — 2026-09-06

- All 4 tests pass: `node agents/entire-agent-adapter/test/run.mjs`
- Curveball response initial commit: 2c75290
- Graph context enabled via `entire graph init-agents`
- Final checkpoint recorded via Entire hooks in this Claude Code session
