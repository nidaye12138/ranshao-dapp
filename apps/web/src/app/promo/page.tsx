"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { addresses, isConfigured } from "@/lib/addresses";
import { fmtToken, parseAmount } from "@/lib/format";
import BurnAbi from "@/lib/abi/BurnRouter.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import ERC20Abi from "@/lib/abi/ERC20.json";

const TIERS = [
  { u: 100, label: "100U" },
  { u: 500, label: "500U" },
  { u: 800, label: "800U" },
  { u: 1500, label: "1500U" },
];

export default function PromoPage() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("100");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const parsed = useMemo(() => {
    try {
      return parseAmount(amount || "0", 18);
    } catch {
      return 0n;
    }
  }, [amount]);

  const enabled = isConfigured && !!address;

  const { data: quoteUsd } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "quoteBurnUsd",
    args: [parsed],
    query: { enabled: enabled && parsed > 0n },
  });

  // tokens for U: at price P, tokens = U / P. Use quoteBurnUsd inverse via burn quote on 1 token.
  const { data: oneTokUsd } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "quoteBurnUsd",
    args: [10n ** 18n],
    query: { enabled: isConfigured },
  });

  const { data: tier } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierOf",
    args: [address!],
    query: { enabled },
  });

  const { data: claimable } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "claimable",
    args: [address!],
    query: { enabled },
  });

  const { data: canClaim } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "canClaim",
    args: [address!],
    query: { enabled },
  });

  const { data: nextClaim } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "nextClaimAt",
    args: [address!],
    query: { enabled },
  });

  const { data: allowance } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.burn],
    query: { enabled },
  });

  const needApprove = (allowance as bigint | undefined ?? 0n) < parsed;
  const price = (oneTokUsd as bigint | undefined) ?? 0n;

  function pickTier(u: number) {
    if (price === 0n) {
      setAmount(String(u));
      return;
    }
    // tokens = u_usd / price * 1e18, price is usd per 1 token (1e18)
    const tokens = (BigInt(u) * 10n ** 36n) / price;
    setAmount((Number(tokens) / 1e18).toFixed(6));
  }

  const cooldownLeft =
    nextClaim && typeof nextClaim === "bigint" && nextClaim > 0n
      ? Math.max(0, Number(nextClaim) - Math.floor(Date.now() / 1000))
      : 0;

  return (
    <section className="panel">
      <h1>推广</h1>
      <p className="muted">四档燃烧入场 · 层奖励规则 · SPCXB 分红领取（24h 冷却）</p>

      <h2>燃烧入场</h2>
      <div className="pct-row">
        {TIERS.map((t) => (
          <button key={t.u} type="button" className="btn" onClick={() => pickTier(t.u)}>
            {t.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>燃烧数量（UMplan）</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </label>
      <dl className="stats">
        <div>
          <dt>折合 U</dt>
          <dd>{quoteUsd != null ? fmtToken(quoteUsd as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>我的档位</dt>
          <dd>{tier != null ? `T${tier}` : "—"}</dd>
        </div>
      </dl>

      {!isConnected ? (
        <p className="banner warn">请先连接钱包</p>
      ) : !isConfigured ? (
        <p className="banner warn">合约地址未配置</p>
      ) : (
        <div className="cta-row">
          {needApprove && (
            <button
              type="button"
              className="btn"
              disabled={isPending || confirming}
              onClick={() =>
                writeContract({
                  address: addresses.token,
                  abi: ERC20Abi,
                  functionName: "approve",
                  args: [addresses.burn, parsed],
                })
              }
            >
              授权
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={isPending || confirming || needApprove || parsed === 0n}
            onClick={() =>
              writeContract({
                address: addresses.burn,
                abi: BurnAbi,
                functionName: "burn",
                args: [parsed],
              })
            }
          >
            {isPending || confirming ? "确认中…" : "确认燃烧"}
          </button>
        </div>
      )}

      <div className="rules-box">
        <h2>推广收益规则</h2>
        <ul className="rules-list">
          <li>
            <strong>直推</strong>：第 1 层（燃烧额 400 bps）
          </li>
          <li>
            <strong>间推</strong>：仅第 2 层（200 bps）
          </li>
          <li>
            <strong>市场</strong>：第 3–9 层合计；明细标 <strong>市场3…市场9</strong>
          </li>
        </ul>
      </div>

      <h2>分红领取</h2>
      <dl className="stats">
        <div>
          <dt>可领 SPCXB</dt>
          <dd>{claimable != null ? fmtToken(claimable as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>冷却</dt>
          <dd>
            {canClaim ? "可领取" : cooldownLeft > 0 ? `${Math.ceil(cooldownLeft / 3600)}h 后` : "—"}
          </dd>
        </div>
      </dl>
      <p className="muted">每 24h 可领一次（链上强制）；也可累计不领。</p>
      <button
        type="button"
        className="btn primary"
        disabled={!isConfigured || !isConnected || isPending || confirming || !canClaim}
        onClick={() =>
          writeContract({
            address: addresses.dividends,
            abi: DivAbi,
            functionName: "claim",
          })
        }
      >
        领取分红
      </button>

      {isSuccess && <p className="banner ok">交易已确认</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </section>
  );
}
