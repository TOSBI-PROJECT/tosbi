import { test } from "node:test";
import assert from "node:assert/strict";
import { depthKey, readDepth, readShock, readVolTables, shockKey, writeDepth, writeShock } from "../src/risk.ts";

function kv() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
  };
}

const bundle = {
  XLM: { buckets: { "3600": { down: 0.7, up: 0.7 } } },
  BTC: { buckets: { "3600": { down: 0.5, up: 0.5 } } },
};
const fresh = {
  XLM: { buckets: { "3600": { down: 0.9, up: 0.8 } } },
  BTC: { buckets: { "3600": { down: 0.6, up: 0.6 } } },
};

test("S-H2: depth written by the daily cron is the depth a quote reads", async () => {
  const store = kv();
  await writeDepth(store, "XLM", 1_234.5);
  assert.equal(await readDepth(store, "XLM"), 1_234.5);
  assert.equal(await readDepth(store, "BTC"), null);
});

test("S-H1: shock written by the minute cron is the shock a quote reads", async () => {
  const store = kv();
  await writeShock(store, "ETH", { factor: 2, until: 1_900 });
  assert.deepEqual(await readShock(store, "ETH"), { factor: 2, until: 1_900 });
  assert.equal(await readShock(store, "XLM"), null);
});

test("S-E1: no depth stored means no liquidity cap", async () => {
  assert.equal(await readDepth(kv(), "XLM"), null);
});

test("S-R1, S-R2: a depth that is not a non-negative number refuses the quote", async () => {
  for (const bad of ["abc", "-5", "", "NaN", "Infinity"]) {
    const store = kv();
    await store.put(depthKey("XLM"), bad);
    await assert.rejects(readDepth(store, "XLM"), `depth ${JSON.stringify(bad)} must be refused`);
  }
});

test("S-R3, S-R4: a malformed shock refuses the quote", async () => {
  for (const bad of ["{not json", "null", '{"factor":0,"until":1900}', '{"factor":-2,"until":1900}', '{"factor":2}']) {
    const store = kv();
    await store.put(shockKey("XLM"), bad);
    await assert.rejects(readShock(store, "XLM"), `shock ${bad} must be refused`);
  }
});

test("S-E3: vol tables published to KV by the recalibration job replace the deploy bundle", async () => {
  const store = kv();
  await store.put("vol-tables", JSON.stringify(fresh));
  assert.deepEqual(await readVolTables(store, bundle), fresh);
});

test("S-E4: with no vol tables in KV the deploy bundle is used", async () => {
  assert.deepEqual(await readVolTables(kv(), bundle), bundle);
});

test("S-R5: vol tables in KV that are not JSON fall back to the bundle", async () => {
  const store = kv();
  await store.put("vol-tables", "{truncated");
  assert.deepEqual(await readVolTables(store, bundle), bundle);
});

test("S-X1: a KV vol table with sigma outside (0, 3] falls back to the bundle", async () => {
  for (const sigma of [0, -0.5, 50]) {
    const store = kv();
    const tampered = { ...fresh, XLM: { buckets: { "3600": { down: sigma, up: 0.8 } } } };
    await store.put("vol-tables", JSON.stringify(tampered));
    assert.deepEqual(await readVolTables(store, bundle), bundle, `sigma ${sigma}`);
  }
});

test("S-X2: a KV vol table missing an asset or a bucket falls back to the bundle", async () => {
  const noBtc = kv();
  await noBtc.put("vol-tables", JSON.stringify({ XLM: fresh.XLM }));
  assert.deepEqual(await readVolTables(noBtc, bundle), bundle);

  const noBucket = kv();
  await noBucket.put("vol-tables", JSON.stringify({ ...fresh, BTC: { buckets: {} } }));
  assert.deepEqual(await readVolTables(noBucket, bundle), bundle);
});
