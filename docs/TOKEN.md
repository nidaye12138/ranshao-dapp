# Project token: UMplan (external)

## Mainnet

| Field | Value |
|-------|--------|
| Address | [`0xad09D287327C383283820CfCEe7AC0e6C7De7777`](https://bscscan.com/token/0xad09d287327c383283820cfcee7ac0e6c7de7777) |
| Symbol | UMplan |
| Decimals | 18 |
| Mode | **External existing BEP-20** — dApp does **not** deploy or mint a new project token on mainnet |

Sale runs in **inventory mode** (`mintMode=false`): operators transfer UMplan into `Sale` via `depositInventory`, then buys pay out from that balance.

Testnet / local still deploy `RanshaoToken` with `mintMode=true` for smoke tests.

## Fee-on-transfer / sell tax (~3%)

Third parties report ~**3% sell tax** on UMplan. Implications:

| Path | Behavior in this MVP |
|------|----------------------|
| `Sale` inventory → buyer | Measures `balanceOf` delta; reverts if shortfall &gt; `maxTransferTaxBps` (default **300**). Prefer funding Sale from a **tax-exempt** wallet if the token supports it. |
| User → `Stake` | Principal credited = tokens **actually received**, not the `amount` argument. Min $100 uses received USD. |
| `Stake.fundRewards` | Credits `rewardReserve` from received amount only. |
| `Stake.withdraw` / interest payout | Outbound `transfer` may still be taxed by the token; user gets post-tax balance. Interest math uses credited principal (post-inbound-tax). |
| Instant buy rewards | Paid in **USDT/BNB** (payment asset), not UMplan — unaffected by UMplan sell tax. |
| Milestone claims | Paid in **USDT** — unaffected. |

**Gap (documented):** If sell tax only applies to DEX pair transfers and wallet→contract transfers are untaxed, FoT paths no-op harmlessly. If tax applies to *all* transfers, inventory funding must oversize deposits; users should approve slightly more than stake size. We do **not** attempt to whitelist Sale/Stake inside UMplan (external contract we do not control).

## Frontend

`NEXT_PUBLIC_TOKEN_ADDRESS` defaults to UMplan mainnet in `apps/web/src/lib/addresses.ts` / `.env.example`.
