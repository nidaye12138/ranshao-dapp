# 燃烧 (Ranshao) DApp

BNB Smart Chain DApp MVP：购买（BNB/USDT）、直推即时奖励、购买业绩档位、存币生息、股东登记。

## 仓库结构

```
contracts/          Foundry Solidity contracts + tests + deploy script
apps/web/           Next.js + wagmi + viem 前端（中文文案）
```

## 产品参数（已锁定）

| 项 | 值 |
|----|----|
| 链 | BNB Smart Chain (BEP-20) |
| 即时奖励 | 买方 0.5% + 直推 0.5%，与支付币种相同 |
| 无推荐人 | 直推 0.5% 进入 Treasury |
| 档位 | 达标快照模型；奖励 USDT；MVP 仅购买侧 |
| 推广解锁 | 累计购买 ≥ 50 USDT |
| 质押 | ≥100 USD；&lt;15d 无息；≥15d 2%；≥30d 5%；续期只滚本金 |
| 股东 | 最多 300 席；自身 ≥50 万（余额+质押）；直推合计 ≥500 万 |

## 合约

### 依赖

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- OpenZeppelin Contracts（`forge install`）

```bash
cd contracts
forge install   # 拉取 lib/forge-std 与 openzeppelin-contracts
forge build
forge test
```

### 合约一览

| 合约 | 说明 |
|------|------|
| `RanshaoToken` | 项目 BEP-20，Sale 可 mint |
| `ReferralRegistry` | 直推绑定、推广资格、个人购买累计 |
| `Sale` | BNB/USDT 购买 + 即时 0.5%/0.5% |
| `MilestoneRewards` | 购买档位快照与 claim（质押侧接口预留） |
| `Stake` | 质押 / 提取 / 本金续期 |
| `Shareholder` | 资格校验、入座、分红期次 stub |
| `Treasury` | 收款、暂停、运营提款 |
| `MockPriceOracle` / `MockERC20` | 测试与本地部署 |

### 部署

```bash
cd contracts
# 本地 Anvil
anvil &
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast -vvvv

# BSC 测试网
export PRIVATE_KEY=...
export BSC_TESTNET_RPC_URL=...
forge script script/Deploy.s.sol:Deploy --rpc-url $BSC_TESTNET_RPC_URL --broadcast --verify
```

脚本会打印各合约地址。将地址写入 `apps/web/.env.local`。

部署后运营建议：

1. 向 `MilestoneRewards` 注入 USDT 奖励池  
2. 向 `Stake` 调用 `fundRewards` 注入利息储备  
3.（可选）`registry.setPromoter` 引导创世推广人  
4. 生产环境将 `MockPriceOracle` 替换为 Chainlink 适配器（见下方）

### 主网预言机参考（未接线，仅文档）

- Chainlink BNB/USD (BSC)：`0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE`  
- USDT 可按 1:1；项目币 MVP 使用管理员定价 / mock  
- BSC USDT（Binance-Peg）：`0x55d398326f99059fF775485246999027B3197955`（18 decimals）

## 前端

```bash
cd apps/web
cp .env.example .env.local   # 填入合约地址
npm install
npm run dev
```

打开 http://localhost:3000 。页面：

- `/` 首页  
- `/buy` 购买  
- `/promo` 绑定邀请 + 档位领取  
- `/stake` 存币生息  
- `/shareholder` 股东状态  

技术栈：React、Next.js App Router、wagmi、viem、TanStack Query。

## 测试覆盖

`forge test` 覆盖：绑定推荐人、推广阈值、BNB/USDT 购买与即时奖励、无推荐人入金库、档位快照领取、质押锁仓收益与续期、股东资格（含质押计入）。

## 非 MVP / 已知缺口

- 质押侧业绩档位完整产品化（合约接口已留，默认关闭上报）  
- 股东复杂分红 / 席位回收 / Merkle 空投  
- 生产 Chainlink 适配器与 Timelock 改价  
- WalletConnect 云项目 ID、The Graph 索引看板  
- 合约审计与多签运营流程 hardening  

## License

MIT
