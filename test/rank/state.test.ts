import assert from "node:assert/strict";
import test from "node:test";
import { mergeRankState, type RankState } from "../../src/rank.js";

test("rank state merge is additive and preserves scrape fields", () => {
  const state: RankState = { "job-1": { id: "job-1", status: "seen", url: "https://example.com/1", source: "test", custom: "keep" } };
  const next = mergeRankState(state, [{ id: "job-1", score: 88, verdict: "Strong Fit", rankDate: "2026-07-30", status: "ranked" }]);
  assert.deepEqual(next["job-1"], { id: "job-1", status: "ranked", url: "https://example.com/1", source: "test", custom: "keep", score: 88, verdict: "Strong Fit", rankDate: "2026-07-30" });
});

test("rank state merge does not discard entries that were not rescored", () => {
  const state: RankState = { one: { id: "one", status: "seen" }, two: { id: "two", status: "applied" } };
  const next = mergeRankState(state, [{ id: "one", score: 50, verdict: "Moderate Fit", rankDate: "2026-07-30", status: "ranked" }]);
  assert.equal(next.two.status, "applied");
});
