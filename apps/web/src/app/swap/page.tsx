"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, maxUint256, zeroAddress, type Hex } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { quoteUmplanToUsdt, quoteUsdtToUmplan } from "@/lib/dexQuote";
import { fmtToken, parseAmount } from "@/lib/format";
import { formatTxError } from "@/lib/txError";
import { useMounted } from "@/lib/useMounted";
import { useApiGet } from "@/lib/api/client";
import type { SwapHistoryResponse } from "@/lib/api/swapHistory";
import { FeatureGateBanner } from "@/components/FeatureGateBanner";
import { useOnboardingOptional } from "@/components/OnboardingProvider";
import { useI18n } from "@/lib/i18n";
import SwapAbi from "@/lib/abi/SwapFacade.json";
import ERC20Abi from "@/lib/abi/ERC20.json";
import { bsc } from "viem/chains";

/** One-time max allowance so later trades skip approve (ERC-20 still requires the first). */
const APPROVE_MAX = maxUint256;

type Mode = "buy" | "sell";
type PendingAction = "approve" | "buy" | "sell" | null;
type Feedback = { kind: "ok" | "warn" | "info"; text: string; hash?: Hex } | null;

const SLIP_PRESETS = [3.5, 5, 10];
const FEE_PCT = 3.5;
const FEE_FLOOR = 3;

