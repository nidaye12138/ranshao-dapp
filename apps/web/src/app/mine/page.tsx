"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { fmtToken, shortAddr } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import { useEarnings, useTeam } from "@/lib/api/client";
import { FeatureGateBanner } from "@/components/FeatureGateBanner";
import { useOnboardingOptional } from "@/components/OnboardingProvider";
import ERC20Abi from "@/lib/abi/ERC20.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import TreeAbi from "@/lib/abi/ReferralTree.json";

type IncomeTab = "swap" | "layer" | "div";

export default function MinePage() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const gate = useOnboardingOptional();
  const featuresUnlocked = gate?.featuresUnlocked ?? true;
  const ready = mounted && isConfigured && !!address;
  const [inviteOrigin, setInviteOrigin] = useState("");
  const [incomeTab, setIncomeTab] = useState<IncomeTab>("swap");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInviteOrigin(window.location.origin);
  }, []);

  const { data: bnbBal } = useBalance({
    address,
    chainId: appChainId,
    query: { enabled: ready },
  });

  const { data: umplan } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled: ready },
  });
  const { data: usdt } = useReadContract({
    address: addresses.usdt,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled: ready },
  });
  const { data: spcxb } = useReadContract({
    address: addresses.spcxb,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled: ready },
  });

  const { data: activated } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "isActivated",
    args: [address!],
    chainId: appChainId,
    query: { enabled: ready },
  });

  const { data: directsOnChain } = useReadContract({
    address: addresses.registry,
    abi: TreeAbi,
    functionName: "directRefCount",
    args: [address!],
    chainId: appChainId,
    query: { enabled: ready },
  });

  const { data: team } = useTeam(mounted && address ? address : undefined);
  const { data: earnings } = useEarnings(mounted && address ? address : undefined);

  const inviteDisplay =
    mounted && address ? (inviteOrigin ? `${inviteOrigin}/?ref=${address}` : `/?ref=${address}`) : "";

  const directsDisplay =
    mounted && directsOnChain != null
      ? String(directsOnChain)
      : team?.directs != null
        ? String(team.directs)
        : "—";

  const incomeView = useMemo(() => {
    if (!earnings) return { total: "—", unit: "UMplan", rows: [] as { id: string; label: string; amount: string; at: string }[] };
    if (incomeTab === "swap") {
      return { total: earnings.swapPromoTotal ?? "—", unit: "UMplan", rows: earnings.swapPromoRows ?? [] };
    }
    if (incomeTab === "layer") {
      const layerSum = [earnings.layerTotal?.直推, earnings.layerTotal?.间推, earnings.layerTotal?.市场]
        .filter(Boolean)
        .join(" / ");
      return {
        total: layerSum || "—",
        unit: "UMplan",
        rows: earnings.layerRows ?? [],
      };
    }
    return { total: earnings.dividendTotal ?? "—", unit: "SPCXB", rows: earnings.dividendRows ?? [] };
  }, [earnings, incomeTab]);

  async function copyInvite() {
    if (!inviteDisplay || !activated) return;
    try {
      await navigator.clipboard.writeText(inviteDisplay);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="panel">
      <FeatureGateBanner feature="收益" />
      <div className="card">
        <h2 className="card-title">我的钱包</h2>
        {!mounted ? (
          <p className="muted">加载中…</p>
        ) : !isConnected ? (
          <p className="banner warn">请先连接钱包</p>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            {shortAddr(address)}
          </p>
        )}
        <div className="asset-grid">
          <div className="asset-cell">
            <div className="ac-num">{mounted && umplan != null ? fmtToken(umplan as bigint) : "—"}</div>
            <div className="ac-label">
              <i className="tc-dot tc-um" />
              UMplan
            </div>
          </div>
          <div className="asset-cell">
            <div className="ac-num">{mounted && usdt != null ? fmtToken(usdt as bigint) : "—"}</div>
            <div className="ac-label">
              <i className="tc-dot tc-usdt" />
              USDT
            </div>
          </div>
          <div className="asset-cell">
            <div className="ac-num">{mounted && spcxb != null ? fmtToken(spcxb as bigint) : "—"}</div>
            <div className="ac-label">
              <i className="tc-dot tc-spcxb" />
              SPCXB
            </div>
          </div>
          <div className="asset-cell">
            <div className="ac-num">{mounted && bnbBal ? fmtToken(bnbBal.value, bnbBal.decimals) : "—"}</div>
            <div className="ac-label">
              <i className="tc-dot tc-bnb" />
              BNB
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">我的团队</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {team?.source === "graph"
            ? "索引聚合"
            : team?.source === "unconfigured"
              ? "索引未配置（GRAPH_URL）；直推可走链上"
              : mounted && isConnected
                ? "加载中…"
                : "连接钱包后查看"}
        </p>
        <div className="team-grid">
          <div className="team-cell">
            <div className="t-num">{directsDisplay}</div>
            <div className="t-label">直推人数</div>
          </div>
          <div className="team-cell">
            <div className="t-num">{mounted && team ? String(team.indirects) : "—"}</div>
            <div className="t-label">间推人数</div>
          </div>
          <div className="team-cell">
            <div className="t-num">{mounted && team ? `$${team.buyVolumeUsd}` : "—"}</div>
            <div className="t-label">购买总量</div>
          </div>
          <div className="team-cell">
            <div className="t-num">{mounted && team ? `$${team.umbrellaUsd}` : "—"}</div>
            <div className="t-label">市场总业绩</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">推广资格</h2>
        {!mounted ? (
          <p className="muted">…</p>
        ) : activated ? (
          <>
            <div className="qual-on">已激活，可生成专属推广链接（权重档位按钮 · ≥100U）</div>
            <div className="link-row">
              <div className="link-box">{inviteDisplay}</div>
              <button type="button" className="btn primary" onClick={copyInvite}>
                {copied ? "已复制" : "复制链接"}
              </button>
              <button type="button" className="btn" disabled title="占位">
                我的二维码
              </button>
            </div>
          </>
        ) : (
          <div className="qual-off">
            需在「权重」完成任意档燃烧（最低 ≥100U，点选档位按钮）才可解锁推广资格并生成专属推广链接——不是累计买入。
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">
          我的收益
          <span className="muted">质押分红=合约 rewardToken · 档位分红=SPCXB</span>
        </h2>
        {!featuresUnlocked ? (
          <p className="banner warn">请先完成邀请人绑定后查看收益明细</p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {earnings?.source === "graph"
                ? "账本来自索引"
                : earnings?.source === "unconfigured"
                  ? "索引未配置 — 明细为空"
                  : mounted && isConnected
                    ? "加载中…"
                    : ""}
            </p>
            <div className="filters">
              <button
                type="button"
                className={incomeTab === "swap" ? "filter-btn on" : "filter-btn"}
                onClick={() => setIncomeTab("swap")}
              >
                Swap 推广奖励
              </button>
              <button
                type="button"
                className={incomeTab === "layer" ? "filter-btn on" : "filter-btn"}
                onClick={() => setIncomeTab("layer")}
              >
                层奖励
              </button>
              <button
                type="button"
                className={incomeTab === "div" ? "filter-btn on" : "filter-btn"}
                onClick={() => setIncomeTab("div")}
              >
                分红
              </button>
            </div>
            <div className="detail-total">
              <span>
                总量（{incomeView.unit}
                {incomeTab === "layer" ? " · 直推/间推/市场" : ""}）
              </span>
              <b>{incomeView.total}</b>
            </div>
            {incomeTab === "layer" && earnings?.layerTotal && (
              <p className="muted" style={{ marginBottom: "0.5rem" }}>
                直推 {earnings.layerTotal.直推 ?? "—"} / 间推 {earnings.layerTotal.间推 ?? "—"} / 市场{" "}
                {earnings.layerTotal.市场 ?? "—"}（明细须标市场3…市场9）
              </p>
            )}
            {!incomeView.rows.length ? (
              <p className="muted">暂无明细</p>
            ) : (
              <ul className="ledger">
                {incomeView.rows.map((r) => (
                  <li key={r.id}>
                    <span>{r.label}</span>
                    <span className="d-amt">{r.amount}</span>
                    <span className="muted">{r.at}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
