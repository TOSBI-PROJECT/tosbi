# SOW 2 test scenarios

Test-first scenario matrix for the remaining SOW 2 engineering work: pricer risk data, the keeper run log, and settlement edge cases. Scenario IDs appear in the test names.

Assumptions: feature type *payment* (the keeper moves USDC); tests target `origin/main` at `13b65c8`; only backend behavior is automated, so the demo interface's accessibility checks and the testnet measurement week are manual.

Coverage check: `test_scenario_generator.py`, payment rubric. 45 scenarios, 0 fail, 0 warn (one info: no cross-platform scenarios, not applicable to backend code).

| ID | Scenario | Category | Priority | Where |
| --- | --- | --- | --- | --- |
| S-H1 | Quote applies the vol shock stored by the minute cron (sigma doubled for cover over 1 hour) | Happy path | P0 | `pricer/test/risk.test.ts` (red) |
| S-H2 | Quote applies the liquidity cap from the depth stored by the daily cron | Happy path | P0 | `pricer/test/risk.test.ts` (red) |
| S-H3 | Keeper settles an expired protection and records tx hash, ledger, ledger time, latency and payout | Happy path | P0 | `pricer/test/keeper.test.ts` (red) |
| S-E1 | No depth stored: quote proceeds with no liquidity cap | Edge | P1 | `pricer/test/risk.test.ts` (red) |
| S-E2 | Shock whose until time has passed is ignored | Edge | P1 | `service.test.ts` vol shock test (existing, green) |
| S-E3 | Vol tables in KV are used instead of the deploy bundle | Edge | P0 | `pricer/test/risk.test.ts` (red) |
| S-E4 | No vol tables in KV: the deploy bundle is used | Edge | P1 | `pricer/test/risk.test.ts` (red) |
| S-E5 | settle_early is recorded with no latency (outside the 5-minute measure) | Edge | P1 | `pricer/test/keeper.test.ts` (red) |
| S-E6 | Receipt without ledger close time: latency recorded as null, not NaN | Edge | P1 | `pricer/test/keeper.test.ts` (red) |
| S-E7 | Payout above 2^53 is stored and read back exactly | Edge | P0 | `pricer/test/keeper-log.test.ts` (red) |
| S-E8 | Oracle record missing exactly at expiry while the window exists: OracleStale, then degraded after 2 hours | Edge | P1 | `settle.rs` `st10` (new, green) |
| S-E9 | Sustained move above 15% inside one record period: TWAP keeps the pre-move records | Edge | P2 | `settle.rs` `st11` (new, green) |
| S-E10 | Keeper log limit defaults to 100 and accepts up to 500 | Edge | P2 | `pricer/test/keeper-log.test.ts` (red) |
| S-R1 | Depth stored as a non-number: no quote is signed | Error | P0 | `pricer/test/risk.test.ts` (red) |
| S-R2 | Negative depth: no quote is signed | Error | P1 | `pricer/test/risk.test.ts` (red) |
| S-R3 | Shock stored as malformed JSON: no quote is signed | Error | P0 | `pricer/test/risk.test.ts` (red) |
| S-R4 | Shock factor zero or negative: no quote is signed | Error | P1 | `pricer/test/risk.test.ts` (red) |
| S-R5 | KV vol tables not valid JSON: bundle used, quote still priced | Error | P1 | `pricer/test/risk.test.ts` (red) |
| S-R6 | Shock refusal names the asset and when short cover reopens | Error | P2 | `pricer/test/service.test.ts` (red) |
| S-R7 | settle fails with OracleStale: recorded as failed with the error name and retried next run | Error | P0 | `pricer/test/keeper.test.ts` (red) |
| S-R8 | Writing a log row fails: keeper still handles the remaining protections and records the run | Error | P0 | `pricer/test/keeper.test.ts` (red) |
| S-R9 | Position read fails: counted as failed in the run summary | Error | P1 | `pricer/test/keeper.test.ts` (red) |
| S-R10 | Keeper log limit out of range or not an integer: rejected | Error | P2 | `pricer/test/keeper-log.test.ts` (red) |
| S-R11 | Settlement transaction lands with status FAILED: recorded as failed with its hash | Error | P1 | `pricer/test/keeper.test.ts` (red) |
| S-M1 | Keeper run with no protections: one run row with zero counts | Empty | P1 | `pricer/test/keeper.test.ts` (red) |
| S-M2 | No log rows yet: runs and calls queries return empty lists | Empty | P1 | `pricer/test/keeper-log.test.ts` (red) |
| S-C1 | Overlapping run or outside caller settled first: AlreadySettled recorded as skipped, not failed | Concurrent | P0 | `pricer/test/keeper.test.ts` (red) |
| S-C2 | Two settle calls on one protection: the contract pays once (existing x8, c5) | Concurrent | P0 | `settle.rs` `x8`, `c5` (existing) |
| S-C3 | Cursor never moves past an active protection (existing keeper test) | Concurrent | P1 | `keeper.test.ts` cursor test (existing) |
| S-C4 | Protection bought during a keeper run is settled by a later run (testnet, Week 3) | Concurrent | P2 | Manual (testnet, Week 3) |
| S-C5 | Vol tables replaced in KV during a request: the quote uses one table version | Concurrent | P2 | Manual (testnet, Week 3) |
| S-A1 | Rejection message in the demo is announced to screen readers | Accessibility | P2 | Manual |
| S-A2 | Settlement result is readable without colour (status as text) | Accessibility | P2 | Manual |
| S-A3 | Keyboard only: open position, quote, buy, focus lands on the result | Accessibility | P2 | Manual |
| S-X1 | Tampered KV vol table with sigma out of range is rejected in favour of the bundle | Security | P0 | `pricer/test/risk.test.ts` (red) |
| S-X2 | KV vol table missing an asset is rejected in favour of the bundle | Security | P1 | `pricer/test/risk.test.ts` (red) |
| S-X3 | Keeper log limit containing SQL text is rejected and the table stays intact | Security | P0 | `pricer/test/keeper-log.test.ts` (red) |
| S-X5 | Recorded error text is cut to 400 characters | Security | P2 | `pricer/test/keeper.test.ts` (red) |
| S-X6 | Settlement pays only the protection's trader and needs no keeper signature (existing s3) | Security | P0 | `settle.rs` `s3` (existing) |
| S-X7 | Keeper API is read-only: no request triggers a settlement or spends keeper fees | Security | P1 | Manual |
| S-X8 | Keeper API responses contain no secrets or environment values | Security | P1 | Manual |
| S-X9 | Demo renders RPC error text as text, never as HTML | Security | P1 | Manual |
| S-X11 | Leaked pricer key is replaced with Change::Pricer (existing g4) | Security | P1 | `governance.rs` `g4` (existing) |
| S-P1 | Keeper run with 50 active protections stays within the Cloudflare subrequest limit | Performance | P1 | Manual (testnet, Week 3) |
| S-P2 | Share of protections settled within 300 s over the measurement week meets the target | Performance | P0 | Manual (testnet, Week 3) |

## Interfaces the red tests define

- `pricer/src/risk.ts`: `depthKey`, `shockKey`, `writeDepth`, `readDepth`, `writeShock`, `readShock`, `readVolTables(kv, bundle)`. The crons and `/api/quote` must both use these, so the key format lives in one place.
- `pricer/src/keeper.ts`: `KeeperDeps.call` returns the receipt (`hash`, `status`, `ledger`, `createdAt`, `result`); new deps `record(CallRow)` and `recordRun(RunRow)`; exported types `CallRow` and `RunRow`. `AlreadySettled` is a skip; error text is cut to 400 characters.
- `pricer/src/keeper-log.ts`: `insertCall`, `insertRun`, `listCalls(db, limit)`, `listRuns(db, limit)` on D1's `prepare/bind/run/all`, and `parseLimit` (default 100, 1 to 500, else `BadRequest`). Payouts are stored as text so i128 values survive.
- `pricer/migrations/0001_keeper_log.sql`: the `keeper_runs` and `keeper_calls` tables the D1 binding uses.
- `pricer/src/service.ts`: the vol-shock refusal names the asset and the ISO time short cover reopens.
