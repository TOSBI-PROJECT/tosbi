import { test } from "node:test";
import assert from "node:assert/strict";
import { runKeeper, type CallRow, type KeeperDeps, type KeptProtection, type RunRow } from "../src/keeper.ts";

const prot = (over: Partial<KeptProtection> = {}): KeptProtection => ({
  status: 0,
  t_expire: 2_000n,
  perpdex: "C_DEX",
  position_id: new Uint8Array(32),
  qty: 100n,
  ...over,
});

function harness(prots: (KeptProtection | undefined)[], positions: Record<number, { status: number; size: bigint }> = {}) {
  const calls: string[] = [];
  const rows: CallRow[] = [];
  const runs: RunRow[] = [];
  let cursor = 0;
  const d: KeeperDeps = {
    now: () => 1_500,
    nextId: async () => prots.length,
    cursor: { get: async () => cursor, set: async (n) => void (cursor = n) },
    protection: async (id) => prots[id],
    position: async (_dex, pid) => positions[pid[31]] ?? { status: 0, size: 100n },
    call: async (method, id) => {
      calls.push(`${method} ${id}`);
      if (id === 99) throw new Error("boom");
      return { hash: `tx${id}`, status: "SUCCESS", ledger: 42, createdAt: 1_090, result: 150n };
    },
    record: async (row) => void rows.push(row),
    recordRun: async (row) => void runs.push(row),
    log: () => {},
  };
  return { d, calls, rows, runs, cursor: () => cursor };
}

const pid = (n: number) => Object.assign(new Uint8Array(32), { [31]: n });
const rejected = (name: string, message = "HostError: Error(Contract, #0)") => Object.assign(new Error(message), { name });

test("settles expired protections and early-settles closed or reduced positions", async () => {
  const h = harness(
    [prot({ t_expire: 1_000n }), prot({ position_id: pid(1) }), prot({ position_id: pid(2) }), prot()],
    { 1: { status: 1, size: 100n }, 2: { status: 0, size: 99n } },
  );
  await runKeeper(h.d);
  assert.deepEqual(h.calls, ["settle 0", "settle_early 1", "settle_early 2"]);
});

test("cursor skips the settled prefix and stops at the first active id", async () => {
  const h = harness([prot({ status: 1 }), undefined, prot(), prot({ status: 1 })]);
  await runKeeper(h.d);
  assert.equal(h.cursor(), 2);
  assert.deepEqual(h.calls, []);
});

test("one failed call does not stop the rest", async () => {
  const prots = Array.from({ length: 101 }, () => prot({ status: 1 }));
  prots[99] = prot({ t_expire: 1_000n });
  prots[100] = prot({ t_expire: 1_000n });
  const h = harness(prots);
  await runKeeper(h.d);
  assert.deepEqual(h.calls, ["settle 99", "settle 100"]);
});

test("a failed position read is logged and the next protection is still handled", async () => {
  const h = harness([prot(), prot({ t_expire: 1_000n })]);
  const logs: string[] = [];
  h.d.position = async () => {
    throw new Error("rpc down");
  };
  h.d.log = (m) => logs.push(m);
  await runKeeper(h.d);
  assert.deepEqual(h.calls, ["settle 1"]);
  assert.ok(logs.some((m) => m.includes("#0 failed: rpc down")));
});

test("S-H3: a settlement is recorded with its hash, ledger time, latency and payout", async () => {
  const h = harness([prot({ t_expire: 1_000n })]);
  await runKeeper(h.d);
  assert.deepEqual(h.rows, [
    {
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
    },
  ]);
});

test("S-H3: the run summary counts settled, failed and skipped protections", async () => {
  const h = harness([prot({ t_expire: 1_000n }), prot({ t_expire: 1_000n }), prot({ t_expire: 1_000n })]);
  h.d.call = async (method, id) => {
    if (id === 1) throw rejected("OracleStale");
    if (id === 2) throw rejected("AlreadySettled");
    return { hash: `tx${id}`, status: "SUCCESS", ledger: 42, createdAt: 1_090, result: 150n };
  };
  await runKeeper(h.d);
  assert.deepEqual(h.runs, [{ started_at: 1_500, finished_at: 1_500, cursor: 0, next_id: 3, settled: 1, failed: 1, skipped: 1 }]);
});

