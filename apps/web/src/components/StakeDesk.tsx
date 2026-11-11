"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { zeroAddress } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { fmtToken, parseAmount } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import EliteAbi from "@/lib/abi/EliteStake.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import ERC20Abi from "@/lib/abi/ERC20.json";

/**
 * 1500U 质押台 — unlock after burnTier(4) / DividendPools.tierOf == 4.
 * Wire: EliteStake (stake UMplan, 24h min, redeem / claim+extend).
 * TODO: copy wants stake dividends in UMplan; deployed rewardToken may be SPCXB — UI labels rewardToken dynamically.
 */
export function StakeDesk() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const [stakeAmount, setStakeAmount] = useState("");
  const [nowSec, setNowSec] = useState(0);
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: appChainId });

  useEffect(() => {
    setNowSec(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 5_000);
    return () => clearInterval(t);
  }, []);

  const eliteReady = addresses.elite !== zeroAddress;
  const enabled = mounted && isConfigured && eliteReady && !!address;

  const { data: tier } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled: mounted && isConfigured && !!address },
  });

  const unlocked = tier != null && Number(tier) === 4;

  const { data: staked } = useReadContract({
    address: addresses.elite,
    abi: EliteAbi,
    functionName: "stakedOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: totalStaked } = useReadContract({
    address: addresses.elite,
    abi: EliteAbi,
    functionName: "totalStaked",
    chainId: appChainId,
    query: { enabled: mounted && eliteReady },
  });

  const { data: pending } = useReadContract({
    address: addresses.elite,
    abi: EliteAbi,
    functionName: "pendingRewards",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: unlockAt } = useReadContract({
    address: addresses.elite,
    abi: EliteAbi,
    functionName: "unlockAt",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: isStakeUnlocked } = useReadContract({
    address: addresses.elite,
    abi: EliteAbi,
    functionName: "isUnlocked",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: rewardToken } = useReadContract({
    address: addresses.elite,
    abi: EliteAbi,
    functionName: "rewardToken",
    chainId: appChainId,
    query: { enabled: mounted && eliteReady },
  });

  const { data: tokenBal } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled: mounted && isConfigured && !!address },
  });

  const parsed = useMemo(() => {
    try {
      return parseAmount(stakeAmount || "0", 18);
    } catch {
      return 0n;
    }
  }, [stakeAmount]);

  const { data: allowance } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.elite],
    chainId: appChainId,
    query: { enabled },
  });

  const needApprove = (allowance as bigint | undefined ?? 0n) < parsed;
  const stakedBn = (staked as bigint | undefined) ?? 0n;
  const totalBn = (totalStaked as bigint | undefined) ?? 0n;
  const pendingBn = (pending as bigint | undefined) ?? 0n;
  const unlockTs = unlockAt != null ? Number(unlockAt as bigint) : 0;
  const lockLeft = unlockTs > 0 && nowSec > 0 ? Math.max(0, unlockTs - nowSec) : 0;
  const sharePct =
    totalBn > 0n && stakedBn > 0n ? (Number(stakedBn) / Number(totalBn)) * 100 : 0;

  const rewardLabel =
    rewardToken && typeof rewardToken === "string"
      ? rewardToken.toLowerCase() === addresses.spcxb.toLowerCase()
        ? "SPCXB"
        : rewardToken.toLowerCase() === addresses.token.toLowerCase()
          ? "UMplan"
          : "奖励币"
      : "奖励币";

  function setPct(pct: number) {
    const bal = tokenBal as bigint | undefined;
    if (!bal) return;
    if (pct >= 100) setStakeAmount((Number(bal) / 1e18).toString());
    else setStakeAmount((Number((bal * BigInt(pct)) / 100n) / 1e18).toString());
  }

  function fmtCountdown(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="card">
      <h2 className="card-title">
        质押分红权益
        <span className="muted">1500U 档按钮解锁 · 最短 24h</span>
      </h2>

      <div className="doc-text" style={{ marginBottom: "0.75rem" }}>
        <p>
          分红公式：百 5 总释放量 ÷ 全网总质押 = 每币分红（合约{" "}
          <code>notifyRelease</code> × 5% / totalStaked）。
        </p>
        <p>
          赎回：最短 24 小时；可「领本金 + 分红」清仓，或「仅领分红」并自动顺延 24
          小时。
        </p>
        <p className="muted">
          {/* TODO: product copy prefers UMplan payouts; current EliteStake.rewardToken is deploy-time (often SPCXB). */}
          质押本金为 UMplan；链上分红资产以合约 <b>rewardToken</b> 为准（当前展示：{rewardLabel}
          ）。
        </p>
      </div>

      {!eliteReady ? (
        <p className="banner warn">
          EliteStake 地址未配置（NEXT_PUBLIC_ELITE_ADDRESS）。UI 已就绪，待部署后接线。
        </p>
      ) : !unlocked ? (
        <p className="banner warn">
          质押权益仅对完成 <b>1500U 档位按钮</b>权重销毁的用户开放；当前未达成，确认质押不可用。手输金额不计入档位。
        </p>
      ) : (
        <p className="banner ok">1500U 档位已达成，质押权益已解锁，可自由选择质押数量。</p>
      )}

      <div className="input-box">
        <div className="ib-label">质押数量（UMplan · 可自由选择）</div>
        <div className="input-row">
          <input
            value={stakeAmount}
            onChange={(e) => setStakeAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            disabled={!unlocked || !eliteReady}
          />
          <div className="token-chip">
            <i className="tc-dot tc-um" />
            UMplan
          </div>
        </div>
      </div>

      <div className="chips">
        {[25, 50, 75, 100].map((p) => (
          <button
            key={p}
            type="button"
            className="chip"
            onClick={() => setPct(p)}
            disabled={!unlocked || !eliteReady || !tokenBal}
          >
            {p === 100 ? "全部" : `${p}%`}
          </button>
        ))}
      </div>

      <dl className="stats">
        <div>
          <dt>我的分红配额</dt>
          <dd>{sharePct > 0 ? `${sharePct.toFixed(4)}%` : "—"}</dd>
        </div>
        <div>
          <dt>全网总质押</dt>
          <dd>{totalStaked != null ? fmtToken(totalBn) : "—"}</dd>
        </div>
      </dl>

      {!mounted ? (
        <p className="muted">加载中…</p>
      ) : !isConnected ? (
        <p className="banner warn">请先连接钱包</p>
      ) : (
        <div className="cta-row" style={{ marginTop: "0.65rem" }}>
          {needApprove && (
            <button
              type="button"
              className="btn"
              disabled={!unlocked || !eliteReady || isPending || confirming || parsed === 0n}
              onClick={() =>
                writeContract({
                  address: addresses.token,
                  abi: ERC20Abi,
                  functionName: "approve",
                  args: [addresses.elite, parsed],
                  chainId: appChainId,
                })
              }
            >
              授权
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            style={{ flex: 1 }}
            disabled={
              !unlocked || !eliteReady || isPending || confirming || needApprove || parsed === 0n
            }
            onClick={() =>
              writeContract({
                address: addresses.elite,
                abi: EliteAbi,
                functionName: "stake",
                args: [parsed],
                chainId: appChainId,
              })
            }
          >
            {isPending || confirming ? "确认中…" : "确认质押"}
          </button>
        </div>
      )}

      {stakedBn > 0n && (
        <div className="stake-panel" style={{ marginTop: "1rem" }}>
          <h3 className="card-title" style={{ fontSize: "0.95rem" }}>
            我的质押 · 赎回
            <span className="muted">{isStakeUnlocked ? "可赎回 · 随时领取" : "质押期中"}</span>
          </h3>
          <dl className="stats">
            <div>
              <dt>质押本金</dt>
              <dd>{fmtToken(stakedBn)} UMplan</dd>
            </div>
            <div>
              <dt>到期倒计时</dt>
              <dd>{lockLeft > 0 ? fmtCountdown(lockLeft) : isStakeUnlocked ? "已到期" : "—"}</dd>
            </div>
            <div>
              <dt>未领分红</dt>
              <dd>
                {fmtToken(pendingBn)} {rewardLabel}
              </dd>
            </div>
          </dl>
          <div className="cta-row" style={{ marginTop: "0.65rem" }}>
            <button
              type="button"
              className="btn primary"
              style={{ flex: 1 }}
              disabled={!eliteReady || !isStakeUnlocked || isPending || confirming}
              onClick={() =>
                writeContract({
                  address: addresses.elite,
                  abi: EliteAbi,
                  functionName: "redeem",
                  chainId: appChainId,
                })
              }
            >
              领本金 + 分红
            </button>
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              disabled={!eliteReady || !isStakeUnlocked || pendingBn === 0n || isPending || confirming}
              onClick={() =>
                writeContract({
                  address: addresses.elite,
                  abi: EliteAbi,
                  functionName: "claim",
                  chainId: appChainId,
                })
              }
            >
              仅领分红 · 顺延
            </button>
          </div>
        </div>
      )}

      {isSuccess && <p className="banner ok">质押操作已确认</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </div>
  );
}
