"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { fmtToken, shortAddr } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import { useEarnings, useStats, useTeam } from "@/lib/api/client";
import { FeatureGateBanner } from "@/components/FeatureGateBanner";
import { useOnboardingOptional } from "@/components/OnboardingProvider";
import { localizeLayerLabel, useI18n } from "@/lib/i18n";
import ERC20Abi from "@/lib/abi/ERC20.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import TreeAbi from "@/lib/abi/ReferralTree.json";

type IncomeTab = "swap" | "layer" | "div";

export default function MinePage() {
  const mounted = useMounted();
  const { t, locale } = useI18n();
  const { address, isConnected } = useAccount();
  const gate = useOnboardingOptional();
  const featuresUnlocked = gate?.featuresUnlocked ?? true;
  const ready = mounted && isConfigured && !!address;
  const [inviteOrigin, setInviteOrigin] = useState("");
  const [incomeTab, setIncomeTab] = useState<IncomeTab>("swap");
  const [copied, setCopied] = useState(false);
  const [showQrStub, setShowQrStub] = useState(false);

  useEffect(() => {
    setInviteOrigin(window.location.origin);
  }, []);

  const { data: stats } = useStats();

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

  const { data: team, loading: teamLoading, error: teamError } = useTeam(
    mounted && address ? address : undefined,
  );
  const { data: earnings, loading: earningsLoading, error: earningsError } = useEarnings(
    mounted && address ? address : undefined,
  );

  const inviteDisplay =
    mounted && address ? (inviteOrigin ? `${inviteOrigin}/?ref=${address}` : `/?ref=${address}`) : "";

  const directsDisplay =
    mounted && directsOnChain != null
      ? String(directsOnChain)
      : team?.directs != null
        ? String(team.directs)
        : "—";

  const totalUsdtValuation = useMemo(() => {
    const price = stats?.priceUsd != null ? Number(stats.priceUsd) : NaN;
    const um = umplan != null ? Number(umplan as bigint) / 1e18 : NaN;
    const u = usdt != null ? Number(usdt as bigint) / 1e18 : NaN;
    if (!Number.isFinite(price) || !Number.isFinite(um) || !Number.isFinite(u)) return null;
    return um * price + u;
  }, [stats?.priceUsd, umplan, usdt]);

  const incomeView = useMemo(() => {
    if (!earnings) {
      return { total: "—", unit: "UMplan", rows: [] as { id: string; label: string; amount: string; at: string }[] };
    }
    if (incomeTab === "swap") {
      // Sell has no instant rebate — never show「卖出（无即时奖）」even from stale API.
      const swapRows = (earnings.swapPromoRows ?? []).filter(
        (row) => !/卖出|sell/i.test(row.label),
      );
      return {
        total: earnings.swapPromoTotal ?? "—",
        unit: "USDT",
        rows: swapRows.map((row) => ({
          ...row,
          label: localizeLayerLabel(row.label, locale),
        })),
      };
    }
    if (incomeTab === "layer") {
      const layerSum = [earnings.layerTotal?.直推, earnings.layerTotal?.间推, earnings.layerTotal?.市场]
        .filter(Boolean)
        .join(" / ");
      return {
        total: layerSum || "—",
        unit: "UMplan",
        rows: (earnings.layerRows ?? []).map((row) => ({
          ...row,
          label: localizeLayerLabel(row.label, locale),
        })),
      };
    }
    return {
      total: earnings.dividendTotal ?? "—",
      unit: "SPCXB",
      rows: earnings.dividendRows ?? [],
    };
  }, [earnings, incomeTab, locale]);

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
      <FeatureGateBanner feature="earnings" />
      <div className="card">
        <h2 className="card-title">{t("mine.walletTitle")}</h2>
        {!mounted ? (
          <p className="muted">{t("common.loading")}</p>
        ) : !isConnected ? (
          <p className="banner warn">{t("common.connectWalletFirst")}</p>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            {shortAddr(address)}
          </p>
        )}
        <div className="asset-main">
          <div className="am-sub">{t("mine.totalVal")}</div>
          <div className="am-num">
            {totalUsdtValuation != null
              ? totalUsdtValuation.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "—"}
          </div>
          <p className="am-note">{t("mine.valNote")}</p>
        </div>
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
        <h2 className="card-title">{t("mine.teamTitle")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {team?.source === "graph"
            ? t("mine.teamGraph")
            : team?.source === "unconfigured"
              ? t("mine.teamUnconfigured")
              : teamLoading && mounted && isConnected
                ? t("mine.teamLoading")
                : teamError
                  ? teamError
                  : mounted && isConnected
                    ? t("mine.teamUnconfigured")
                    : t("mine.teamConnect")}
        </p>
        <div className="team-grid">
          <div className="team-cell">
            <div className="t-num">{directsDisplay}</div>
            <div className="t-label">{t("mine.directs")}</div>
          </div>
          <div className="team-cell">
            <div className="t-num">{mounted && team ? String(team.indirects) : "—"}</div>
            <div className="t-label">{t("mine.indirects")}</div>
          </div>
          <div className="team-cell">
            <div className="t-num">{mounted && team ? `$${team.buyVolumeUsd}` : "—"}</div>
            <div className="t-label">{t("mine.buyVolume")}</div>
          </div>
          <div className="team-cell">
            <div className="t-num">{mounted && team ? `$${team.umbrellaUsd}` : "—"}</div>
            <div className="t-label">{t("mine.marketVolume")}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">{t("mine.qualTitle")}</h2>
        {!mounted ? (
          <p className="muted">…</p>
        ) : activated ? (
          <>
            <div className="qual-on">{t("mine.qualOn")}</div>
            <div className="link-row">
              <div className="link-box">{inviteDisplay}</div>
              <button type="button" className="btn primary" onClick={copyInvite}>
                {copied ? t("mine.copied") : t("mine.copy")}
              </button>
            </div>
            <div className="invite-actions">
              <button type="button" className="btn" onClick={copyInvite}>
                {copied ? t("mine.copied") : t("mine.copyLink")}
              </button>
              <button type="button" className="btn" onClick={() => setShowQrStub((v) => !v)}>
                {t("mine.myQr")}
              </button>
            </div>
            {showQrStub && (
              <div className="qr-stub" role="status">
                <div className="qr-placeholder" aria-hidden />
                <p>{t("mine.qrStub")}</p>
                <p className="muted mono">{inviteDisplay}</p>
              </div>
            )}
          </>
        ) : (
          <div className="qual-off">{t("mine.qualOff")}</div>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">
          {t("mine.incomeTitle")}
          <span className="muted">{t("mine.incomeSub")}</span>
        </h2>
        {!featuresUnlocked ? (
          <p className="banner warn">{t("mine.bindBeforeIncome")}</p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {earnings?.source === "graph" || earnings?.source === "mixed"
                ? t("mine.incomeGraph")
                : earnings?.source === "chain"
                  ? t("mine.incomeChain")
                  : earnings?.source === "unconfigured"
                    ? t("mine.incomeUnconfigured")
                    : earningsLoading && mounted && isConnected
                      ? t("common.loading")
                      : earningsError
                        ? earningsError
                        : mounted && isConnected
                          ? t("mine.incomeUnconfigured")
                          : ""}
            </p>
            <div className="filters">
              <button
                type="button"
                className={incomeTab === "swap" ? "filter-btn on" : "filter-btn"}
                onClick={() => setIncomeTab("swap")}
              >
                {t("mine.tabSwap")}
              </button>
              <button
                type="button"
                className={incomeTab === "layer" ? "filter-btn on" : "filter-btn"}
                onClick={() => setIncomeTab("layer")}
              >
                {t("mine.tabLayer")}
              </button>
              <button
                type="button"
                className={incomeTab === "div" ? "filter-btn on" : "filter-btn"}
                onClick={() => setIncomeTab("div")}
              >
                {t("mine.tabDiv")}
              </button>
            </div>
            <div className="detail-total">
              <span>
                {t("mine.totalWithUnit", {
                  unit: incomeView.unit,
                  layerHint: incomeTab === "layer" ? t("mine.layerBreakdownHint") : "",
                })}
              </span>
              <b>{incomeView.total}</b>
            </div>
            {incomeTab === "layer" && earnings?.layerTotal && (
              <p className="muted" style={{ marginBottom: "0.5rem" }}>
                {t("mine.layerLine", {
                  d: earnings.layerTotal.直推 ?? "—",
                  i: earnings.layerTotal.间推 ?? "—",
                  m: earnings.layerTotal.市场 ?? "—",
                })}
              </p>
            )}
            {!incomeView.rows.length ? (
              <p className="muted">{t("mine.noDetail")}</p>
            ) : (
              <ul className="ledger">
                {incomeView.rows.map((row) => (
                  <li key={row.id}>
                    <span>{row.label}</span>
                    <span className="d-amt">{row.amount}</span>
                    <span className="muted">{row.at}</span>
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
