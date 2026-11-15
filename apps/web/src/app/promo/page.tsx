"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, maxUint256, parseUnits, type Address } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { fmtToken } from "@/lib/format";
import { inferPurchasedButtonTiers } from "@/lib/inferPurchasedTiers";
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

const OracleAbi = [
  {
    type: "function",
    name: "tokenUsd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Same ceil formula as BurnRouter.quoteTokensForTier. */
function tokensForTierUsd(tierUsd18: bigint, priceUsd18: bigint): bigint {
  if (tierUsd18 <= 0n || priceUsd18 <= 0n) return 0n;
  return (tierUsd18 * 10n ** 18n + priceUsd18 - 1n) / priceUsd18;
}

/** One-time max approve so spot moves don't leave BurnRouter allowance short. */
const APPROVE_MAX = maxUint256;

/** Spot USD-equivalent burn tiers (test cut: 1/5/8/15; was 100/500/800/1500). */
const TIERS = [
  { id: 1, u: 1, label: "1U" },
  { id: 2, u: 5, label: "5U" },
  { id: 3, u: 8, label: "8U" },
  { id: 4, u: 15, label: "15U" },
];

const POOL_META = [
  { key: "pool1" as const, tier: "1U", pct: "33.33%", tierId: 1 },
  { key: "pool2" as const, tier: "5U", pct: "25%", tierId: 2 },
  { key: "pool3" as const, tier: "8U", pct: "25%", tierId: 3 },
  { key: "pool4" as const, tier: "15U", pct: "16.67%", tierId: 4 },
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

  const enabled = mounted && isConfigured && !!address;

  const { data: tier, refetch: refetchTier } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: effectiveTierRaw, refetch: refetchEffectiveTier } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "effectiveButtonTier",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: buttonTierRaw, refetch: refetchButtonTier } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "buttonTierOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const myTier = tier != null ? Number(tier) : 0;
  const buttonTier = buttonTierRaw != null ? Number(buttonTierRaw as number) : 0;
  const effectiveTier =
    effectiveTierRaw != null
      ? Number(effectiveTierRaw as number)
      : Math.max(myTier, buttonTier);
  /** Locked for purchase (strict upgrade) — not the same as「已购」. */
  const tierAlreadyOwned = selectedTierId <= effectiveTier;
  const nextOpenTierId = effectiveTier < 4 ? effectiveTier + 1 : 0;
  const selected =
    TIERS.find((tierItem) => tierItem.id === selectedTierId) ??
    TIERS.find((tierItem) => tierItem.id === nextOpenTierId) ??
    TIERS[0];

  /** User clicked a tier chip (including locked) for split preview. */
  const userPickedTierRef = useRef(false);
  useEffect(() => {
    userPickedTierRef.current = false;
  }, [address]);

  useEffect(() => {
    if (userPickedTierRef.current) return;
    if (effectiveTierRaw == null && buttonTierRaw == null && tier == null) return;
    if (nextOpenTierId > 0) {
      setSelectedTierId(nextOpenTierId);
    } else if (effectiveTier > 0) {
      // All buttons locked (e.g. T4) — preview highest, not stuck on default 1U.
      setSelectedTierId(effectiveTier);
    }
  }, [
    address,
    buttonTierRaw,
    effectiveTier,
    effectiveTierRaw,
    nextOpenTierId,
    tier,
  ]);

  const publicClient = usePublicClient({ chainId: appChainId });
  const tierId = selected.id as 1 | 2 | 3 | 4;

  const {
    data: parsedRaw,
    isFetching: quoteFetching,
    isError: quoteReadError,
  } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "quoteTokensForTier",
    args: [tierId],
    chainId: appChainId,
    query: {
      enabled: mounted && isConfigured && tierId > 0,
      refetchInterval: 15_000,
      retry: 3,
    },
  });

  /** When wagmi multicall/RPC flakes, fill from publicClient or oracle ceil (same as BurnRouter). */
  const [fallbackParsed, setFallbackParsed] = useState<bigint | null>(null);
  const [fallbackPending, setFallbackPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const wagmiOk = parsedRaw != null && (parsedRaw as bigint) > 0n;
    if (wagmiOk || !mounted || !isConfigured || tierId < 1) {
      setFallbackParsed(null);
      setFallbackPending(false);
      return;
    }

    setFallbackPending(true);
    void (async () => {
      try {
        if (publicClient) {
          try {
            const q = (await publicClient.readContract({
              address: addresses.burn,
              abi: BurnAbi,
              functionName: "quoteTokensForTier",
              args: [tierId],
            })) as bigint;
            if (!cancelled && q > 0n) {
              setFallbackParsed(q);
              return;
            }
          } catch {
            /* oracle path */
          }

          let oracleAddr = (process.env.NEXT_PUBLIC_ORACLE_ADDRESS || "").trim() as Address;
          if (!oracleAddr.startsWith("0x") || oracleAddr.length !== 42) {
            try {
              oracleAddr = (await publicClient.readContract({
                address: addresses.burn,
                abi: BurnAbi,
                functionName: "oracle",
              })) as Address;
            } catch {
              oracleAddr = "0x" as Address;
            }
          }
          if (oracleAddr.startsWith("0x") && oracleAddr.length === 42) {
            const price = (await publicClient.readContract({
              address: oracleAddr,
              abi: OracleAbi,
              functionName: "tokenUsd",
            })) as bigint;
            const targetUsd = parseUnits(String(selected.u), 18);
            const q = tokensForTierUsd(targetUsd, price);
            if (!cancelled && q > 0n) {
              setFallbackParsed(q);
              return;
            }
          }
        }
        if (!cancelled) setFallbackParsed(0n);
      } finally {
        if (!cancelled) setFallbackPending(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [parsedRaw, mounted, isConfigured, tierId, selected.u, publicClient, quoteReadError]);

  const parsed =
    parsedRaw != null && (parsedRaw as bigint) > 0n
      ? (parsedRaw as bigint)
      : fallbackParsed != null && fallbackParsed > 0n
        ? fallbackParsed
        : 0n;
  const quotePending =
    parsed === 0n && (quoteFetching || fallbackPending || (parsedRaw == null && fallbackParsed == null));

  const { data: quoteUsd } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "quoteBurnUsd",
    args: [parsed],
    chainId: appChainId,
    query: { enabled: enabled && parsed > 0n },
  });

  const { data: myBurnedUsd } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "burnedUsd",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const purchasedButtonTiers = useMemo(() => {
    const burned =
      myBurnedUsd != null ? Number(formatUnits(myBurnedUsd as bigint, 18)) : 0;
    return inferPurchasedButtonTiers(buttonTier, burned);
  }, [buttonTier, myBurnedUsd]);

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

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.burn],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: tokenBal, refetch: refetchTokenBal } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  useEffect(() => {
    if (!isSuccess) return;
    void refetchAllowance();
    void refetchTokenBal();
    void refetchTier();
    void refetchEffectiveTier();
    void refetchButtonTier();
  }, [
    isSuccess,
    refetchAllowance,
    refetchTokenBal,
    refetchTier,
    refetchEffectiveTier,
    refetchButtonTier,
  ]);

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

  const allowanceReady = allowance !== undefined;
  const allowanceBi = (allowance as bigint | undefined) ?? 0n;
  const balBi = (tokenBal as bigint | undefined) ?? null;
  /** Max approve once → later burns skip 授权 (same UX as Swap). */
  const needApprove = allowanceReady && parsed > 0n && allowanceBi < parsed;
  const insufficientBal = balBi != null && parsed > 0n && balBi < parsed;
  const busy = isPending || confirming;
  const showApproveCta = needApprove || (busy && pendingAction === "approve");
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
          {TIERS.map((tierItem) => {
            const locked = tierItem.id <= effectiveTier;
            const purchased = purchasedButtonTiers.has(tierItem.id);
            const sub = purchased
              ? t("promo.tierOwned")
              : locked
                ? t("promo.tierSkipped")
                : tierSubs[tierItem.id];
            return (
              <button
                key={tierItem.id}
                type="button"
                className={selectedTierId === tierItem.id ? "preset-btn on" : "preset-btn"}
                aria-disabled={locked}
                title={
                  locked
                    ? purchased
                      ? t("promo.tierOwned")
                      : t("promo.tierSkipped")
                    : undefined
                }
                onClick={() => {
                  userPickedTierRef.current = true;
                  setSelectedTierId(tierItem.id);
                }}
              >
                {tierItem.label}
                <small>{sub}</small>
              </button>
            );
          })}
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
        <p className="muted tip-line">{t("promo.notStakeTip")}</p>
        <p className="muted tip-line">{t("promo.tierOnceTip")}</p>

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
          <div>
            <dt>{t("promo.walletBal")}</dt>
            <dd>{balBi != null ? `${fmtToken(balBi)} UMplan` : "—"}</dd>
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
            {effectiveTier >= 4 && <p className="banner ok">{t("promo.allTiersDone")}</p>}
            {agreed && tierAlreadyOwned && effectiveTier < 4 && (
              <p className="banner warn">{t("promo.tierUsed")}</p>
            )}
            {agreed && !tierAlreadyOwned && quotePending && (
              <p className="muted tip-line">{t("common.loading")}</p>
            )}
            {agreed && !tierAlreadyOwned && !quotePending && parsed === 0n && (
              <p className="banner warn">{t("promo.quoteFailed")}</p>
            )}
            {agreed && !tierAlreadyOwned && insufficientBal && (
              <p className="banner warn">
                {t("promo.insufficientBal", {
                  need: fmtToken(parsed),
                  have: balBi != null ? fmtToken(balBi) : "—",
                })}
              </p>
            )}
            {agreed && !tierAlreadyOwned && !allowanceReady && parsed > 0n && (
              <p className="muted tip-line">{t("promo.checkingAllowance")}</p>
            )}
            {agreed &&
              !tierAlreadyOwned &&
              needApprove &&
              parsed > 0n &&
              !insufficientBal && (
                <p className="banner warn">{t("promo.needApproveFirst")}</p>
              )}
            <div className="cta-row" style={{ marginTop: "0.75rem" }}>
              {showApproveCta ? (
                <button
                  type="button"
                  className="btn primary"
                  style={{ flex: 1 }}
                  disabled={
                    busy ||
                    !agreed ||
                    parsed === 0n ||
                    !featuresUnlocked ||
                    insufficientBal ||
                    tierAlreadyOwned
                  }
                  onClick={() => {
                    reset();
                    setPendingAction("approve");
                    writeContract({
                      address: addresses.token,
                      abi: ERC20Abi,
                      functionName: "approve",
                      args: [addresses.burn, APPROVE_MAX],
                      chainId: appChainId,
                    });
                  }}
                >
                  {busy
                    ? isPending
                      ? t("swap.waitingWallet")
                      : t("common.confirming")
                    : t("common.approve")}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn primary burn"
                  style={{ flex: 1 }}
                  disabled={
                    busy ||
                    !allowanceReady ||
                    parsed === 0n ||
                    !agreed ||
                    !featuresUnlocked ||
                    insufficientBal ||
                    tierAlreadyOwned
                  }
                  onClick={() => {
                    if (insufficientBal || tierAlreadyOwned || needApprove) return;
                    reset();
                    setPendingAction("burn");
                    writeContract({
                      address: addresses.burn,
                      abi: BurnAbi,
                      functionName: "burnTier",
                      args: [selected.id],
                      chainId: appChainId,
                    });
                  }}
                >
                  {busy
                    ? isPending
                      ? t("swap.waitingWallet")
                      : t("common.confirming")
                    : !allowanceReady
                      ? t("promo.checkingAllowance")
                      : t("promo.confirmWeight")}
                </button>
              )}
            </div>
            {error && <p className="banner warn">{formatTxError(error, locale)}</p>}
            {isSuccess && pendingAction === "approve" && (
              <p className="banner ok">{t("promo.approveOk")}</p>
            )}
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
