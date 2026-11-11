"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { fmtToken } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import { StakeDesk } from "@/components/StakeDesk";
import BurnAbi from "@/lib/abi/BurnRouter.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import ERC20Abi from "@/lib/abi/ERC20.json";

const TIERS = [
  { id: 1, u: 100, label: "100U", sub: "档位一" },
  { id: 2, u: 500, label: "500U", sub: "档位二" },
  { id: 3, u: 800, label: "800U", sub: "档位三" },
  { id: 4, u: 1500, label: "1500U", sub: "解锁质押" },
];

const POOLS = [
  { name: "分红池一 · 青铜池", tier: "100U", pct: "33.33%" },
  { name: "分红池二 · 白银池", tier: "500U", pct: "25%" },
  { name: "分红池三 · 黄金池", tier: "800U", pct: "25%" },
  { name: "分红池四 · 钻石池", tier: "1500U", pct: "16.67%" },
];

export default function PromoPage() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const [selectedTierId, setSelectedTierId] = useState<number>(1);
  const [agreed, setAgreed] = useState(false);
  const [nowSec, setNowSec] = useState(0);
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: appChainId });

  useEffect(() => {
    setNowSec(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(t);
  }, []);

  const selected = TIERS.find((t) => t.id === selectedTierId) ?? TIERS[0];
  const enabled = mounted && isConfigured && !!address;

  const { data: tokenAmount } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "quoteTokensForTier",
    args: [selectedTierId],
    chainId: appChainId,
    query: { enabled: isConfigured && selectedTierId >= 1 },
  });

  const parsed = (tokenAmount as bigint | undefined) ?? 0n;

  const { data: quoteUsd } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "quoteBurnUsd",
    args: [parsed],
    chainId: appChainId,
    query: { enabled: enabled && parsed > 0n },
  });

  const { data: tier } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: buttonTier } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "buttonTierOf",
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
  const usdPreview =
    quoteUsd != null ? Number(formatUnits(quoteUsd as bigint, 18)) : selected.u;
  const splitFire = usdPreview * 0.7;
  const splitMarket = usdPreview * 0.2;
  const splitShare = usdPreview * 0.1;

  const cooldownLeft =
    mounted && nowSec > 0 && nextClaim && typeof nextClaim === "bigint" && nextClaim > 0n
      ? Math.max(0, Number(nextClaim) - nowSec)
      : 0;

  const myTier = tier != null ? Number(tier) : 0;

  return (
    <section className="panel">
      <div className="card">
        <div className="burn-head">
          <div className="burn-flame" aria-hidden>
            🔥
          </div>
          <div className="bh-title">权重销毁 · 档位直扣</div>
          <div className="bh-sub">
            选择档位燃烧 UMplan（金本位 U），按合约约定比例自动销毁与分配。仅档位按钮计入档位权益。
          </div>
        </div>

        <div className="presets">
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={selectedTierId === t.id ? "preset-btn on" : "preset-btn"}
              onClick={() => setSelectedTierId(t.id)}
            >
              {t.label}
              <small>{t.sub}</small>
            </button>
          ))}
        </div>

        <div className="input-box">
          <div className="ib-label">燃烧数量（UMplan · 由档位按钮锁定）</div>
          <div className="input-row">
            <input
              value={parsed > 0n ? (Number(parsed) / 1e18).toFixed(6) : "—"}
              readOnly
              aria-readonly
            />
            <div className="token-chip">
              <i className="tc-dot tc-um" />
              UMplan
            </div>
          </div>
        </div>
        <p className="muted" style={{ marginTop: "-0.35rem", marginBottom: "0.75rem" }}>
          手输金额不触发档位股东 / 质押解锁；须点选上方档位按钮并确认。
        </p>

        <dl className="stats">
          <div>
            <dt>折合 U</dt>
            <dd>{quoteUsd != null ? fmtToken(quoteUsd as bigint) : `${selected.u}`}</dd>
          </div>
          <div>
            <dt>我的档位</dt>
            <dd>
              {tier != null ? `T${tier}` : "—"}
              {buttonTier != null ? ` · 按钮T${buttonTier}` : ""}
            </dd>
          </div>
        </dl>

        <div className="split-title">
          拆账预览（金本位 U）
          <span className="contract-tag">70 / 20 / 10</span>
        </div>
        <div className="split-row">
          <div className="split-icon si-fire">🔥</div>
          <div className="split-name">
            权重销毁
            <span className="pct">70% · 打入销毁地址</span>
          </div>
          <div className="split-amt">{splitFire.toFixed(2)} U</div>
        </div>
        <div className="split-row">
          <div className="split-icon si-promo">◎</div>
          <div className="split-name">
            市场奖励（九层）
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

        <label className="agree-row">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            我已阅读并同意《权重销毁协议》，确认后从钱包扣除所选档位等值 UMplan 并调用合约，需在钱包中授权签名。资金按合约约定比例销毁与分配，不可撤回。
          </span>
        </label>

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
                disabled={isPending || confirming || !agreed || parsed === 0n}
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
              disabled={isPending || confirming || needApprove || parsed === 0n || !agreed}
              onClick={() =>
                writeContract({
                  address: addresses.burn,
                  abi: BurnAbi,
                  functionName: "burnTier",
                  args: [selectedTierId],
                  chainId: appChainId,
                })
              }
            >
              {isPending || confirming ? "确认中…" : "确认权重"}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">推广收益规则</h2>
        <div className="reward-item">
          <span className="r-l">直推</span>
          <span className="r-v" style={{ color: "var(--theme-color)" }}>
            第 1 层 · 总额 4%
          </span>
        </div>
        <div className="reward-item">
          <span className="r-l">间推</span>
          <span className="r-v" style={{ color: "var(--theme-color)" }}>
            仅第 2 层 · 总额 2%
          </span>
        </div>
        <div className="reward-item">
          <span className="r-l">市场</span>
          <span className="r-v" style={{ color: "var(--theme-color)" }}>
            第 3–9 层 · 各 2% 总额
          </span>
        </div>
        <div className="doc-text" style={{ marginTop: "0.75rem" }}>
          <p>
            燃烧额 <b>20%</b> 按锁定九层发放：直推（L1=4%）/ 间推（L2=2%）/ 市场（L3–9 各
            2%）。明细账本须标 <b>市场3…市场9</b>。不做文档 8%/4%/市场1%。
          </p>
          <p>任意档位按钮燃烧（≥100U）即激活，解锁邀请链接（见「我的」）— 非累计买入。</p>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">
          SPCXB 档位分红
          <span className="muted">成为对应池的分红股东 · 24h 冷却</span>
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {myTier > 0
            ? `已达成档位 T${myTier}，成为对应池分红股东（最高档，不叠加）。`
            : "完成权重销毁档位按钮后，即成为对应分红池股东；当前尚未达成任何档位。"}
        </p>
        <div className="pool-table" role="table" aria-label="SPCXB 四池占比">
          <div className="pool-row head" role="row">
            <span>分红池</span>
            <span>档位</span>
            <span>占比</span>
          </div>
          {POOLS.map((p, i) => (
            <div
              key={p.name}
              className={myTier === i + 1 ? "pool-row on" : "pool-row"}
              role="row"
            >
              <span>
                {p.name}
                {myTier === i + 1 ? " · 生效中" : ""}
              </span>
              <span>{p.tier}</span>
              <span>{p.pct}</span>
            </div>
          ))}
        </div>
        <dl className="stats" style={{ marginTop: "0.85rem" }}>
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

      <StakeDesk />

      {isSuccess && <p className="banner ok">权重成功：已按合约比例销毁与分配</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </section>
  );
}
