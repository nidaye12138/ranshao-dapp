"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { addresses, isConfigured } from "@/lib/addresses";
import { fmtToken, parseAmount } from "@/lib/format";
import StakeAbi from "@/lib/abi/Stake.json";
import ERC20Abi from "@/lib/abi/ERC20.json";
import TokenAbi from "@/lib/abi/RanshaoToken.json";

export default function StakePage() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("10000");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const parsed = useMemo(() => {
    try {
      return parseAmount(amount, 18);
    } catch {
      return 0n;
    }
  }, [amount]);

  const { data: staked } = useReadContract({
    address: addresses.stake,
    abi: StakeAbi,
    functionName: "stakedBalance",
    args: [address!],
    query: { enabled: isConfigured && !!address },
  });

  const { data: posCount } = useReadContract({
    address: addresses.stake,
    abi: StakeAbi,
    functionName: "positionCount",
    args: [address!],
    query: { enabled: isConfigured && !!address },
  });

  const { data: allowance } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.stake],
    query: { enabled: isConfigured && !!address },
  });

  const { data: balance } = useReadContract({
    address: addresses.token,
    abi: TokenAbi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: isConfigured && !!address },
  });

  const needApprove = (allowance as bigint | undefined ?? 0n) < parsed;
  const count = Number(posCount ?? 0n);

  return (
    <>
      <header className="page-head">
        <h1>存币生息</h1>
        <p>
          单笔折合 ≥ 100 USDT。满 15 日可取本金 + 2%；满 30 日可取本金 + 5%；提前取无收益。满 30 日可自动续期（仅滚本金）。
        </p>
      </header>
    <div className="grid-2">
      <div className="panel">
        <h2>开仓质押</h2>
        <p className="hint">授权 RS 后存入仓位，到期按规则取息。</p>

        <div className="meta">
          <div>
            钱包 RS：<strong>{fmtToken(balance as bigint | undefined)}</strong>
          </div>
          <div>
            质押中：<strong>{fmtToken(staked as bigint | undefined)}</strong>
          </div>
          <div>
            仓位数：<strong>{count}</strong>
          </div>
        </div>

        <label htmlFor="stakeAmt">质押数量（RS）</label>
        <input id="stakeAmt" value={amount} onChange={(e) => setAmount(e.target.value)} />

        <div className="cta-row">
          <button
            className="btn"
            type="button"
            disabled={!isConnected || !needApprove || isPending}
            onClick={() =>
              writeContract({
                address: addresses.token,
                abi: ERC20Abi,
                functionName: "approve",
                args: [addresses.stake, parsed],
              })
            }
          >
            授权 RS
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={!isConnected || !isConfigured || needApprove || isPending || confirming}
            onClick={() =>
              writeContract({
                address: addresses.stake,
                abi: StakeAbi,
                functionName: "stake",
                args: [parsed],
              })
            }
          >
            确认质押
          </button>
        </div>
        {isSuccess && <div className="banner ok">交易已确认。</div>}
        {error && <div className="banner warn">{error.message}</div>}
      </div>

      <div className="panel">
        <h2>我的仓位</h2>
        <p className="hint">可提取本息，或在满 30 日后自动续期。</p>
        {count === 0 && <p className="muted">暂无仓位。</p>}
        {Array.from({ length: count }).map((_, i) => (
          <PositionRow key={i} posId={i} disabled={!isConnected || isPending} writeContract={writeContract} />
        ))}
      </div>
    </div>
    </>
  );
}

function PositionRow({
  posId,
  disabled,
  writeContract,
}: {
  posId: number;
  disabled: boolean;
  writeContract: ReturnType<typeof useWriteContract>["writeContract"];
}) {
  const { address } = useAccount();
  const { data } = useReadContract({
    address: addresses.stake,
    abi: StakeAbi,
    functionName: "getPosition",
    args: [address!, BigInt(posId)],
    query: { enabled: isConfigured && !!address },
  });
  const { data: interest } = useReadContract({
    address: addresses.stake,
    abi: StakeAbi,
    functionName: "previewInterest",
    args: [address!, BigInt(posId)],
    query: { enabled: isConfigured && !!address },
  });

  if (!data) return null;
  const [amount, start, , active] = data as [bigint, bigint, bigint, boolean];
  if (!active) {
    return (
      <div className="tier">
        <div className="muted">仓位 #{posId} 已关闭</div>
      </div>
    );
  }

  const startMs = Number(start) * 1000;
  const days = Math.floor((Date.now() - startMs) / 86_400_000);

  return (
    <div className="tier">
      <div>
        <div>
          仓位 #{posId} · {fmtToken(amount)} RS
        </div>
        <div className="muted">
          已过约 {days} 天 · 预计利息 {fmtToken(interest as bigint | undefined)} RS
        </div>
      </div>
      <div className="cta-row">
        <button
          className="btn"
          type="button"
          disabled={disabled}
          onClick={() =>
            writeContract({
              address: addresses.stake,
              abi: StakeAbi,
              functionName: "withdraw",
              args: [BigInt(posId)],
            })
          }
        >
          提取
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={disabled || days < 30}
          onClick={() =>
            writeContract({
              address: addresses.stake,
              abi: StakeAbi,
              functionName: "autoRenew",
              args: [BigInt(posId)],
            })
          }
        >
          续期
        </button>
      </div>
    </div>
  );
}
