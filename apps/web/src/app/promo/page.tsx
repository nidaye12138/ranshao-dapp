"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { fmtToken, parseAmount } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import BurnAbi from "@/lib/abi/BurnRouter.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import ERC20Abi from "@/lib/abi/ERC20.json";

const TIERS = [
  { u: 100, label: "100U", sub: "档位一" },
  { u: 500, label: "500U", sub: "档位二" },
  { u: 800, label: "800U", sub: "档位三" },
  { u: 1500, label: "1500U", sub: "档位四" },
];

export default function PromoPage() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("100");
  const [selectedTier, setSelectedTier] = useState<number | null>(100);
  const [nowSec, setNowSec] = useState(0);
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: appChainId });

  useEffect(() => {
    setNowSec(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(t);
  }, []);

  const parsed = useMemo(() => {
    try {
      return parseAmount(amount || "0", 18);
    } catch {
      return 0n;
    }
  }, [amount]);

  const enabled = mounted && isConfigured && !!address;

  const { data: quoteUsd } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "quoteBurnUsd",
    args: [parsed],
    chainId: appChainId,
    query: { enabled: enabled && parsed > 0n },
  });

  const { data: oneTokUsd } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "quoteBurnUsd",
    args: [10n ** 18n],
    chainId: appChainId,
    query: { enabled: isConfigured },
  });

  const { data: tier } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: claimable } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "claimable",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: canClaim } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "canClaim",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: nextClaim } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "nextClaimAt",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: allowance } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.burn],
    chainId: appChainId,
    query: { enabled },
  });

  const needApprove = (allowance as bigint | undefined ?? 0n) < parsed;
  const price = (oneTokUsd as bigint | undefined) ?? 0n;
  const usdPreview =
    quoteUsd != null
      ? Number(formatUnits(quoteUsd as bigint, 18))
      : selectedTier != null
        ? selectedTier
        : 0;
  const splitFire = usdPreview * 0.7;
  const splitMarket = usdPreview * 0.2;
  const splitShare = usdPreview * 0.1;

  function pickTier(u: number) {
    setSelectedTier(u);
    if (price === 0n) {
      setAmount(String(u));
      return;
    }
    const tokens = (BigInt(u) * 10n ** 36n) / price;
    setAmount((Number(tokens) / 1e18).toFixed(6));
  }

  const cooldownLeft =
    mounted && nowSec > 0 && nextClaim && typeof nextClaim === "bigint" && nextClaim > 0n
      ? Math.max(0, Number(nextClaim) - nowSec)
      : 0;

  return (
    <section className="panel">
      <div className="card">
        <div className="burn-head">
          <div className="burn-flame" aria-hidden>
            🔥
          </div>
          <div className="bh-title">权重销毁 · 四档入场</div>
          <div className="bh-sub">选择档位燃烧 UMplan（金本位 U），按合约比例销毁与分配</div>
        </div>

        <div className="presets">
          {TIERS.map((t) => (
            <button
              key={t.u}
              type="button"
              className={selectedTier === t.u ? "preset-btn on" : "preset-btn"}
              onClick={() => pickTier(t.u)}
            >
              {t.label}
              <small>{t.sub}</small>
            </button>
          ))}
        </div>

        <div className="input-box">
          <div className="ib-label">燃烧数量（UMplan）</div>
          <div className="input-row">
            <input
              value={amount}
              onChange={(e) => {
                setSelectedTier(null);
                setAmount(e.target.value);
              }}
              inputMode="decimal"
              placeholder="0.00"
            />
            <div className="token-chip">
              <i className="tc-dot tc-um" />
              UMplan
            </div>
          </div>
        </div>

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

        <div className="split-title">
          拆账预览（金本位 U）
          <span className="contract-tag">70 / 20 / 10</span>
        </div>
        <div className="split-row">
          <div className="split-icon si-fire">🔥</div>
          <div className="split-name">
            销毁
            <span className="pct">70% · 打入销毁地址</span>
          </div>
          <div className="split-amt">{splitFire.toFixed(2)} U</div>
        </div>
        <div className="split-row">
          <div className="split-icon si-promo">◎</div>
          <div className="split-name">
            九层奖励
            <span className="pct">20% · 直推 / 间推 / 市场3…9</span>
          </div>
          <div className="split-amt">{splitMarket.toFixed(2)} U</div>
        </div>
        <div className="split-row">
          <div className="split-icon si-div">◆</div>
          <div className="split-name">
            股东分红
            <span className="pct">10% · 股东地址均分</span>
          </div>
          <div className="split-amt">{splitShare.toFixed(2)} U</div>
        </div>

        {!mounted ? (
          <p className="muted">加载中…</p>
        ) : !isConnected ? (
          <p className="banner warn">请先连接钱包</p>
        ) : !isConfigured ? (
          <p className="banner warn">合约地址未配置</p>
        ) : (
          <div className="cta-row" style={{ marginTop: "0.85rem" }}>
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
                    chainId: appChainId,
                  })
                }
              >
                {isPending || confirming ? "确认中…" : "授权"}
              </button>
            )}
            <button
              type="button"
              className="btn primary burn"
              style={{ flex: 1 }}
              disabled={isPending || confirming || needApprove || parsed === 0n}
              onClick={() =>
                writeContract({
                  address: addresses.burn,
                  abi: BurnAbi,
                  functionName: "burn",
                  args: [parsed],
                  chainId: appChainId,
                })
              }
            >
              {isPending || confirming ? "确认中…" : "确认权重销毁"}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">推广收益规则</h2>
        <div className="reward-item">
          <span className="r-l">直推</span>
          <span className="r-v" style={{ color: "var(--theme-color)" }}>
            第 1 层
          </span>
        </div>
        <div className="reward-item">
          <span className="r-l">间推</span>
          <span className="r-v" style={{ color: "var(--theme-color)" }}>
            仅第 2 层
          </span>
        </div>
        <div className="reward-item">
          <span className="r-l">市场</span>
          <span className="r-v" style={{ color: "var(--theme-color)" }}>
            第 3–9 层合计
          </span>
        </div>
        <div className="doc-text" style={{ marginTop: "0.75rem" }}>
          <p>
            燃烧额 <b>20%</b> 按九层发放：直推（L1）/ 间推（仅 L2）/ 市场总量（L3–9）。明细账本须标{" "}
            <b>市场3…市场9</b>。
          </p>
          <p>任意档燃烧且金本位 ≥100U 即视为已激活，解锁邀请链接（见「我的」）。</p>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">
          SPCXB 分红领取
          <span className="muted">24h 冷却</span>
        </h2>
        <dl className="stats">
          <div>
            <dt>可领 SPCXB</dt>
            <dd>{claimable != null ? fmtToken(claimable as bigint) : "—"}</dd>
          </div>
          <div>
            <dt>冷却</dt>
            <dd>
              {!mounted
                ? "—"
                : canClaim
                  ? "可领取"
                  : cooldownLeft > 0
                    ? `${Math.ceil(cooldownLeft / 3600)}h 后`
                    : "—"}
            </dd>
          </div>
        </dl>
        <p className="muted">每 24h 可领一次（链上强制）；也可累计不领。四档同档均分 SPCXB。</p>
        <p className="muted" style={{ marginTop: "0.35rem" }}>
          1500U 可选质押分息（EliteStake）入口待后续开放（C9），本页不做完整质押台。
        </p>
        <button
          type="button"
          className="btn primary"
          style={{ width: "100%", marginTop: "0.65rem" }}
          disabled={!mounted || !isConfigured || !isConnected || isPending || confirming || !canClaim}
          onClick={() =>
            writeContract({
              address: addresses.dividends,
              abi: DivAbi,
              functionName: "claim",
              chainId: appChainId,
            })
          }
        >
          领取分红
        </button>
      </div>

      {isSuccess && <p className="banner ok">交易已确认</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </section>
  );
}
