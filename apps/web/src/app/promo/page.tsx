"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { fmtToken } from "@/lib/format";
import { formatTxError } from "@/lib/txError";
import { useMounted } from "@/lib/useMounted";
import { useEarnings, useStats } from "@/lib/api/client";
import { StakeDesk } from "@/components/StakeDesk";
import { FeatureGateBanner } from "@/components/FeatureGateBanner";
import { useOnboardingOptional } from "@/components/OnboardingProvider";
import { useI18n } from "@/lib/i18n";
import BurnAbi from "@/lib/abi/BurnRouter.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import ERC20Abi from "@/lib/abi/ERC20.json";

const TIERS = [
  { id: 1, u: 100, label: "100U" },
  { id: 2, u: 500, label: "500U" },
  { id: 3, u: 800, label: "800U" },
  { id: 4, u: 1500, label: "1500U" },
];

/** Match on-chain DividendPools / Constants tier USD thresholds (1e18). */
function tierFromBurnedUsd(burnedUsd: bigint | undefined): number {
  if (burnedUsd == null) return 0;
  if (burnedUsd >= parseUnits("1500", 18)) return 4;
  if (burnedUsd >= parseUnits("800", 18)) return 3;
  if (burnedUsd >= parseUnits("500", 18)) return 2;
  if (burnedUsd >= parseUnits("100", 18)) return 1;
  return 0;
}

const POOL_META = [
  { key: "pool1" as const, tier: "100U", pct: "33.33%", tierId: 1 },
  { key: "pool2" as const, tier: "500U", pct: "25%", tierId: 2 },
  { key: "pool3" as const, tier: "800U", pct: "25%", tierId: 3 },
  { key: "pool4" as const, tier: "1500U", pct: "16.67%", tierId: 4 },
];

