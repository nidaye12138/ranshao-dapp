# Umidor DApp — UM plan

**Umidor** · BNB Smart Chain DApp：Swap 买入（0.5%+0.5%）、推荐树（最多 9 层）、燃烧 50/40/10（层奖 直推20/间推10/市场10）、四档 SPCXB 分红、股东池（453）、1500U 可选质押。

产品权威：20261106 UM 计划（相对初版仅保留 Swap 即时奖重叠）。

## 仓库结构

```
contracts/          Foundry Solidity + tests + deploy scripts
apps/web/           Next.js + wagmi + viem + /api read handlers
subgraph/           The Graph schema + handlers (BSC / Chapel)
deployments/        Address manifests
scripts/            Helper shells
DEPLOY.md           Deploy checklist + locked params + MVP §9 defaults
docs/TOKEN.md       External UMplan / FoT notes
```

## 锁定参数

| 项 | 值 |
|----|----|
| 链 | BNB Smart Chain |
| 主网项目币 | **UMplan** `0xad09…7777`（外部存量，不新 mint） |
| 分红池资产 | **SPCXB** `0xbe9D…03E1` |
| Swap 即时奖 | 买方 0.5% + 直推 0.5%（支付币种）；无推荐人 → Treasury |
| 燃烧拆账 | 50% 销毁 / 40% 九层 / 10% 股东（直推20·间推10·市场10 占订单额） |
| 九层 | 直推 L1 2000 bps；间推 L2 1000；市场 L3–9 合计 1000（相对总额 B；订单拆分 50/40/10） |
| 四档门槛 U | 100 / 500 / 800 / 1500 |
| 池权重 bps | 3333 / 2500 / 2500 / 1667 |
| 股东席位 | 最多 **453**（管理员白名单） |

已废弃主路径：15d/30d 生息、买/质押业绩里程碑、旧 300 席股东门槛。

MVP 对 §9 开放问题的默认值见 `DEPLOY.md` 与 `contracts/src/Constants.sol`。

## 合约

```bash
cd contracts
forge install
forge build
forge test
```

| 合约 | 说明 |
|------|------|
| `ReferralTree` | 绑定一次、walk≤9、防环 |
| `SwapFacade` | BNB/USDT 买入 + 0.5%/0.5% |
| `BurnRouter` | 金本位定档、50/40/10 |
| `LayerRewards` | 九层发放；缺层 → 沉淀 |
| `PrecipitationPool` | 沉淀；T4 分 5%；95% 管理员 |
| `DividendPools` | 四档 SPCXB；最高档；均分 claim |
| `ShareholderPool` | 10% 均分；453 席 |
| `EliteStake` | T4 可选质押；`notifyRelease` |
| `BrokerMarket` | Phase 2 stub |
| `Treasury` | 收款 / 模块注册 / 暂停 |
| `RanshaoToken` | 仅测试网 mintable |

部署：见 **[DEPLOY.md](DEPLOY.md)**。

## 前端

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

底栏 4 Tab：`/` 首页 · `/swap` · `/promo` 推广 · `/mine` 我的（旧路由重定向）。

### 只读 API（索引骨架）

| Route | 说明 |
|-------|------|
| `GET /api/leaderboard` | Top10 直推人数 |
| `GET /api/team?address=` | 直推/间推/购买量/伞下业绩 |
| `GET /api/earnings?address=` | Swap 推广 + 层奖（直推/间推/市场3…9）+ 分红明细 |
| `GET /api/announcements` | 静态 CMS：`apps/web/src/data/announcements.json` |
| `GET /api/stats` | 币价 stub + 累计销毁（优先链上，可叠 Graph） |

设置 `GRAPH_URL` 指向已部署 subgraph 的 GraphQL HTTP 端点。未设置时返回空结构 + `source: "unconfigured"`（**不会**伪造排行榜）。

## Subgraph（The Graph）

```bash
cd subgraph
npm install
export SUBGRAPH_NETWORK=chapel   # or bsc
export REGISTRY_ADDRESS=0x… SWAP_ADDRESS=0x… BURN_ADDRESS=0x…
export LAYER_ADDRESS=0x… DIVIDENDS_ADDRESS=0x… START_BLOCK=…
npm run prepare:manifest
# or: npm run prepare:manifest -- --from=../deployments/bsc-testnet.json
npm run codegen
npm run build
# Studio: npm run deploy:studio
# Local:  npm run create-local && npm run deploy-local
```

详情见 [`subgraph/README.md`](subgraph/README.md)。

## License

MIT
