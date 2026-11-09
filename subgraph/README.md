# Umidor subgraph (The Graph)

Indexes ReferralTree binds, Swap buy/sell rewards, Burn, `LayerPaid(layer)`, and Dividend claims for the read APIs under `apps/web/src/app/api/*`.

## Setup

```bash
cd subgraph
npm install
```

Fill addresses (pick one):

```bash
# From env
export SUBGRAPH_NETWORK=chapel   # or bsc
export REGISTRY_ADDRESS=0x…
export SWAP_ADDRESS=0x…
export BURN_ADDRESS=0x…
export LAYER_ADDRESS=0x…
export DIVIDENDS_ADDRESS=0x…
export START_BLOCK=12345678
npm run prepare:manifest

# Or from a deployments JSON
npm run prepare:manifest -- --from=../deployments/bsc-testnet.json
```

Also edit `networks.json` placeholders directly if you prefer.

## Codegen / build / deploy

```bash
npm run codegen   # generates src/../generated from schema + ABIs
npm run build

# Hosted / Studio (example)
npm run deploy:studio

# Local Graph Node
npm run create-local
npm run deploy-local
```

Point the web app at the GraphQL endpoint:

```bash
# apps/web/.env.local
GRAPH_URL=https://api.studio.thegraph.com/query/<id>/umidor-um-plan/version/latest
```

If `GRAPH_URL` is unset, Next route handlers return empty structured payloads with `source: "unconfigured"` (no fake leaderboard).

## Entities → API

| Entity | API |
|--------|-----|
| `Account.directCount` | `GET /api/leaderboard`, `/api/team` |
| `Account.indirectCount` / volumes | `GET /api/team` |
| `SwapReward` / `LayerReward` / `DividendClaim` | `GET /api/earnings` |
| `ProtocolStats` | `GET /api/stats` (burn totals; price may still be chain stub) |
