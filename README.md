# TOSBI — Instaward 1

Protection vault, settlement, position binding, risk caps and governance on Soroban, a signed-quote pricer with keeper, and a testnet demo, for [SOW 1](docs/tosbi-instaward-1-sow.md). Design references: [Architecture 1 spec](docs/tosbi-architecture-1-spec.md), [production scope](docs/superpowers/specs/2026-10-15-tosbi-production-scope-design.md).

| SOW deliverable | Where |
|---|---|
| Vault, settlement, position binding, caps | [contracts/protection/src/lib.rs](contracts/protection/src/lib.rs), [oracle.rs](contracts/protection/src/oracle.rs), [position.rs](contracts/protection/src/position.rs) |
| Governance (roles, pause, timelock) | [contracts/protection/src/governance.rs](contracts/protection/src/governance.rs), [scripts/admin.sh](scripts/admin.sh) |
| Reference PerpDEX and test oracle | [contracts/mock-perpdex](contracts/mock-perpdex/src/lib.rs), [contracts/mock-oracle](contracts/mock-oracle/src/lib.rs) |
| Demo page | [pricer/public/index.html](pricer/public/index.html), served with its API by [pricer/src/worker.ts](pricer/src/worker.ts) (Cloudflare Worker) |
| Pricer | [pricer/src/pricing.ts](pricer/src/pricing.ts), [pricer/src/service.ts](pricer/src/service.ts), [pricer/src/quote.ts](pricer/src/quote.ts), [pricer/scripts/calibrate.ts](pricer/scripts/calibrate.ts) → [pricer/vol-tables/](pricer/vol-tables/) |
| Keeper, vol-shock, depth | [pricer/src/keeper.ts](pricer/src/keeper.ts), [pricer/src/market.ts](pricer/src/market.ts), [.github/workflows/recalibrate.yml](.github/workflows/recalibrate.yml) |
| Tests | [contracts/protection/src/test.rs](contracts/protection/src/test.rs) and [test/](contracts/protection/src/test/), [pricer/test/](pricer/test/), [pricer/scripts/e2e.ts](pricer/scripts/e2e.ts) |

## Testnet deployment

