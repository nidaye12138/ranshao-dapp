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
import { useI18n } from "@/lib/i18n";
import EliteAbi from "@/lib/abi/EliteStake.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import ERC20Abi from "@/lib/abi/ERC20.json";

/**
 * 15U (T4) 质押台 — unlock after burnTier(4) / DividendPools.tierOf == 4.
 * Wire: EliteStake (stake UMplan, dividends UMplan, 24h min, redeem / claim+extend).
 */
export function StakeDesk() {
  const mounted = useMounted();
  const { t } = useI18n();
  const { address, isConnected } = useAccount();
  const [stakeAmount, setStakeAmount] = useState("");
  const [nowSec, setNowSec] = useState(0);
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: appChainId });

  useEffect(() => {
    setNowSec(Math.floor(Date.now() / 1000));
    const timer = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 5_000);
    return () => clearInterval(timer);
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

  const previewStake = parsed > 0n ? parsed : stakedBn;
  const previewTotal = totalBn + (parsed > 0n ? parsed : 0n);
  const sharePct =
    previewTotal > 0n && previewStake > 0n
      ? (Number(previewStake) / Number(previewTotal)) * 100
      : 0;

  const rewardLabel =
    rewardToken && typeof rewardToken === "string"
      ? rewardToken.toLowerCase() === addresses.spcxb.toLowerCase()
        ? "SPCXB"
        : rewardToken.toLowerCase() === addresses.token.toLowerCase()
          ? "UMplan"
          : t("common.rewardTokenFallback")
      : t("common.rewardTokenFallback");

  const estimateDisplay =
    stakedBn > 0n ? `${fmtToken(pendingBn)} ${rewardLabel}` : "—";

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
    <div className="card stake-desk">
      <h2 className="card-title">
        {t("stake.title")}
        <span className="muted">{t("stake.subtitle")}</span>
      </h2>

      <div className="doc-text stake-rules" style={{ marginBottom: "0.75rem" }}>
        <p>{t("stake.ruleFormula")}</p>
        <p>{t("stake.ruleExample")}</p>
        <p>{t("stake.ruleAsset")}</p>
        <p>{t("stake.ruleRedeem")}</p>
        <p>{t("stake.rulePool")}</p>
      </div>

      {!eliteReady ? (
        <p className="stake-gate warn">{t("stake.eliteMissing")}</p>
      ) : !unlocked ? (
        <p className="stake-gate locked">
          <span className="sg-ico" aria-hidden>
            🔒
          </span>
          <span>{t("stake.locked")}</span>
        </p>
      ) : (
        <p className="stake-gate open">
          <span className="sg-ico" aria-hidden>
            ✓
          </span>
          <span>{t("stake.unlocked")}</span>
        </p>
      )}

      <div className="input-box">
        <div className="ib-label">{t("stake.amountLabel")}</div>
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
            {p === 100 ? t("common.all") : `${p}%`}
          </button>
        ))}
      </div>

      <div className="quota-card" aria-label={t("stake.quotaAria")}>
        <div className="quota-row">
          <span>{t("stake.shareLabel")}</span>
          <b className="quota-pct">{sharePct > 0 ? `${sharePct.toFixed(4)}%` : "0.0000%"}</b>
        </div>
        <div className="quota-row estimate">
          <span>
            <i className="est-gem" aria-hidden>
              ◆
            </i>
            {rewardLabel !== "UMplan"
              ? t("stake.estimateOnChain", { token: rewardLabel })
              : t("stake.estimateLabel")}
          </span>
          <b className="quota-est">{estimateDisplay}</b>
        </div>
        <p className="quota-note">{t("stake.estimateNote")}</p>
        <div className="quota-row muted-row">
          <span>{t("stake.totalStaked")}</span>
          <span>{totalStaked != null ? fmtToken(totalBn) : "—"}</span>
        </div>
      </div>

      {!mounted ? (
        <p className="muted">{t("common.loading")}</p>
      ) : !isConnected ? (
        <p className="banner warn">{t("common.connectWalletFirst")}</p>
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
              {t("common.approve")}
            </button>
          )}
          <button
            type="button"
            className="btn primary stake-cta"
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
            {isPending || confirming ? t("common.confirming") : t("stake.confirmStake")}
          </button>
        </div>
      )}

      {stakedBn > 0n && (
        <div className="stake-panel" style={{ marginTop: "1rem" }}>
          <h3 className="card-title" style={{ fontSize: "0.95rem" }}>
            {t("stake.myStake")}
            <span className="muted">{isStakeUnlocked ? t("stake.redeemable") : t("stake.locking")}</span>
          </h3>
          <dl className="stats redeem-stats">
            <div>
              <dt>{t("stake.principal")}</dt>
              <dd>{fmtToken(stakedBn)} UMplan</dd>
            </div>
            <div>
              <dt>{t("stake.countdown")}</dt>
              <dd className={lockLeft > 0 ? "cd-live" : "cd-done"}>
                {lockLeft > 0 ? fmtCountdown(lockLeft) : isStakeUnlocked ? t("stake.matured") : "—"}
              </dd>
            </div>
            <div>
              <dt>{t("stake.pendingDiv")}</dt>
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
              {t("stake.redeemBoth")}
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
              {t("stake.claimOnly")}
            </button>
          </div>
        </div>
      )}

      {isSuccess && <p className="banner ok">{t("stake.success")}</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </div>
  );
}
