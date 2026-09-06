#!/usr/bin/env node
// entire-agent-adapter — reads an agent JSONL transcript, emits an
// Entire-checkpoint-shaped summary { intent, outcome, friction[], open_items[],
// complete }. Supports two formats via adapters and NEVER crashes on unknown
// events or incomplete input — those cases produce a partial result flagged
// with complete=false.
//
// Buildathon 2026 — Track 3 (Bring Entire to a New Agent or Workflow).
// Curveball: the agent released a new format; the integration must support
// both, tolerate unknown events, and produce partial results from incomplete
// transcripts without duplicating the implementation.

import { readFile } from "node:fs/promises";
import { argv, exit, stderr, stdout } from "node:process";
import { detectFormat, ADAPTERS } from "./adapters.mjs";

async function main() {
  const file = argv[2];
  if (!file) {
    stderr.write("usage: node src/index.mjs <transcript.jsonl>\n");
    exit(2);
  }
  const text = await readFile(file, "utf8");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  const events = [];
  let unknownCount = 0;
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // Malformed line — skip, do not crash. Curveball rule: "an incomplete
      // transcript must produce a partial result, not a corrupted or discarded session."
      unknownCount++;
    }
  }

  const format = detectFormat(events);
  const adapter = ADAPTERS[format];
  const result = adapter.summarize(events);

  // Any events the adapter didn't recognize add to the unknown count but do
  // not fail the run.
  result.warnings = [
    ...(result.warnings || []),
    ...(unknownCount > 0 ? [`skipped ${unknownCount} malformed line(s)`] : []),
  ];
  result.format = format;
  result.source_events = events.length;

  stdout.write(JSON.stringify(result, null, 2) + "\n");
  // Exit 0 for complete, 3 for partial. Distinct so CI can gate on it without
  // conflating partial with crash.
  exit(result.complete ? 0 : 3);
}

main().catch((e) => { stderr.write(`fatal: ${e.message}\n`); exit(1); });
