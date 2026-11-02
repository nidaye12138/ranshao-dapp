# BSC Testnet deployment (Chapel · chainId 97)

## What you need from the owner

| Item | Required | Notes |
|------|----------|-------|
| `PRIVATE_KEY` | **Yes** | Hex private key of a funded deployer (never commit). Admin/owner of all contracts. |
| Testnet BNB | **Yes** | Gas on chainId 97. Use a BSC testnet faucet (e.g. [BNB Chain faucet](https://www.bnbchain.org/en/testnet-faucet) or community faucets). ~0.05–0.2 tBNB is usually enough for full deploy + smoke. |
| `BSC_TESTNET_RPC_URL` | Recommended | Defaults to `https://bsc-testnet-rpc.publicnode.com` if unset. |
| `BSCSCAN_API_KEY` | Optional | Enables `--verify` on BscScan testnet. |

This Cloud Agent environment currently has **no** `PRIVATE_KEY` / funded deployer, so live broadcast cannot complete here until you inject secrets into the agent environment or run the script locally.

## Quick start

```bash
# 1) Install Foundry deps
cd contracts
forge install

# 2) Export secrets (example — use your own values)
export PRIVATE_KEY=0xYOUR_TESTNET_KEY
export BSC_TESTNET_RPC_URL=https://bsc-testnet-rpc.publicnode.com
# optional:
export BSCSCAN_API_KEY=your_key

# Optional pricing / pool sizes (defaults shown)
export BNB_USD=600000000000000000000          # $600 * 1e18
export TOKEN_USD=10000000000000000            # $0.01 * 1e18
export MILESTONE_FUND=100000000000000000000000  # 100k mock USDT
export STAKE_REWARD_FUND=1000000000000000000000000  # 1M RS

# 3) Deploy
chmod +x ../scripts/deploy-bsc-testnet.sh
../scripts/deploy-bsc-testnet.sh
```

Addresses are written to [`deployments/bsc-testnet.json`](deployments/bsc-testnet.json).

Or call forge directly:

```bash
cd contracts
forge script script/DeployBscTestnet.s.sol:DeployBscTestnet \
  --rpc-url "$BSC_TESTNET_RPC_URL" \
  --broadcast --slow -vvvv
```

## What the script deploys

Mock USDT + fixed `MockPriceOracle` (suitable for testnet smoke; not production Chainlink).

| Contract | Role |
|----------|------|
| RanshaoToken | Project BEP-20 |
| MockERC20 USDT | Test payment / milestone reward asset |
| ReferralRegistry | Direct invite + promote ≥ 50 USDT |
| Treasury | Sale proceeds / pause hub |
| MockPriceOracle | BNB/USD + token/USD |
| MilestoneRewards | Buy-side snapshot claims (USDT) |
| Sale | BNB/USDT buy + 0.5%/0.5% |
| Stake | 15d/30d yields |
| Shareholder | Seat register |

Post-deploy funding (same tx batch):

- Mint mock USDT → fund `MilestoneRewards`
- Mint RS → `Stake.fundRewards`
- Leave faucet USDT on deployer for buy smokes

## Frontend env

Copy addresses into `apps/web/.env.local`:

```bash
NEXT_PUBLIC_TOKEN_ADDRESS=...
NEXT_PUBLIC_USDT_ADDRESS=...
NEXT_PUBLIC_REGISTRY_ADDRESS=...
NEXT_PUBLIC_SALE_ADDRESS=...
NEXT_PUBLIC_MILESTONES_ADDRESS=...
NEXT_PUBLIC_STAKE_ADDRESS=...
NEXT_PUBLIC_SHAREHOLDER_ADDRESS=...
NEXT_PUBLIC_TREASURY_ADDRESS=...
NEXT_PUBLIC_BSC_TESTNET_RPC_URL=https://bsc-testnet-rpc.publicnode.com
```

MetaMask: add network **BNB Smart Chain Testnet**, chainId **97**, currency tBNB.

## Smoke test (buy + stake)

```bash
cd contracts
export SALE=$(jq -r .Sale ../deployments/bsc-testnet.json)
export STAKE=$(jq -r .Stake ../deployments/bsc-testnet.json)
export TOKEN=$(jq -r .RanshaoToken ../deployments/bsc-testnet.json)
export USDT=$(jq -r .USDT ../deployments/bsc-testnet.json)

forge script script/SmokeBscTestnet.s.sol:SmokeBscTestnet \
  --rpc-url "$BSC_TESTNET_RPC_URL" --broadcast -vvvv
```

## Verification

With `BSCSCAN_API_KEY` set, the shell wrapper passes `--verify`. Manual verify:

```bash
forge verify-contract <ADDRESS> <ContractName> \
  --chain-id 97 --etherscan-api-key "$BSCSCAN_API_KEY" \
  --constructor-args $(cast abi-encode "constructor(address)" <admin>)
```

Constructor args differ per contract — prefer the broadcast `--verify` path.

## Local dry-run (no testnet key)

```bash
anvil &
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/DeployBscTestnet.s.sol:DeployBscTestnet \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

## After live deploy checklist

1. Confirm `deployments/bsc-testnet.json` committed (addresses only — never keys).
2. Update `apps/web/.env.example` / `.env.local` with real addresses.
3. Run smoke script; manually bind invite + buy in UI on chain 97.
4. Fund extra milestone/stake pools if smoke exhausts reserves.