| Component | Testnet deployment |
|---|---|
| Demo | https://tosbi-demo.tosbi-protection.workers.dev |
| Vault | `CALMXPG35NPERCSU3CAXJXKFC7MRRIRE6DJTKNJFC4ULS3S2QYKCDWGE` |
| Mock PerpDEX | `CDOB3GIL3U76WUWXISDXKD3D5PRZGI5UJW2626UCTW6MJX5REAA5E3UQ` |
| Reflector Oracle | `CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63` |
| Test token | `tUSDC:GDOVFRRYEBASHQ5CU6WL37NJXV7TE2LREGQLN7RMEIIA2R3K7DUAZJNB` |
| Token contract | `CAQ22CN647LQH7HV334WLJBCEJO43C5UJJ3ZBK3UY5WC3EJ3K33Y5F7W` |
| Admin (2-of-2 multisig) | `GAWJV4LEBJE5MJXJRFLWNUG4JJVBDTRDTD7DYMVC3EDPQ4MVXODD5P5T` |
| Admin signer 1 (weight 1) | `GBE7CKFVSU2ULKTDA4E5TN3L4OXBUEHO3IS6JM72MAEDWEKZNJQF7W3Y` |
| Admin signer 2 (weight 1) | `GCUA3ABBERYHJAQOCCUPZFNJIXF4CLJIO6B6RRMPNQ3WPJWE2CFHK4XQ` |
| Admin thresholds (low / med / high) | `2 / 2 / 2` |
| Owner | `GCQLZK7NFEUXW2O54W7FAV2LXYWXQEPCU6VTN7PVAYQRRN7FQKLTQ5GJ` |
| Operator | `GCR6WLZFUVPR7KTO7NT7DK2WMWKUY54EMTPGJPX63VYHQ3FSQMWRCHX7` |
| Keeper | `GC2TU7G4VMXH6TAAB7VIQWONPBHFC3JTTAK6EWMPUSMLVI2OJCNNE6V2` |
| Pricer public key (raw hex) | `7b5520caeebcdad507de107fb29048e480f7d8f787f7afded39337d723f47521` |
| Vault | [`CALMXPG35NPERCSU3CAXJXKFC7MRRIRE6DJTKNJFC4ULS3S2QYKCDWGE`](https://stellar.expert/explorer/testnet/contract/CALMXPG35NPERCSU3CAXJXKFC7MRRIRE6DJTKNJFC4ULS3S2QYKCDWGE) |
| Mock PerpDEX | [`CDOB3GIL3U76WUWXISDXKD3D5PRZGI5UJW2626UCTW6MJX5REAA5E3UQ`](https://stellar.expert/explorer/testnet/contract/CDOB3GIL3U76WUWXISDXKD3D5PRZGI5UJW2626UCTW6MJX5REAA5E3UQ) |

The testnet Vault enforces capital reservation and per-wallet
protection limits. Protection settlement uses Reflector Oracle
prices and position states from the Mock PerpDEX.

## Run

```sh
cargo test                      # contracts
cd pricer && npm install
npm test && npm run typecheck   # pricer
npm run calibrate -- XLM        # rebuild vol-tables/XLM.json from Coinbase history (also BTC,ETH)

../scripts/deploy.sh local      # or testnet: keys, 2-of-2 admin, tUSDC, mock PerpDEX, vault, 10,000 tUSDC pool, writes .dev.vars
node scripts/e2e.ts             # drives the Worker API and keeper end to end against that deployment
npx wrangler dev --test-scheduled   # demo at http://localhost:8787; GET /__scheduled runs the keeper once
../scripts/admin.sh testnet propose --change '{"Perpdex":["C...",false]}'   # example only; admin calls need both signers
```

`scripts/deploy.sh local` needs `stellar container start local --protocol-version 29` (Docker); local uses `contracts/mock-oracle`, testnet uses Reflector `CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63`.

Deploying the demo: run `npx wrangler kv namespace create KV` and put its ID in `pricer/wrangler.jsonc`. Copy `VAULT_ID`, `PERPDEX_ID` and `ASSET_ISSUER` from the deployment output. Configure Cloudflare secrets `PRICER_SECRET`, `FAUCET_SECRET` and `KEEPER_SECRET`, then run `npx wrangler deploy`.

## Where this differs from the spec

- **Signature** covers the quote's canonical XDR (the contract re-serializes the struct it decoded), not `sha256(Quote)`. Ed25519 hashes internally; re-serializing means extra or missing map keys can't change what was signed.
- **Quote carries `vault`**, so a quote signed for one deployment can't be replayed on another that shares the pricer key.
- **One core contract.** Vault, book, quote check, oracle reads and governance live in one contract; the PerpDEX implements the position interface directly (`contracts/mock-perpdex` is the reference).
- **Settlement TWAP** is rebuilt record by record with SEP-40 `price(asset, timestamp)`, so a late keeper still settles on the exact window while the oracle keeps history (about 18 hours on Reflector testnet).
- **Position closed before activation** settles with zero payout; **position reduced below the protected quantity** settles the whole contract at the oracle price.
- **Liquidity cap** is enforced by the pricer on max-payout exposure, not on-chain.
- **Withdrawals**: `withdraw_request` is limited to free capital and one request at a time, so `reserved ≤ capital − locked` holds at every step; both are owner-only and `withdraw_execute` pays the owner (the PerpDEX) after 7 days.
- **Prices** use 7 decimals everywhere in the contract; oracle prices are rescaled in one place (`oracle::to_7`).
- **Test token** is `tUSDC`, a classic asset issued by the deploy script, with a faucet in the demo.