test("S-M1: a run with no protections still records one run with zero counts", async () => {
  const h = harness([]);
  await runKeeper(h.d);
  assert.deepEqual(h.rows, []);
  assert.deepEqual(h.runs, [{ started_at: 1_500, finished_at: 1_500, cursor: 0, next_id: 0, settled: 0, failed: 0, skipped: 0 }]);
});

test("S-E5: an early settlement is recorded without latency", async () => {
  const h = harness([prot({ position_id: pid(1) })], { 1: { status: 1, size: 100n } });
  await runKeeper(h.d);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].method, "settle_early");
  assert.equal(h.rows[0].outcome, "settled");
  assert.equal(h.rows[0].ledger_closed_at, 1_090);
  assert.equal(h.rows[0].latency_s, null);
});

test("S-E6: a receipt without a ledger close time records null latency, not NaN", async () => {
  const h = harness([prot({ t_expire: 1_000n })]);
  h.d.call = async () => ({ hash: "tx0", status: "SUCCESS", ledger: 42, result: 150n });
  await runKeeper(h.d);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].ledger_closed_at, null);
  assert.equal(h.rows[0].latency_s, null);
});

test("S-R7: OracleStale is recorded as failed with its error name and retried next run", async () => {
  const h = harness([prot({ t_expire: 1_000n })]);
  h.d.call = async () => {
    throw rejected("OracleStale", "HostError: Error(Contract, #26)");
  };
  await runKeeper(h.d);
  assert.deepEqual(h.rows, [
    {
      run_started_at: 1_500,
      protection_id: 0,
      method: "settle",
      outcome: "failed",
      tx_hash: null,
      error: "OracleStale",
      t_expire: 1_000,
      ledger: null,
      ledger_closed_at: null,
      latency_s: null,
      payout: null,
    },
  ]);
  assert.equal(h.cursor(), 0);
});

test("S-C1: AlreadySettled (another run or caller settled first) is a skip, not a failure", async () => {
  const h = harness([prot({ t_expire: 1_000n })]);
  h.d.call = async () => {
    throw rejected("AlreadySettled", "HostError: Error(Contract, #10)");
  };
  await runKeeper(h.d);
  assert.equal(h.rows.length, 1);
  assert.equal(h.runs.length, 1);
  assert.equal(h.rows[0].outcome, "skipped");
  assert.equal(h.runs[0].skipped, 1);
  assert.equal(h.runs[0].failed, 0);
});

test("S-R11: a transaction that lands with status FAILED is recorded as failed with its hash", async () => {
  const h = harness([prot({ t_expire: 1_000n })]);
  h.d.call = async () => ({ hash: "txf", status: "FAILED", ledger: 43, createdAt: 1_100 });
  await runKeeper(h.d);
  assert.equal(h.rows.length, 1);
  assert.equal(h.runs.length, 1);
  assert.equal(h.rows[0].outcome, "failed");
  assert.equal(h.rows[0].tx_hash, "txf");
  assert.equal(h.rows[0].error, "FAILED");
  assert.equal(h.rows[0].latency_s, null);
  assert.equal(h.runs[0].failed, 1);
});

test("S-R8: a failed log write does not stop the keeper or the run record", async () => {
  const h = harness([prot({ t_expire: 1_000n }), prot({ t_expire: 1_000n })]);
  const logs: string[] = [];
  h.d.log = (m) => logs.push(m);
  h.d.record = async () => {
    throw new Error("d1 down");
  };
  await runKeeper(h.d);
  assert.deepEqual(h.calls, ["settle 0", "settle 1"]);
  assert.equal(h.runs.length, 1);
  assert.equal(h.runs[0].settled, 2);
  assert.ok(logs.some((m) => m.includes("d1 down")), logs.join("\n"));
});

test("S-R9: a failed position read counts as a failed protection", async () => {
  const h = harness([prot()]);
  h.d.position = async () => {
    throw new Error("rpc down");
  };
  await runKeeper(h.d);
  assert.deepEqual(h.rows, []);
  assert.equal(h.runs.length, 1);
  assert.equal(h.runs[0].failed, 1);
});

test("S-X5: recorded error text is cut to 400 characters", async () => {
  const h = harness([prot({ t_expire: 1_000n })]);
  h.d.call = async () => {
    throw new Error("x".repeat(1_000));
  };
  await runKeeper(h.d);
  assert.equal(h.rows.length, 1);
  assert.equal(h.rows[0].error?.length, 400);
});