export default function PromoPage() {
  const mounted = useMounted();
  const { t, locale } = useI18n();
  const { address, isConnected } = useAccount();
  const gate = useOnboardingOptional();
  const featuresUnlocked = gate?.featuresUnlocked ?? true;
  const [selectedTierId, setSelectedTierId] = useState<number>(1);
  const [agreed, setAgreed] = useState(false);
  const [nowSec, setNowSec] = useState(0);
  const [pendingAction, setPendingAction] = useState<"approve" | "burn" | null>(null);
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: appChainId });
  const { data: stats } = useStats();
  const { data: earnings } = useEarnings(address);

  useEffect(() => {
    setNowSec(Math.floor(Date.now() / 1000));
    const timer = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(timer);
  }, []);

  const selected = TIERS.find((tier) => tier.id === selectedTierId) ?? TIERS[0];
  const enabled = mounted && isConfigured && !!address;

  // Deployed BurnRouter only has burn(uint256) + quoteBurnUsd — no burnTier helpers.
  const { data: oneTokenUsd } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "quoteBurnUsd",
    args: [parseUnits("1", 18)],
    chainId: appChainId,
    query: { enabled: isConfigured },
  });

  const parsed =
    oneTokenUsd != null && (oneTokenUsd as bigint) > 0n
      ? (BigInt(selected.u) * parseUnits("1", 18) * parseUnits("1", 18)) / (oneTokenUsd as bigint)
      : 0n;

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

  const { data: myBurnedUsd } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "burnedUsd",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const buttonTier = tierFromBurnedUsd(myBurnedUsd as bigint | undefined);

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
  const splitFire = usdPreview * 0.3;
  const splitMarket = usdPreview * 0.5;
  const splitShare = usdPreview * 0.15;
  const splitPrecip = usdPreview * 0.05;
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
    myBurnedUsd != null ? `${fmtToken(myBurnedUsd as bigint)} U` : "—";

  const tierSubs: Record<number, string> = {
    1: t("promo.tier1"),
    2: t("promo.tier2"),
    3: t("promo.tier3"),
    4: t("promo.tier4"),
  };

  return (
    <section className="panel">
      <FeatureGateBanner feature="weight" />
      <div className="card burn-card">
        <div className="burn-head">
          <div className="burn-flame" aria-hidden>
            🔥
          </div>
          <div className="bh-title">{t("promo.burnTitle")}</div>
          <div className="bh-sub">{t("promo.burnSub")}</div>
        </div>

        <div className="presets">
          {TIERS.map((tierItem) => (
            <button
              key={tierItem.id}
              type="button"
              className={selectedTierId === tierItem.id ? "preset-btn on" : "preset-btn"}
              onClick={() => setSelectedTierId(tierItem.id)}
            >
              {tierItem.label}
              <small>{tierSubs[tierItem.id]}</small>
            </button>
          ))}
        </div>

        <div className="input-box tight">
          <div className="ib-label">{t("promo.amountLabel")}</div>
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
        <p className="muted tip-line">{t("promo.tipManual")}</p>

        <dl className="stats compact-stats">
          <div>
            <dt>{t("promo.usdEquiv")}</dt>
            <dd>{quoteUsd != null ? fmtToken(quoteUsd as bigint) : `${selected.u}`}</dd>
          </div>
          <div>
            <dt>{t("promo.myTier")}</dt>
            <dd>
              {tier != null ? `T${tier}` : "—"}
              {buttonTier > 0 ? ` · ${t("promo.buttonTier", { n: String(buttonTier) })}` : ""}
            </dd>
          </div>
        </dl>

        <div className="split-title">
          {t("promo.splitTitle")}
          <span className="contract-tag">{t("promo.contractTag")}</span>
        </div>
        <div className="split-row">
          <div className="split-icon si-fire">🔥</div>
          <div className="split-name">
            {t("promo.splitBurn")}
            <span className="pct">{t("promo.splitBurnPct")}</span>
          </div>
          <div className="split-amt">{splitFire.toFixed(2)} U</div>
        </div>
        <div className="split-row">
          <div className="split-icon si-promo">◎</div>
          <div className="split-name">
            {t("promo.splitMarket")}
            <span className="pct">{t("promo.splitMarketPct")}</span>
          </div>
          <div className="split-amt">{splitMarket.toFixed(2)} U</div>
        </div>
        <div className="split-row">
          <div className="split-icon si-div">◆</div>
          <div className="split-name">
            {t("promo.splitShare")}
            <span className="pct">{t("promo.splitSharePct")}</span>
          </div>
          <div className="split-amt">{splitShare.toFixed(2)} U</div>
        </div>
        <div className="split-row">
          <div className="split-icon si-promo">◇</div>
          <div className="split-name">
            {t("promo.splitPrecip")}
            <span className="pct">{t("promo.splitPrecipPct")}</span>
          </div>
          <div className="split-amt">{splitPrecip.toFixed(2)} U</div>
        </div>

        <label className="agree-row">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>{t("promo.agree")}</span>
        </label>

        {!mounted ? (
          <p className="muted">{t("common.loading")}</p>
        ) : !isConnected ? (
          <p className="banner warn">{t("common.connectWalletFirst")}</p>
        ) : !featuresUnlocked ? (
          <p className="banner warn">{t("promo.bindBeforeBurn")}</p>
        ) : !isConfigured ? (
          <p className="banner warn">{t("common.contractsUnconfigured")}</p>
        ) : (
          <>
            {!agreed && <p className="muted tip-line">{t("promo.needAgree")}</p>}
            {agreed && parsed === 0n && <p className="banner warn">{t("promo.quoteFailed")}</p>}
            {agreed && parsed > 0n && needApprove && (
              <p className="muted tip-line">{t("promo.needApproveFirst")}</p>
            )}
            <div className="cta-row" style={{ marginTop: "0.75rem" }}>
              {needApprove && (
                <button
                  type="button"
                  className="btn"
                  disabled={isPending || confirming || !agreed || parsed === 0n || !featuresUnlocked}
                  onClick={() => {
                    reset();
                    setPendingAction("approve");
                    writeContract({
                      address: addresses.token,
                      abi: ERC20Abi,
                      functionName: "approve",
                      args: [addresses.burn, parsed],
                      chainId: appChainId,
                    });
                  }}
                >
                  {isPending || confirming
                    ? pendingAction === "approve"
                      ? t("common.confirming")
                      : t("common.approve")
                    : t("common.approve")}
                </button>
              )}
              <button
                type="button"
                className="btn primary burn"
                style={{ flex: 1 }}
                disabled={
                  isPending || confirming || needApprove || parsed === 0n || !agreed || !featuresUnlocked
                }
                onClick={() => {
                  reset();
                  setPendingAction("burn");
                  writeContract({
                    address: addresses.burn,
                    abi: BurnAbi,
                    functionName: "burn",
                    args: [parsed],
                    chainId: appChainId,
                  });
                }}
              >
                {isPending || confirming
                  ? pendingAction === "burn"
                    ? t("common.confirming")
                    : t("promo.confirmWeight")
                  : t("promo.confirmWeight")}
              </button>
            </div>
            {error && <p className="banner warn">{formatTxError(error, locale)}</p>}
            {isSuccess && pendingAction === "burn" && (
              <p className="banner ok">{t("promo.success")}</p>
            )}
          </>
        )}
      </div>

      <div className="card weight-summary">
        <h2 className="card-title accent">{t("promo.dataTitle")}</h2>
        <div className="ws-row">
          <span>{t("promo.globalBurned")}</span>
          <b className="ws-fire">{burnedGlobal}</b>
        </div>
        <div className="ws-row">
          <span>{t("promo.myWeight")}</span>
          <b className="ws-fire">{myWeight}</b>
        </div>
        <ul className="ws-notes">
          <li>{t("promo.noteSplit")}</li>
          <li>{t("promo.noteFee")}</li>
          <li>{t("promo.notePublic")}</li>
        </ul>
      </div>

      <div className="card">
        <h2 className="card-title accent">{t("promo.earningsTitle")}</h2>
        <div className="reward-item">
          <span className="r-l">{t("promo.directReward")}</span>
          <span className="r-v earn-amt">{layerDirect}</span>
        </div>
        <div className="reward-item">
          <span className="r-l">{t("promo.indirectReward")}</span>
          <span className="r-v earn-amt">{layerIndirect}</span>
        </div>
        <div className="reward-item">
          <span className="r-l">{t("promo.marketReward")}</span>
          <span className="r-v earn-amt">{layerMarket}</span>
        </div>
        <div className="doc-text" style={{ marginTop: "0.75rem" }}>
          <p>{t("promo.earnAsset")}</p>
          <p>{t("promo.earnDirect")}</p>
          <p>{t("promo.earnIndirect")}</p>
          <p>{t("promo.earnMarket")}</p>
          <p>{t("promo.earnActivate")}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">
          {t("promo.poolsTitle")}
          <span className="muted">{t("promo.poolsSub")}</span>
        </h2>
        <p className={myTier > 0 ? "pool-status open" : "pool-status locked"}>
          {myTier > 0 ? t("promo.poolOpen", { n: myTier }) : t("promo.poolLocked")}
        </p>
        <p className="muted pool-caption">{t("promo.poolCaption")}</p>
        <div className="pool-table pool-table-rich" role="table" aria-label="SPCXB">
          <div className="pool-row head" role="row">
            <span>{t("promo.poolCol")}</span>
            <span>{t("promo.membersCol")}</span>
            <span>{t("promo.pctCol")}</span>
          </div>
          {POOL_META.map((pool, i) => {
            const count = memberCounts[i];
            const name = t(`promo.${pool.key}`);
            return (
              <div
                key={pool.key}
                className={myTier === pool.tierId ? "pool-row on" : "pool-row"}
                role="row"
              >
                <span className="pool-main">
                  <strong>
                    {name}
                    {myTier === pool.tierId ? t("promo.poolActive") : ""}
                  </strong>
                  <small>{t("promo.poolTierSmall", { tier: pool.tier })}</small>
                </span>
                <span>{count != null ? count.toLocaleString("en-US") : "—"}</span>
                <span>{pool.pct}</span>
              </div>
            );
          })}
        </div>
        <div className="my-div-box">
          <span>{t("promo.myClaimable")}</span>
          <b>{claimable != null ? `${fmtToken(claimable as bigint)} SPCXB` : "0 SPCXB"}</b>
        </div>
        <dl className="stats" style={{ marginTop: "0.85rem" }}>
          <div>
            <dt>{t("promo.cooldown")}</dt>
            <dd>
              {!mounted
                ? "—"
                : canClaim
                  ? t("promo.claimableNow")
                  : cooldownLeft > 0
                    ? t("promo.hoursLater", { h: Math.ceil(cooldownLeft / 3600) })
                    : "—"}
            </dd>
          </div>
          <div>
            <dt>{t("promo.rule")}</dt>
            <dd>{t("promo.perDay")}</dd>
          </div>
        </dl>
        <div className="doc-text" style={{ marginTop: "0.75rem" }}>
          <p>{t("promo.poolPctDoc")}</p>
          <p>{t("promo.poolShareDoc")}</p>
          <p>{t("promo.poolFairDoc")}</p>
          <p>{t("promo.poolClaimDoc")}</p>
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
          {t("promo.claimDiv")}
        </button>
      </div>

      <StakeDesk />

      {isSuccess && <p className="banner ok">{t("promo.success")}</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </section>
  );
}
