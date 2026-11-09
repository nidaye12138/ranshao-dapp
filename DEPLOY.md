# Deployment — UM plan (20261106)

Authority: Project store `docs/dapp-design.md` + `docs/um-plan-delta.md`.

## Locked mainnet assets

| Asset | Address | Role |
|-------|---------|------|
| **UMplan** | `0xad09D287327C383283820CfCEe7AC0e6C7De7777` | Buy / burn project token (external) |
| **SPCXB** | `0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1` | Four-tier dividend pool asset |
| USDT | `0x55d398326f99059fF775485246999027B3197955` | Payment (18 decimals on BSC) |

## Locked economic params

- Swap: buyer **0.5%** + direct referrer **0.5%** (payment token); no-referrer → Treasury
- Burn split: **70%** dead / **20%** 9-layer / **10%** shareholders
- Layer bps of B: L1 **400**, L2–L9 **200** each
- Tiers (U): **100 / 500 / 800 / 1500**; pool weights bps **[3333, 2500, 2500, 1667]**
- Shareholder seats cap: **453**
- Deprecated as primary path: 15d/30d stake yield, buy/stake milestones

## MVP defaults (§9 open questions)

Documented in `contracts/src/Constants.sol` and this PR:

| Q | Default |
|---|---------|
| Q2 | Highest tier only (one tier per user) |
| Q3 | Equal per address in tier |
| Q4 | Equal among 1500U burners for precip 5% |
| Q5 | Remaining 95% stays in PrecipitationPool (admin withdraw later) |
| Q6 | Admin `notifyRelease` into EliteStake |
| Q7b | Admin whitelist seats up to 453 |
| Q8 | BrokerMarket stub / Phase 2 |
| Q10 | No-referrer 0.5% → Treasury |
| Q11 | Rewards in payment token |
| Q12 | No UUPS (Ownable + Pausable) |

| Network | Project token | SPCXB | Swap delivery |
|---------|---------------|-------|---------------|
| Mainnet (56) | Existing UMplan | Existing SPCXB | Inventory (`mintMode=false`) |
| Testnet (97) / Anvil | Fresh `RanshaoToken` | Mock SPCXB | Mint (`mintMode=true`) |

---

# BSC Testnet (Chapel · chainId 97)

## Required secrets

| Item | Required | Notes |
|------|----------|-------|
| `PRIVATE_KEY` | **Yes** | Funded deployer; becomes admin/owner |
| Testnet BNB | **Yes** | Gas on chainId 97 |
| `BSC_TESTNET_RPC_URL` | Recommended | Defaults to public node if unset |
| `BSCSCAN_API_KEY` | Optional | `--verify` |

```bash
cd contracts
export PRIVATE_KEY=0xYOUR_TESTNET_KEY
export BSC_TESTNET_RPC_URL=https://bsc-testnet-rpc.publicnode.com
# optional: BNB_USD, TOKEN_USD, FAUCET_USDT, SPCXB_FUND

forge script script/DeployBscTestnet.s.sol:DeployBscTestnet \
  --rpc-url "$BSC_TESTNET_RPC_URL" \
  --broadcast --slow -vvvv
```

Or: `../scripts/deploy-bsc-testnet.sh`

Addresses → [`deployments/bsc-testnet.json`](deployments/bsc-testnet.json).

### Modules deployed

| Contract | Role |
|----------|------|
| RanshaoToken | Test project BEP-20 |
| Mock USDT / SPCXB | Payment + dividend asset |
| ReferralTree | Bind + walk ≤9 |
| Treasury | Proceeds / module registry |
| MockPriceOracle | BNB/USD + token/USD |
| SwapFacade | Buy + 0.5%/0.5% |
| BurnRouter | 70/20/10 + tier update |
| LayerRewards | 9-layer + missing → precip |
| PrecipitationPool | 5% to T4 / 95% admin |
| DividendPools | 4 SPCXB pools |
| ShareholderPool | 453 seats, admin whitelist |
| EliteStake | Optional T4 stake |
| BrokerMarket | Phase 2 fee stub |

### Smoke

```bash
export SWAP=... BURN=... TOKEN=... USDT=...
forge script script/SmokeBscTestnet.s.sol:SmokeBscTestnet \
  --rpc-url "$BSC_TESTNET_RPC_URL" --broadcast
```

---

# BSC Mainnet

```bash
cd contracts
export PRIVATE_KEY=0xYOUR_KEY
export PROJECT_TOKEN=0xad09D287327C383283820CfCEe7AC0e6C7De7777
export SPCXB_ADDRESS=0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1
# optional MAX_TRANSFER_TAX_BPS=300 for FoT inventory delivery

forge script script/DeployBscMainnet.s.sol:DeployBscMainnet \
  --rpc-url "$BSC_RPC_URL" --broadcast --slow -vvvv
```

Post-deploy:

1. `SwapFacade.depositInventory(amount)` — fund UMplan inventory (prefer tax-exempt source)
2. `DividendPools.inject(amount)` — fund SPCXB across four weighted pools
3. `ShareholderPool.addShareholder(addr)` — whitelist up to 453
4. Replace `MockPriceOracle` with Chainlink adapter when ready

---

# Frontend env

```bash
NEXT_PUBLIC_TOKEN_ADDRESS=0xad09D287327C383283820CfCEe7AC0e6C7De7777
NEXT_PUBLIC_SPCXB_ADDRESS=0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1
NEXT_PUBLIC_USDT_ADDRESS=...
NEXT_PUBLIC_REGISTRY_ADDRESS=   # ReferralTree
NEXT_PUBLIC_SWAP_ADDRESS=
NEXT_PUBLIC_BURN_ADDRESS=
NEXT_PUBLIC_DIVIDENDS_ADDRESS=
NEXT_PUBLIC_SHAREHOLDER_ADDRESS=
NEXT_PUBLIC_ELITE_ADDRESS=
NEXT_PUBLIC_PRECIP_ADDRESS=
NEXT_PUBLIC_TREASURY_ADDRESS=
```

See `apps/web/.env.example`.
