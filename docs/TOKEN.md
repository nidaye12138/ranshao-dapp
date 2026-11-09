# Project token: UMplan (external) + SPCXB dividends

## Mainnet UMplan

| Field | Value |
|-------|--------|
| Address | [`0xad09D287327C383283820CfCEe7AC0e6C7De7777`](https://bscscan.com/token/0xad09d287327c383283820cfcee7ac0e6c7de7777) |
| Symbol | UMplan |
| Decimals | 18 |
| Mode | **External existing BEP-20** — dApp does **not** deploy or mint on mainnet |

`SwapFacade` runs in **inventory mode** (`mintMode=false`): operators fund via `depositInventory`, then buys pay out from that balance.

Testnet / local still deploy `RanshaoToken` with `mintMode=true`.

## Mainnet SPCXB (dividend pools)

| Field | Value |
|-------|--------|
| Address | [`0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1`](https://bscscan.com/token/0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1) |
| Role | Four-tier burn dividend pools + EliteStake reward asset |
| Note | SpaceX US-stock tokenization on BSC — **≠ UMplan** |

Fund pools with `DividendPools.inject(amount)` (weights 3333/2500/2500/1667).

## Fee-on-transfer / sell tax (~3%)

Third parties report ~**3% sell tax** on UMplan.

| Path | Behavior |
|------|----------|
| `SwapFacade` inventory → buyer | Measures `balanceOf` delta; reverts if shortfall &gt; `maxTransferTaxBps` (mainnet default **300**). Prefer tax-exempt funding source. |
| User → `BurnRouter` | Credits actual received; FoT capped by `maxTransferTaxBps`. |
| Instant buy rewards | Paid in **USDT/BNB** — unaffected by UMplan tax. |
| Layer / shareholder / precip | UMplan transfers; outbound may be taxed by the token. |
| EliteStake / Dividend claims | SPCXB rewards — separate from UMplan FoT. |

**Gap:** We do not whitelist modules inside external UMplan.

## Frontend

`NEXT_PUBLIC_TOKEN_ADDRESS` / `NEXT_PUBLIC_SPCXB_ADDRESS` default to mainnet in `apps/web/src/lib/addresses.ts`.
