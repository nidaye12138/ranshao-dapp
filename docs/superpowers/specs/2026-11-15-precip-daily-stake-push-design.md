# 沉淀池日释放 → 质押自动到账（方案 A）

## Goal

按客户口径：沉淀池（权重 5% + 不足 9 代层奖）每日由 **Owner/后台** 释放余额的 **5%**，按质押占比 **直接转入用户钱包（UMplan）**，并 **顺延质押锁仓 24h**。用户无需领取。

## Non-goals

- 不改 SPCXB `DividendPools`（仍为 inject + 用户 claim + 24h 冷却）
- 不做公开 keeper（仅 Owner 触发）

## Contracts

### PrecipitationPool

- `eliteStake` + `setEliteStake`
- `lastDailyReleaseAt`；`previewDailyRelease() = balance × 5%`
- `releaseDailyToStake()` onlyOwner：满 24h → 转 UMplan 到 EliteStake → 调 `pushDailyRelease(amount)`

### EliteStake

- `rewardToken` = UMplan（与 stakingToken 相同）
- `precip` + `onlyPrecip`；质押地址列表
- `pushDailyRelease(amount)`：按 `stakedOf/totalStaked` 转账到钱包，锁仓 +24h；支持 `continuePush` 分批
- 保留 `stake` / `unstake` / `redeem` / `claim`（旧 pending 兼容）；主路径为日推送

### Cutover

- 主网重部署 EliteStake（现网奖励币为 SPCXB 且无 unlockAt）
- 迁移已有质押；`NEXT_PUBLIC_ELITE_ADDRESS` 更新；沉淀池 `setEliteStake`

## UI

- 预估每期分红 = `precipBalance × 5% × staked / totalStaked`（即时，不依赖是否已跑当日释放）
- 日释放后余额进钱包；本金仍在质押合约