export default function SwapPage() {
  const mounted = useMounted();
  const { t, locale } = useI18n();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: appChainId });
  const queryClient = useQueryClient();
  const gate = useOnboardingOptional();
  const featuresUnlocked = gate?.featuresUnlocked ?? true;
  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("100");
  const [slippage, setSlippage] = useState(3.5);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [hopOut, setHopOut] = useState<bigint | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const {
    isLoading: confirming,
    isSuccess,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash, chainId: appChainId });

  const historyUrl =
    mounted && address ? `/api/swap-history?address=${address}&_=${historyTick}` : null;
  const { data: history, loading: historyLoading } = useApiGet<SwapHistoryResponse>(historyUrl, {
    refetchIntervalMs: 20_000,
  });

  const parsed = useMemo(() => {
    try {
      return parseAmount(amount || "0", 18);
    } catch {
      return 0n;
    }
  }, [amount]);

  const { data: hopToken } = useReadContract({
    address: addresses.swap,
    abi: SwapAbi,
    functionName: "hopToken",
    chainId: appChainId,
    query: { enabled: isConfigured },
  });
  const { data: hopModeFlag } = useReadContract({
    address: addresses.swap,
    abi: SwapAbi,
    functionName: "hopMode",
    chainId: appChainId,
    query: { enabled: isConfigured },
  });
  /** Mainnet live deploy is USDT-hop; don't fall back to SPCXB while hopToken is still loading. */
  const hopMode =
    hopModeFlag === true ||
    (!!hopToken && (hopToken as string).toLowerCase() !== zeroAddress.toLowerCase()) ||
    (appChainId === bsc.id && hopModeFlag !== false);
  const paymentToken = hopMode ? addresses.usdt : addresses.spcxb;
  const paymentLabel = hopMode ? "USDT" : "SPCXB";

  const { data: tokenBal, refetch: refetchTokenBal } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled: mounted && !!address && isConfigured },
  });

  const { data: paymentBal, refetch: refetchPaymentBal } = useReadContract({
    address: paymentToken,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled: mounted && !!address && isConfigured },
  });

  const { data: buyQuote } = useReadContract({
    address: addresses.swap,
    abi: SwapAbi,
    functionName: "quoteUsdt",
    args: [parsed],
    chainId: appChainId,
    query: { enabled: isConfigured && !hopMode && mode === "buy" && parsed > 0n },
  });

  const { data: sellQuote } = useReadContract({
    address: addresses.swap,
    abi: SwapAbi,
    functionName: "quoteSellUsdt",
    args: [parsed],
    chainId: appChainId,
    query: { enabled: isConfigured && !hopMode && mode === "sell" && parsed > 0n },
  });

  useEffect(() => {
    if (!hopMode || !publicClient || !isConfigured || parsed <= 0n) {
      setHopOut(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const out =
          mode === "buy"
            ? await quoteUsdtToUmplan({
                client: publicClient,
                usdt: addresses.usdt,
                spcxb: addresses.spcxb,
                umplan: addresses.token,
                amountIn: parsed,
              })
            : await quoteUmplanToUsdt({
                client: publicClient,
                usdt: addresses.usdt,
                spcxb: addresses.spcxb,
                umplan: addresses.token,
                amountIn: parsed,
              });
        if (!cancelled) setHopOut(out);
      } catch {
        if (!cancelled) setHopOut(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [hopMode, publicClient, mode, parsed]);

  const spendToken = mode === "buy" ? paymentToken : addresses.token;
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: spendToken,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.swap],
    chainId: appChainId,
    query: { enabled: mounted && !!address && isConfigured },
  });

  const quote = mode === "buy" ? (buyQuote as [bigint, bigint] | undefined) : (sellQuote as [bigint, bigint] | undefined);
  const outAmount = hopMode ? hopOut : quote?.[0];
  const usdAmount = hopMode
    ? mode === "buy"
      ? parsed
      : hopOut
    : quote?.[1];
  const rewardBase = hopMode && mode === "sell" && hopOut != null ? hopOut : parsed;
  const selfReward = (rewardBase * 50n) / 10_000n;
  const allowanceBi = (allowance as bigint | undefined) ?? 0n;
  const needApprove = allowanceBi < parsed;
  const feePreview = Number(amount || "0") * (FEE_PCT / 100);

  const bal = mode === "buy" ? (paymentBal as bigint | undefined) : (tokenBal as bigint | undefined);
  const insufficientBal = bal != null && parsed > 0n && bal < parsed;
  const busy = isPending || confirming;

  function setPct(pct: number) {
    if (!bal) return;
    if (pct >= 100) setAmount(fmtRaw(bal));
    else setAmount(fmtRaw((bal * BigInt(pct)) / 100n));
  }

  function fmtRaw(v: bigint) {
    return (Number(v) / 1e18).toString();
  }

  async function onApprove() {
    if (busy) return;
    setFeedback({ kind: "info", text: t("swap.waitWalletApprove") });
    reset();
    setPendingAction("approve");
    writeContract({
      address: spendToken,
      abi: ERC20Abi,
      functionName: "approve",
      args: [addresses.swap, APPROVE_MAX],
      chainId: appChainId,
    });
  }

  async function onSwap() {
    if (busy) return;
    if (insufficientBal) {
      setFeedback({ kind: "warn", text: t("swap.insufficientBal") });
      return;
    }
    if (needApprove) {
      setFeedback({ kind: "warn", text: t("swap.needApproveFirst") });
      return;
    }
    if (parsed === 0n) {
      setFeedback({ kind: "warn", text: t("swap.enterAmount") });
      return;
    }
    setFeedback({
      kind: "info",
      text: mode === "buy" ? t("swap.waitWalletBuy") : t("swap.waitWalletSell"),
    });
    reset();
    setPendingAction(mode === "buy" ? "buy" : "sell");
    if (mode === "buy") {
      writeContract({
        address: addresses.swap,
        abi: SwapAbi,
        functionName: "buyWithUSDT",
        args: [parsed],
        chainId: appChainId,
      });
    } else {
      writeContract({
        address: addresses.swap,
        abi: SwapAbi,
        functionName: "sellForUSDT",
        args: [parsed],
        chainId: appChainId,
      });
    }
  }

  useEffect(() => {
    if (isPending && pendingAction) {
      setFeedback({
        kind: "info",
        text:
          pendingAction === "approve"
            ? t("swap.waitWalletApprove")
            : pendingAction === "buy"
              ? t("swap.waitWalletBuy")
              : t("swap.waitWalletSell"),
      });
    } else if (confirming && pendingAction && hash) {
      setFeedback({ kind: "info", text: t("swap.confirmingOnChain"), hash });
    }
  }, [isPending, confirming, pendingAction, hash, t]);

  useEffect(() => {
    if (!isSuccess || !pendingAction || !hash) return;
    const rewardHint = fmtToken(selfReward);
    let text =
      pendingAction === "approve"
        ? t("swap.approveOk")
        : pendingAction === "buy"
          ? t("swap.buyOkDetail", { reward: rewardHint, token: paymentLabel })
          : t("swap.sellOkDetail", { reward: rewardHint, token: paymentLabel });

    if (pendingAction === "buy" && receipt?.logs?.length) {
      try {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== addresses.swap.toLowerCase()) continue;
          // Bought: buyerReward is 7th non-indexed uint in data (index 4 after 4 fields? data packs 6 uints)
          // payment, usd, quoted, delivered, buyerReward, referrerReward
          if (log.data && log.data.length >= 2 + 64 * 6) {
            const buyerRewardHex = `0x${log.data.slice(2 + 64 * 4, 2 + 64 * 5)}` as Hex;
            const rw = BigInt(buyerRewardHex);
            if (rw > 0n) {
              text = t("swap.buyOkDetail", {
                reward: formatUnits(rw, 18).replace(/\.?0+$/, ""),
                token: paymentLabel,
              });
            }
          }
        }
      } catch {
        /* keep default */
      }
    }

    setFeedback({ kind: "ok", text, hash });
    void refetchAllowance();
    void refetchTokenBal();
    void refetchPaymentBal();
    void queryClient.invalidateQueries();
    setHistoryTick((n) => n + 1);
  }, [
    isSuccess,
    pendingAction,
    hash,
    receipt,
    selfReward,
    paymentLabel,
    t,
    refetchAllowance,
    refetchTokenBal,
    refetchPaymentBal,
    queryClient,
  ]);

  useEffect(() => {
    if (!error) return;
    setFeedback({ kind: "warn", text: formatTxError(error, locale) });
  }, [error, locale]);

  const ctaLabel = busy
    ? isPending
      ? t("swap.waitingWallet")
      : t("common.confirming")
    : needApprove || pendingAction === "approve"
      ? t("common.approve")
      : mode === "buy"
        ? t("swap.confirmBuy")
        : t("swap.confirmSell");

  return (
    <section className="panel">
      <FeatureGateBanner feature="buy" />
      <div className="seg" role="tablist" aria-label={t("swap.buySellAria")}>
        <button
          type="button"
          className={mode === "buy" ? "seg-btn on-buy" : "seg-btn"}
          onClick={() => {
            setMode("buy");
            setPendingAction(null);
            reset();
          }}
        >
          {t("swap.buy")}
        </button>
        <button
          type="button"
          className={mode === "sell" ? "seg-btn on-sell" : "seg-btn"}
          onClick={() => {
            setMode("sell");
            setPendingAction(null);
            reset();
          }}
        >
          {t("swap.sell")}
        </button>
      </div>

      <div className={`card swap-card ${mode}`}>
        {feedback && (
          <div className={`banner ${feedback.kind === "ok" ? "ok" : feedback.kind === "warn" ? "warn" : ""}`} role="status">
            <p style={{ margin: 0 }}>{feedback.text}</p>
            {feedback.hash && (
              <p style={{ margin: "0.35rem 0 0" }}>
                <a
                  href={`https://bscscan.com/tx/${feedback.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "inherit", textDecoration: "underline" }}
                >
                  {t("swap.viewTx")}
                </a>
              </p>
            )}
          </div>
        )}

        <div className="input-box">
          <div className="ib-label">
            {mode === "buy" ? (hopMode ? t("swap.payUsdt") : `支付 ${paymentLabel}`) : t("swap.sellUmplan")}
          </div>
          <div className="input-row">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
            <div className="token-chip">
              <i className={`tc-dot ${mode === "buy" ? "tc-usdt" : "tc-um"}`} />
              {mode === "buy" ? paymentLabel : "UMplan"}
            </div>
          </div>
        </div>

        <div className="chips">
          {[25, 50, 75, 100].map((p) => (
            <button key={p} type="button" className="chip" onClick={() => setPct(p)} disabled={!bal}>
              {p === 100 ? t("common.max") : `${p}%`}
            </button>
          ))}
        </div>

        <div className="result-box">
          <span>{t("swap.receive", { token: mode === "buy" ? "UMplan" : paymentLabel })}</span>
          <span className="rb-value">{outAmount != null ? fmtToken(outAmount) : "0.00"}</span>
        </div>

        <div className="fee-row">
          <span>{t("swap.feeRow", { fee: FEE_PCT, floor: FEE_FLOOR })}</span>
          <span className="fee-amt">
            −{Number.isFinite(feePreview) ? feePreview.toFixed(2) : "0.00"}{" "}
            {mode === "buy" ? paymentLabel : "UMplan"}
          </span>
        </div>

        <div className="slip-row">
          <span>{t("swap.slip")}</span>
          <span>
            {SLIP_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                className={slippage === s ? "preset on" : "preset"}
                onClick={() => setSlippage(s)}
              >
                {s}%
              </button>
            ))}
          </span>
        </div>

        <div className="info-strip compact">
          <span>{mode === "buy" ? t("swap.buyInstant") : t("swap.sellInstant")}</span>
        </div>

        <div className="info-strip gold compact">
          <span>{t("swap.feeNote", { fee: FEE_PCT, floor: FEE_FLOOR })}</span>
        </div>

        {!mounted ? (
          <p className="muted">{t("common.loading")}</p>
        ) : !isConnected ? (
          <p className="banner warn">{t("common.connectWalletFirst")}</p>
        ) : !featuresUnlocked ? (
          <p className="banner warn">{t("swap.bindBeforeTrade")}</p>
        ) : !isConfigured ? (
          <p className="banner warn">{t("common.contractsUnconfigured")}</p>
        ) : (
          <>
            {needApprove && parsed > 0n && !insufficientBal && (
              <p className="banner warn" style={{ marginBottom: "0.65rem" }}>
                {t("swap.needApproveFirst")}
              </p>
            )}
            <div className="cta-row">
              {needApprove || (busy && pendingAction === "approve") ? (
                <button
                  type="button"
                  className="btn primary"
                  style={{ flex: 1 }}
                  disabled={busy || parsed === 0n || insufficientBal}
                  onClick={onApprove}
                >
                  {ctaLabel}
                </button>
              ) : (
                <button
                  type="button"
                  className={mode === "sell" ? "btn primary sell" : "btn primary"}
                  style={{ flex: 1 }}
                  disabled={busy || parsed === 0n || insufficientBal}
                  onClick={onSwap}
                >
                  {ctaLabel}
                </button>
              )}
            </div>
          </>
        )}

        <dl className="stats" style={{ marginTop: "1rem" }}>
          <div>
            <dt>{t("swap.usdEquiv")}</dt>
            <dd>{usdAmount != null ? fmtToken(usdAmount) : "—"}</dd>
          </div>
          <div>
            <dt>{t("swap.selfRebate")}</dt>
            <dd>
              {fmtToken(selfReward)} {paymentLabel}
            </dd>
          </div>
        </dl>

        {insufficientBal && <p className="banner warn">{t("swap.insufficientBal")}</p>}
      </div>

      <div className="card">
        <h2 className="card-title">{t("swap.historyTitle")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {t("swap.historyNote")}
        </p>
        {!isConnected ? (
          <p className="muted">{t("common.connectWalletFirst")}</p>
        ) : historyLoading && !history ? (
          <p className="muted">{t("common.loading")}</p>
        ) : !history?.rows?.length ? (
          <p className="muted">{t("swap.historyEmpty")}</p>
        ) : (
          <ul className="ledger">
            {history.rows.map((row) => (
              <li key={row.id}>
                <span>
                  {row.side === "BUY" ? t("swap.buy") : t("swap.sell")} · {row.paymentAmount}
                </span>
                <span className="d-amt">
                  {t("swap.selfRebate")}: {row.selfReward}
                </span>
                <span className="muted">
                  <a href={row.explorerUrl} target="_blank" rel="noreferrer">
                    {row.at}
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">{t("swap.instantTitle")}</h2>
        <div className="doc-text">
          <p>
            <b>{t("swap.instantOnly")}</b>
          </p>
          <p>
            <b>{t("swap.noMilestone")}</b>
          </p>
          <p>{t("swap.slipNote", { slip: slippage, fee: FEE_PCT, floor: FEE_FLOOR })}</p>
        </div>
      </div>
    </section>
  );
}
