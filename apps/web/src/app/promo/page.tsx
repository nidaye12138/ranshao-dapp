"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, zeroAddress } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { fmtToken, shortAddr } from "@/lib/format";
import RegistryAbi from "@/lib/abi/ReferralRegistry.json";
import MilestoneAbi from "@/lib/abi/MilestoneRewards.json";
import { Suspense } from "react";

const TIERS = [
  { id: 0, label: "5,000 USD", pct: "0.3%" },
  { id: 1, label: "20,000 USD", pct: "0.3%" },
  { id: 2, label: "50,000 USD", pct: "0.5%" },
  { id: 3, label: "100,000 USD", pct: "1%" },
  { id: 4, label: "200,000 USD", pct: "2%" },
];

export default function PromoPage() {
  return (
    <Suspense fallback={<div className="panel">加载中…</div>}>
      <PromoInner />
    </Suspense>
  );
}

function PromoInner() {
  const { address, isConnected } = useAccount();
  const search = useSearchParams();
  const [referrer, setReferrer] = useState("");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    const ref = search.get("ref");
    if (ref && isAddress(ref)) setReferrer(ref);
  }, [search]);

  const enabled = isConfigured && !!address;

  const { data: myReferrer } = useReadContract({
    address: addresses.registry,
    abi: RegistryAbi,
    functionName: "referrerOf",
    args: [address!],
    query: { enabled },
  });

  const { data: isPromoter } = useReadContract({
    address: addresses.registry,
    abi: RegistryAbi,
    functionName: "isPromoter",
    args: [address!],
    query: { enabled },
  });

  const { data: personalBuy } = useReadContract({
    address: addresses.registry,
    abi: RegistryAbi,
    functionName: "personalBuyUsd",
    args: [address!],
    query: { enabled },
  });

  const { data: buyVolume } = useReadContract({
    address: addresses.milestones,
    abi: MilestoneAbi,
    functionName: "buyVolumeUsd",
    args: [address!],
    query: { enabled },
  });

  const { data: directCount } = useReadContract({
    address: addresses.registry,
    abi: RegistryAbi,
    functionName: "directRefCount",
    args: [address!],
    query: { enabled },
  });

  const inviteLink = useMemo(() => {
    if (typeof window === "undefined" || !address) return "";
    return `${window.location.origin}/promo?ref=${address}`;
  }, [address]);

  function onBind() {
    if (!isAddress(referrer)) return;
    writeContract({
      address: addresses.registry,
      abi: RegistryAbi,
      functionName: "bindReferrer",
      args: [referrer],
    });
  }

  function onClaim(tierId: number) {
    writeContract({
      address: addresses.milestones,
      abi: MilestoneAbi,
      functionName: "claimBuyTier",
      args: [tierId],
    });
  }

  const bound = myReferrer && (myReferrer as string) !== zeroAddress;

  return (
    <>
      <header className="page-head">
        <h1>推广中心</h1>
        <p>绑定直推上级、查看推广资格，并领取购买业绩档位奖励。</p>
      </header>
    <div className="grid-2">
      <div className="panel">
        <h2>邀请绑定</h2>
        <p className="hint">直推关系仅一层，绑定后不可更改。上级须已具备推广资格（累计购买 ≥ 50 USDT）。</p>

        <div className="meta">
          <div>
            当前上级：<strong>{bound ? shortAddr(myReferrer as string) : "未绑定"}</strong>
          </div>
          <div>
            推广资格：<strong>{isPromoter ? "已解锁" : "未解锁"}</strong>
          </div>
          <div>
            个人累计购买 USD：<strong>{fmtToken(personalBuy as bigint | undefined)}</strong>
          </div>
          <div>
            直推人数：<strong>{directCount?.toString() ?? "—"}</strong>
          </div>
        </div>

        {!bound && (
          <>
            <label htmlFor="ref">上级地址</label>
            <input
              id="ref"
              value={referrer}
              onChange={(e) => setReferrer(e.target.value)}
              placeholder="0x…"
            />
            <button
              className="btn primary"
              type="button"
              disabled={!isConnected || !isConfigured || isPending || confirming}
              onClick={onBind}
            >
              绑定直推
            </button>
          </>
        )}

        {!!isPromoter && (
          <div style={{ marginTop: "1rem" }}>
            <label>邀请链接</label>
            <input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
            <p className="muted">累计购买达到 50 USDT 后即可分享链接。</p>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>购买业绩档位</h2>
        <p className="hint">按直推下级购买累计 USD 达标快照领取 USDT 奖励（每档一次）。</p>
        <div className="meta">
          <div>
            直推购买总业绩：<strong>{fmtToken(buyVolume as bigint | undefined)} USD</strong>
          </div>
        </div>
        <div className="tier-list">
          {TIERS.map((t) => (
            <TierRow key={t.id} tierId={t.id} label={t.label} pct={t.pct} onClaim={onClaim} disabled={!isConnected || isPending} />
          ))}
        </div>
      </div>

      {isSuccess && <div className="banner ok" style={{ gridColumn: "1 / -1" }}>交易已确认。</div>}
      {error && <div className="banner warn" style={{ gridColumn: "1 / -1" }}>{error.message}</div>}
    </div>
    </>
  );
}

function TierRow({
  tierId,
  label,
  pct,
  onClaim,
  disabled,
}: {
  tierId: number;
  label: string;
  pct: string;
  onClaim: (id: number) => void;
  disabled: boolean;
}) {
  const { address } = useAccount();
  const { data: snapshot } = useReadContract({
    address: addresses.milestones,
    abi: MilestoneAbi,
    functionName: "buySnapshot",
    args: [address!, tierId],
    query: { enabled: isConfigured && !!address },
  });
  const { data: claimed } = useReadContract({
    address: addresses.milestones,
    abi: MilestoneAbi,
    functionName: "buyClaimed",
    args: [address!, tierId],
    query: { enabled: isConfigured && !!address },
  });

  const unlocked = (snapshot as bigint | undefined ?? 0n) > 0n;
  const done = !!claimed;

  return (
    <div className="tier">
      <div>
        <div>
          档位 {tierId + 1} · {label} · {pct}
        </div>
        <div className="muted">
          {done ? "已领取" : unlocked ? `可领 ${fmtToken(snapshot as bigint)} USDT` : "未达标"}
        </div>
      </div>
      <button
        className="btn"
        type="button"
        disabled={disabled || done || !unlocked}
        onClick={() => onClaim(tierId)}
      >
        领取
      </button>
    </div>
  );
}
