# Deployments

| File | Meaning |
|------|---------|
| `bsc-testnet.json` | Live Chapel (chainId 97) addresses. Placeholder until `scripts/deploy-bsc-testnet.sh` runs with a funded `PRIVATE_KEY`. |
| `local-anvil-dry-run.json` | Proof that the testnet deploy + funding script succeeds on local Anvil (forced chainId 97). **Not** a live network. |

Never commit private keys. Address JSON only.
