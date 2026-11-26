import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { insertCall, insertRun, listCalls, listRuns, parseLimit } from "../src/keeper-log.ts";
import type { CallRow, RunRow } from "../src/keeper.ts";
import { BadRequest } from "../src/service.ts";

// The migration wrangler applies to D1, run on SQLite behind D1's prepare/bind/run/all surface.
function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_keeper_log.sql", import.meta.url), "utf8"));
  return {
    prepare(sql: string) {
      let params: (string | number | bigint | null)[] = [];
      const stmt = {
        bind(...p: (string | number | bigint | null)[]) {
          params = p;
          return stmt;
        },
        async run() {
          db.prepare(sql).run(...params);
          return { success: true };
        },
        async all() {
          return { results: db.prepare(sql).all(...params) };
        },
      };
      return stmt;
    },
  };
}

const call = (over: Partial<CallRow> = {}): CallRow => ({
  run_started_at: 1_500,
  protection_id: 0,
  method: "settle",
  outcome: "settled",
  tx_hash: "tx0",
  error: null,
  t_expire: 1_000,
  ledger: 42,
  ledger_closed_at: 1_090,
  latency_s: 90,
  payout: 150n,
  ...over,
});
const run: RunRow = { started_at: 1_500, finished_at: 1_503, cursor: 4, next_id: 9, settled: 2, failed: 1, skipped: 0 };

test("S-M2: with no rows yet the runs and calls lists are empty", async () => {
  const db = d1();
  assert.deepEqual(await listCalls(db, 100), []);
  assert.deepEqual(await listRuns(db, 100), []);
});

test("S-H3: a recorded settlement and run read back unchanged", async () => {
  const db = d1();
  await insertCall(db, call());
  await insertCall(db, call({ protection_id: 1, outcome: "failed", tx_hash: null, error: "OracleStale", ledger: null, ledger_closed_at: null, latency_s: null, payout: null }));
  await insertRun(db, run);
  assert.deepEqual(await listCalls(db, 100), [
    call({ protection_id: 1, outcome: "failed", tx_hash: null, error: "OracleStale", ledger: null, ledger_closed_at: null, latency_s: null, payout: null }),
    call(),
  ]);
  assert.deepEqual(await listRuns(db, 100), [run]);
});

test("S-E7: a payout above 2^53 reads back exactly", async () => {
  const db = d1();
  await insertCall(db, call({ payout: 12_345_678_901_234_567_890n }));
  assert.equal((await listCalls(db, 1))[0].payout, 12_345_678_901_234_567_890n);
});

test("S-E10: calls come back newest first, up to the limit", async () => {
  const db = d1();
  for (const id of [0, 1, 2]) await insertCall(db, call({ protection_id: id }));
  assert.deepEqual((await listCalls(db, 2)).map((r) => r.protection_id), [2, 1]);
});

test("S-E10: the limit defaults to 100 and accepts 1 to 500", () => {
  assert.equal(parseLimit(null), 100);
  assert.equal(parseLimit("1"), 1);
  assert.equal(parseLimit("500"), 500);
});

test("S-R10: a limit out of range or not an integer is rejected", () => {
  for (const bad of ["0", "501", "-1", "1.5", "abc", "", " 5", "1e2"]) {
    assert.throws(() => parseLimit(bad), BadRequest, `limit ${JSON.stringify(bad)}`);
  }
});

test("S-X3: a limit carrying SQL is rejected before any query runs", () => {
  assert.throws(() => parseLimit("1; DROP TABLE keeper_calls"), BadRequest);
  assert.throws(() => parseLimit("1 OR 1=1"), BadRequest);
});
