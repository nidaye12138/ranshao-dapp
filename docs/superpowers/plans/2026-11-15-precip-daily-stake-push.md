# Precip daily stake push Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Owner-triggered daily 5% of PrecipitationPool UMplan balance auto-pushed to EliteStake stakers by share, with +24h lock extend.

**Architecture:** Precip `releaseDailyToStake` transfers 5% to Elite; Elite `pushDailyRelease` pays wallets from staker list.

**Tech Stack:** Solidity 0.8.24 Foundry, Next.js StakeDesk, viem/wagmi.

### Task 1: Contracts + forge tests

- Update `PrecipitationPool.sol`, `IPrecipitationPool.sol`, `EliteStake.sol`
- Fix `UmPlan.t.sol` elite test for UMplan daily push
- Commit

### Task 2: Frontend estimate

- StakeDesk: preview from precip balance × 5% × share; wire elite/precip addresses
- Commit

### Task 3: Deploy script + ABI sync

- Foundry script for mainnet Elite redeploy + setEliteStake
- Sync `apps/web/src/lib/abi/EliteStake.json`
- PR / note owner ops for cron
