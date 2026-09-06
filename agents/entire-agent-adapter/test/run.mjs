#!/usr/bin/env node
// Minimal no-dependency test harness. Runs the CLI on each fixture and asserts
// on the JSON output. Covers the four Curveball-required cases:
//   1. v1 complete            → complete=true, format="v1"
//   2. v2 complete            → complete=true, format="v2"
//   3. v2 with unknown events → complete=true (they're skipped, not fatal)
//   4. v1 incomplete          → complete=false, partial result still emitted

import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, "..", "src", "index.mjs");
const FIX = resolve(here, "..", "fixtures");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅  ${name}`); pass++; }
  catch (e) { console.log(`  ❌  ${name}\n       ${e.message}`); fail++; }
}
function run(fixture) {
  // execFileSync throws on non-zero exit; capture both success and exit=3 partial.
  let out;
  try {
    out = execFileSync("node", [CLI, resolve(FIX, fixture)], { encoding: "utf8" });
  } catch (e) {
    // Exit 3 = partial; stdout is on e.stdout.
    if (e.status === 3) return JSON.parse(e.stdout);
    throw new Error(`CLI crashed on ${fixture}: exit=${e.status} stderr=${e.stderr}`);
  }
  return JSON.parse(out);
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

console.log("\nrunning entire-agent-adapter tests:\n");

test("v1 complete transcript → complete result", () => {
  const r = run("v1.complete.jsonl");
  assert(r.format === "v1", `format expected v1, got ${r.format}`);
  assert(r.complete === true, "expected complete=true");
  assert(r.intent.includes("rate limiting"), "intent missing");
  assert(r.friction.length === 1, `friction expected 1, got ${r.friction.length}`);
  assert(r.open_items.length === 2, `open_items expected 2, got ${r.open_items.length}`);
});

test("v2 complete transcript → complete result, new format detected", () => {
  const r = run("v2.complete.jsonl");
  assert(r.format === "v2", `format expected v2, got ${r.format}`);
  assert(r.complete === true, "expected complete=true");
  assert(r.intent.includes("rate limiting"), "intent missing");
  assert(r.outcome.includes("token bucket"), "outcome missing");
  assert(r.open_items.length === 2, `open_items expected 2, got ${r.open_items.length}`);
});

test("v2 with unknown event types → skipped, session still completes", () => {
  const r = run("v2.unknown_events.jsonl");
  assert(r.format === "v2", `format expected v2, got ${r.format}`);
  assert(r.complete === true, "expected complete=true even with unknowns");
  const unknownWarns = r.warnings.filter((w) => w.includes("unknown event kind"));
  assert(unknownWarns.length >= 2, `expected at least 2 unknown-kind warnings, got ${unknownWarns.length}`);
});

test("v1 incomplete transcript → partial result, not corrupted, not discarded", () => {
  const r = run("v1.incomplete.jsonl");
  assert(r.format === "v1", `format expected v1, got ${r.format}`);
  assert(r.complete === false, "expected complete=false");
  assert(r.intent.includes("Migrate database"), "intent should still be extracted from partial input");
  assert(r.friction.length === 1, "friction from before-crash should still be captured");
  const partialWarn = r.warnings.some((w) => w.includes("partial"));
  assert(partialWarn, "expected a 'partial' warning");
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
