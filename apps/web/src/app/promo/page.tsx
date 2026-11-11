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
import { useEarnings, useStats } from "@/lib/api/client";
import { StakeDesk } from "@/components/StakeDesk";
import { FeatureGateBanner } from "@/components/FeatureGateBanner";
import { useOnboardingOptional } from "@/components/OnboardingProvider";
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
  { name: "分红池一 · 青铜池", tier: "100U", pct: "33.33%", tierId: 1 },
  { name: "分红池二 · 白银池", tier: "500U", pct: "25%", tierId: 2 },
  { name: "分红池三 · 黄金池", tier: "800U", pct: "25%", tierId: 3 },
  { name: "分红池四 · 钻石池", tier: "1500U", pct: "16.67%", tierId: 4 },
];

export default function PromoPage() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const gate = useOnboardingOptional();
  const featuresUnlocked = gate?.featuresUnlocked ?? true;
  const [selectedTierId, setSelectedTierId] = useState<number>(1);
  const [agreed, setAgreed] = useState(false);
  const [nowSec, setNowSec] = useState(0);
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: appChainId });
  const { data: stats } = useStats();
  const { data: earnings } = useEarnings(address);

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

  const { data: myBurnedUsd } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "burnedUsd",
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

  const { data: m1 } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierMemberCount",
    args: [1],
    chainId: appChainId,
    query: { enabled: mounted && isConfigured },
  });
  const { data: m2 } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierMemberCount",
    args: [2],
    chainId: appChainId,
    query: { enabled: mounted && isConfigured },
  });
  const { data: m3 } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierMemberCount",
    args: [3],
    chainId: appChainId,
    query: { enabled: mounted && isConfigured },
  });
  const { data: m4 } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierMemberCount",
    args: [4],
    chainId: appChainId,
    query: { enabled: mounted && isConfigured },
  });

  const memberCounts = [m1, m2, m3, m4].map((m) => (m != null ? Number(m as bigint) : null));

  const needApprove = (allowance as bigint | undefined ?? 0n) < parsed;
  const usdPreview =
    quoteUsd != null ? Number(formatUnits(quoteUsd as bigint, 18)) : selected.u;
  // 70% sink / 20% market-reward bucket / 10% shareholders.
  const splitFire = usdPreview * 0.7;
  const splitMarket = usdPreview * 0.2;
  const splitShare = usdPreview * 0.1;
  const fmtEarn = (v?: string) => {
    const raw = (v ?? "0 UMplan").trim();
    return raw.startsWith("+") ? raw : `+${raw}`;
  };
  const layerDirect = fmtEarn(earnings?.layerTotal?.直推);
  const layerIndirect = fmtEarn(earnings?.layerTotal?.间推);
  const layerMarket = fmtEarn(earnings?.layerTotal?.市场);

  const cooldownLeft =
    mounted && nowSec > 0 && nextClaim && typeof nextClaim === "bigint" && nextClaim > 0n
      ? Math.max(0, Number(nextClaim) - nowSec)
      : 0;

  const myTier = tier != null ? Number(tier) : 0;
  const burnedGlobal =
    stats?.totalBurnedToken != null ? `${stats.totalBurnedToken} UMplan` : "—";
  const myWeight =
    myBurnedUsd != null ? `${fmtToken(myBurnedUsd as bigint)} U` : mounted && isConnected ? "—" : "—";

  return (
    <section className="panel">
      <FeatureGateBanner feature="权重" />
      <div className="card burn-card">
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

        <div className="input-box tight">
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
        <p className="muted tip-line">
          手输金额不触发档位股东 / 质押解锁；须点选上方档位按钮并确认。
        </p>

        <dl className="stats compact-stats">
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
          扣除后资金分配预览
          <span className="contract-tag">比例以合约参数为准</span>
        </div>
        <div className="split-row">
          <div className="split-icon si-fire">🔥</div>
          <div className="split-name">
            权重销毁
            <span className="pct">70% · 打入销毁地址，永久移出流通</span>
          </div>
          <div className="split-amt">{splitFire.toFixed(2)} U</div>
        </div>
        <div className="split-row">
          <div className="split-icon si-promo">◎</div>
          <div className="split-name">
            市场奖励
            <span className="pct">20% · 桶内再分直推 / 间推 / 市场</span>
          </div>
          <div className="split-amt">{splitMarket.toFixed(2)} U</div>
        </div>
        <div className="split-row">
          <div className="split-icon si-div">◆</div>
          <div className="split-name">
            股东分红
            <span className="pct">10% · 股东池（与 SPCXB 四档分红分属不同模块）</span>
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
        ) : !featuresUnlocked ? (
          <p className="banner warn">请先完成邀请人绑定后再进行权重销毁</p>
        ) : !isConfigured ? (
          <p className="banner warn">合约地址未配置</p>
        ) : (
          <div className="cta-row" style={{ marginTop: "0.75rem" }}>
            {needApprove && (
              <button
                type="button"
                className="btn"
                disabled={isPending || confirming || !agreed || parsed === 0n || !featuresUnlocked}
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
              disabled={
                isPending || confirming || needApprove || parsed === 0n || !agreed || !featuresUnlocked
              }
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

      <div className="card weight-summary">
        <h2 className="card-title accent">权重数据</h2>
        <div className="ws-row">
          <span>全网累计已销毁</span>
          <b className="ws-fire">{burnedGlobal}</b>
        </div>
        <div className="ws-row">
          <span>我的累计权重</span>
          <b className="ws-fire">{myWeight}</b>
        </div>
        <ul className="ws-notes">
          <li>权重订单资金按 70% 销毁 / 20% 市场奖励 / 10% 股东自动执行。</li>
          <li>买卖手续费（最低 3%、默认 3.5%）属交易费用，不计入权重销毁。</li>
          <li>销毁地址链上公开可查。</li>
        </ul>
      </div>

      <div className="card">
        <h2 className="card-title accent">推广收益</h2>
        <div className="reward-item">
          <span className="r-l">直推奖励</span>
          <span className="r-v earn-amt">{layerDirect}</span>
        </div>
        <div className="reward-item">
          <span className="r-l">间推奖励</span>
          <span className="r-v earn-amt">{layerIndirect}</span>
        </div>
        <div className="reward-item">
          <span className="r-l">市场奖励</span>
          <span className="r-v earn-amt">{layerMarket}</span>
        </div>
        <div className="doc-text" style={{ marginTop: "0.75rem" }}>
          <p>币种：推广类奖励均以 UMplan 代币发放，即时到账钱包（汇总来自索引；未配置时显示 0）。</p>
          <p>
            直推：直推成员每笔买入 / 权重进单时，从市场奖励桶（占订单 20%）中按桶内{" "}
            <b>20%</b> 即时奖励给你。
          </p>
          <p>
            间推：间推成员（即直推成员的直推）进单时，从市场奖励桶中按桶内 <b>10%</b>{" "}
            奖励给你。
          </p>
          <p>
            市场：直推、间推以外的团队成员统称市场；市场业绩达到档位，额外享受市场奖励桶内{" "}
            <b>10%</b> 管理奖励口径。
          </p>
          <p>任意档位按钮燃烧（≥100U）即激活，解锁邀请链接（见「我的」）— 非累计买入。</p>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">
          SPCXB 档位分红
          <span className="muted">成为对应池的分红股东 · 24h 冷却</span>
        </h2>
        <p className={myTier > 0 ? "pool-status open" : "pool-status locked"}>
          {myTier > 0
            ? `已达成档位 T${myTier}，成为对应池分红股东（最高档，不叠加）。`
            : "完成权重销毁后，即成为对应分红池的分红股东，按该池占比与同池人数分配 SPCXB；当前尚未达成任何档位。"}
        </p>
        <p className="muted pool-caption">四池合计 100% · 人数来自链上；人均待释放量索引后填入</p>
        <div className="pool-table pool-table-rich" role="table" aria-label="SPCXB 四池占比">
          <div className="pool-row head" role="row">
            <span>分红池</span>
            <span>人数</span>
            <span>占比</span>
          </div>
          {POOLS.map((p, i) => {
            const count = memberCounts[i];
            return (
              <div
                key={p.name}
                className={myTier === p.tierId ? "pool-row on" : "pool-row"}
                role="row"
              >
                <span className="pool-main">
                  <strong>
                    {p.name}
                    {myTier === p.tierId ? " · 生效中" : ""}
                  </strong>
                  <small>
                    {p.tier} 档 · 人均 —
                  </small>
                </span>
                <span>{count != null ? count.toLocaleString("en-US") : "—"}</span>
                <span>{p.pct}</span>
              </div>
            );
          })}
        </div>
        <div className="my-div-box">
          <span>我的 SPCXB 可领</span>
          <b>{claimable != null ? `${fmtToken(claimable as bigint)} SPCXB` : "0 SPCXB"}</b>
        </div>
        <dl className="stats" style={{ marginTop: "0.85rem" }}>
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
          <div>
            <dt>规则</dt>
            <dd>24h / 次</dd>
          </div>
        </dl>
        <div className="doc-text" style={{ marginTop: "0.75rem" }}>
          <p>
            池占比：四个分红池合计分配总释放的 100% —— 100U 档池占 33.33%，500U 档池与 800U
            档池各占 25%，1500U 档池占 16.67%。
          </p>
          <p>
            个人实得：你所在池的占比额度 ÷ 同池股东人数。达成哪档权重销毁，就成为哪档池的分红股东，仅计入最高已达档位，不叠加。
          </p>
          <p>
            公平性体现：能分多少不只看你在哪个池，更看和你同池的人有多少。青铜池占比最高（33.33%），但门槛最低、可能有几百甚至几千人一起平分，人均反而少；钻石池占比最低（16.67%），但门槛高、同池可能只有几个人，人均反而拿得更多。门槛与人数天然对冲，各档实际收益趋于均衡。
          </p>
          <p>
            24 小时可领取一次 SPCXB，不领取自动叠加计入下期；同池人数每日随达成情况变动，人均随之实时重算。
          </p>
        </div>
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
