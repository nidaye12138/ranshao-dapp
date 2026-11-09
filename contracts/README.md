# contracts — UM plan

Foundry workspace for 燃烧 / UMplan modules.

```bash
forge install
forge build
forge test
forge script script/Deploy.s.sol:Deploy --rpc-url <RPC> --broadcast
```

Legacy initial-design contracts (milestones, 15d/30d stake, old shareholder) live under `legacy/mvp-v1/` for reference only and are **not** compiled.

See root [DEPLOY.md](../DEPLOY.md) for locked params and MVP §9 defaults.
