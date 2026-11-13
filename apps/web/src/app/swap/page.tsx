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
import {
  BOUGHT_TOPIC0,
  SOLD_TOPIC0,
  type SwapHistoryResponse,
} from "@/lib/api/swapHistory";
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
type StatusKind = "ok" | "warn" | "info";
/** Durable banner — never cleared by wagmi reset / re-tap / buy↔sell. */
type TxStatus = {
  kind: StatusKind;
  phase: "processing" | "success" | "failed";
  text: string;
  hash?: Hex;
};

const SLIP_PRESETS = [3.5, 5, 10];
const FEE_PCT = 3.5;
const FEE_FLOOR = 3;
/** If wagmi allowance never settles, fall through so CTA is not stuck on「检查授权」. */
const ALLOWANCE_SOFT_MS = 4_000;
const ALLOWANCE_HARD_MS = 8_000;

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
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  /** Prevents success effect from re-running / wiping after wagmi reset. */
  const [settledHash, setSettledHash] = useState<Hex | null>(null);
  /** Direct RPC fallback when wagmi allowance stays undefined. */
  const [payAllowanceFallback, setPayAllowanceFallback] = useState<bigint | null>(null);
  const [tokenAllowanceFallback, setTokenAllowanceFallback] = useState<bigint | null>(null);
  const [allowanceTimedOut, setAllowanceTimedOut] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const {
    isLoading: confirming,
    isSuccess,
    isError: receiptError,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash, chainId: appChainId });

  const historyUrl =
    mounted && address ? `/api/swap-history?address=${address}&_=${historyTick}` : null;
  const {
    data: history,
    loading: historyLoading,
    error: historyError,
  } = useApiGet<SwapHistoryResponse>(historyUrl, {
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
  // Fetch both allowances so switching buy↔sell does not flash a false "授权" (undefined → 0).
  const {
    data: payAllowance,
    refetch: refetchPayAllowance,
    isError: payAllowanceError,
    isFetching: payAllowanceFetching,
  } = useReadContract({
    address: paymentToken,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.swap],
    chainId: appChainId,
    query: {
      enabled: mounted && !!address && isConfigured,
      retry: 2,
      retryDelay: 1_200,
      refetchOnWindowFocus: true,
    },
  });
  const {
    data: tokenAllowance,
    refetch: refetchTokenAllowance,
    isError: tokenAllowanceError,
    isFetching: tokenAllowanceFetching,
  } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.swap],
    chainId: appChainId,
    query: {
      enabled: mounted && !!address && isConfigured,
      retry: 2,
      retryDelay: 1_200,
      refetchOnWindowFocus: true,
    },
  });

  // Direct publicClient fallback — unblocks CTA when wagmi/RPC hangs.
  useEffect(() => {
    if (!mounted || !address || !isConfigured || !publicClient) return;
    let cancelled = false;
    const soft = window.setTimeout(() => {
      void (async () => {
        try {
          const [pay, tok] = await Promise.all([
            publicClient.readContract({
              address: paymentToken,
              abi: ERC20Abi,
              functionName: "allowance",
              args: [address, addresses.swap],
            }) as Promise<bigint>,
            publicClient.readContract({
              address: addresses.token,
              abi: ERC20Abi,
              functionName: "allowance",
              args: [address, addresses.swap],
            }) as Promise<bigint>,
          ]);
          if (cancelled) return;
          setPayAllowanceFallback(pay);
          setTokenAllowanceFallback(tok);
        } catch {
          /* hard timeout below still unblocks */
        }
      })();
    }, ALLOWANCE_SOFT_MS);
    const hard = window.setTimeout(() => {
      if (!cancelled) setAllowanceTimedOut(true);
    }, ALLOWANCE_HARD_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(soft);
      window.clearTimeout(hard);
    };
  }, [mounted, address, isConfigured, publicClient, paymentToken, historyTick]);

  // Reset timeout/fallback when wallet changes.
  useEffect(() => {
    setPayAllowanceFallback(null);
    setTokenAllowanceFallback(null);
    setAllowanceTimedOut(false);
  }, [address, paymentToken]);

  const wagmiPay = payAllowance as bigint | undefined;
  const wagmiTok = tokenAllowance as bigint | undefined;
  const resolvedPay = wagmiPay ?? payAllowanceFallback ?? undefined;
  const resolvedTok = wagmiTok ?? tokenAllowanceFallback ?? undefined;
  const allowance = mode === "buy" ? resolvedPay : resolvedTok;
  const allowanceError = mode === "buy" ? payAllowanceError : tokenAllowanceError;
  const allowanceFetching = mode === "buy" ? payAllowanceFetching : tokenAllowanceFetching;

  const quote = mode === "buy" ? (buyQuote as [bigint, bigint] | undefined) : (sellQuote as [bigint, bigint] | undefined);
  const outAmount = hopMode ? hopOut : quote?.[0];
  const usdAmount = hopMode
    ? mode === "buy"
      ? parsed
      : hopOut
    : quote?.[1];
  // Buy-only instant: 0.5% UMplan to referrer/treasury. Sell has no rebate.
  const rewardBase = mode === "buy" ? (outAmount ?? 0n) : 0n;
  const selfReward = (rewardBase * 50n) / 10_000n;
  const rewardLabel = "UMplan";
  /**
   * Settled when we have a value, RPC errored, or hard-timeout.
   * On timeout/error with no value → treat as 0 so CTA becomes「授权」not forever「检查中」.
   */
  const allowanceReady =
    allowance !== undefined || allowanceError || allowanceTimedOut;
  const allowanceBi = allowance ?? 0n;
  const allowanceAssumedZero =
    allowance === undefined && (allowanceError || allowanceTimedOut);
  /** Only require approve after allowance has loaded — never treat brief loading as 0. */
  const needApprove = allowanceReady && allowanceBi < parsed;
  const feePreview = Number(amount || "0") * (FEE_PCT / 100);
  const quotePending = hopMode && parsed > 0n && hopOut == null;

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

  function showStatus(next: TxStatus) {
    setTxStatus(next);
  }

  async function onApprove() {
    // Never wipe an in-flight / settled banner via double-tap.
    if (busy) return;
    showStatus({
      kind: "info",
      phase: "processing",
      text: t("swap.waitWalletApprove"),
    });
    setSettledHash(null);
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
      showStatus({ kind: "warn", phase: "failed", text: t("swap.insufficientBal") });
      return;
    }
    if (!allowanceReady) {
      showStatus({ kind: "info", phase: "processing", text: t("swap.checkingAllowance") });
      return;
    }
    if (needApprove) {
      showStatus({ kind: "warn", phase: "failed", text: t("swap.needApproveFirst") });
      return;
    }
    if (parsed === 0n) {
      showStatus({ kind: "warn", phase: "failed", text: t("swap.enterAmount") });
      return;
    }
    if (hopMode && hopOut == null) {
      showStatus({ kind: "warn", phase: "failed", text: t("swap.quotePending") });
      return;
    }
    showStatus({
      kind: "info",
      phase: "processing",
      text: mode === "buy" ? t("swap.waitWalletBuy") : t("swap.waitWalletSell"),
    });
    setSettledHash(null);
    reset();
    setPendingAction(mode === "buy" ? "buy" : "sell");

    const fn = mode === "buy" ? "buyWithUSDT" : "sellForUSDT";
    if (publicClient && address) {
      try {
        await publicClient.simulateContract({
          address: addresses.swap,
          abi: SwapAbi,
          functionName: fn,
          args: [parsed],
          account: address,
          chain: publicClient.chain,
        });
      } catch (e) {
        setPendingAction(null);
        showStatus({ kind: "warn", phase: "failed", text: formatTxError(e, locale) });
        return;
      }
    }

    writeContract({
      address: addresses.swap,
      abi: SwapAbi,
      functionName: fn,
      args: [parsed],
      chainId: appChainId,
    });
  }

  useEffect(() => {
    if (!pendingAction) return;
    if (isPending) {
      showStatus({
        kind: "info",
        phase: "processing",
        text:
          pendingAction === "approve"
            ? t("swap.waitWalletApprove")
            : pendingAction === "buy"
              ? t("swap.waitWalletBuy")
              : t("swap.waitWalletSell"),
      });
    } else if (confirming && hash) {
      showStatus({
        kind: "info",
        phase: "processing",
        text: t("swap.confirmingOnChain"),
        hash,
      });
    }
  }, [isPending, confirming, pendingAction, hash, t]);

  useEffect(() => {
    if (!isSuccess || !pendingAction || !hash) return;
    if (settledHash && settledHash.toLowerCase() === hash.toLowerCase()) return;
    // Wait for receipt body before validating buy/sell events (isSuccess can flip first).
    if ((pendingAction === "buy" || pendingAction === "sell") && !receipt) return;

    const swapLc = addresses.swap.toLowerCase();
    const receiptLogs = receipt?.logs ?? [];
    const topic0 = (log: { topics?: readonly string[] }) =>
      (log.topics?.[0] as string | undefined)?.toLowerCase();
    const hasBought = receiptLogs.some(
      (log) => log.address.toLowerCase() === swapLc && topic0(log) === BOUGHT_TOPIC0,
    );
    const hasSold = receiptLogs.some(
      (log) => log.address.toLowerCase() === swapLc && topic0(log) === SOLD_TOPIC0,
    );

    // Don't claim buy/sell success unless the matching Swap event is in the receipt
    // (avoids「买入成功」after approve-only or a mismatched confirmation).
    if (pendingAction === "buy" && !hasBought) {
      setSettledHash(hash);
      showStatus({
        kind: "warn",
        phase: "failed",
        text: t("swap.buyMissingEvent"),
        hash,
      });
      setHistoryTick((n) => n + 1);
      return;
    }
    if (pendingAction === "sell" && !hasSold) {
      setSettledHash(hash);
      showStatus({
        kind: "warn",
        phase: "failed",
        text: t("swap.sellMissingEvent"),
        hash,
      });
      setHistoryTick((n) => n + 1);
      return;
    }

    const rewardHint = fmtToken(selfReward);
    let text =
      pendingAction === "approve"
        ? t("swap.approveOk")
        : pendingAction === "buy"
          ? t("swap.buyOkDetail", { reward: rewardHint, token: rewardLabel })
          : t("swap.sellOkDetail");

    if (receiptLogs.length) {
      try {
        for (const log of receiptLogs) {
          if (log.address.toLowerCase() !== swapLc) continue;
          if (!log.data || log.data.length < 2 + 64 * 6) continue;
          const word = (i: number) => BigInt(`0x${log.data.slice(2 + 64 * i, 2 + 64 * (i + 1))}`);
          if (pendingAction === "buy") {
            // Bought: payment, usd, quoted, delivered, buyerReward, referrerReward
            // Live facade: buyerReward often 0; referrer gets 0.5% (word 5).
            const selfRw = word(4);
            const refRw = word(5);
            const rw = selfRw > 0n ? selfRw : refRw;
            if (rw > 0n) {
              text = t("swap.buyOkDetail", {
                reward: formatUnits(rw, 18).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1"),
                token: rewardLabel,
              });
            }
          } else if (pendingAction === "sell") {
            // Sold: tokenAmount, paymentQuoted, paymentDelivered, usd, sellerReward=0, referrerReward=0
            const got = word(2);
            text = t("swap.sellOkReceived", {
              received: formatUnits(got, 18).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1"),
              token: paymentLabel,
            });
          }
        }
      } catch {
        /* keep default */
      }
    }

    setSettledHash(hash);
    showStatus({ kind: "ok", phase: "success", text, hash });
    // Keep pendingAction so a later wagmi reset cannot blank the outcome mapping.
    void refetchPayAllowance();
    void refetchTokenAllowance();
    void refetchTokenBal();
    void refetchPaymentBal();
    void queryClient.invalidateQueries();
    setHistoryTick((n) => n + 1);
  }, [
    isSuccess,
    pendingAction,
    hash,
    settledHash,
    receipt,
    selfReward,
    paymentLabel,
    rewardLabel,
    t,
    refetchPayAllowance,
    refetchTokenAllowance,
    refetchTokenBal,
    refetchPaymentBal,
    queryClient,
  ]);

  useEffect(() => {
    if (!error) return;
    showStatus({ kind: "warn", phase: "failed", text: formatTxError(error, locale) });
  }, [error, locale]);

  useEffect(() => {
    if (!receiptError || !hash) return;
    if (settledHash && settledHash.toLowerCase() === hash.toLowerCase()) return;
    showStatus({
      kind: "warn",
      phase: "failed",
      text: formatTxError(new Error("Transaction reverted on-chain"), locale),
      hash,
    });
  }, [receiptError, hash, settledHash, locale]);

  const showApproveCta = needApprove || (busy && pendingAction === "approve");
  const ctaLabel = busy
    ? isPending
      ? t("swap.waitingWallet")
      : t("common.confirming")
    : !allowanceReady
      ? t("swap.checkingAllowance")
      : showApproveCta
        ? t("common.approve")
        : mode === "buy"
          ? t("swap.confirmBuy")
          : t("swap.confirmSell");
  // Never leave CTA disabled solely because allowance is still loading after timeout —
  // allowanceReady becomes true on error/timeout (assumed 0 → 授权).
  const ctaDisabled =
    busy ||
    parsed === 0n ||
    insufficientBal ||
    (!allowanceReady && !showApproveCta) ||
    (quotePending && !needApprove);

  return (
    <section className="panel">
      <FeatureGateBanner feature="buy" />
      <div className="seg" role="tablist" aria-label={t("swap.buySellAria")}>
        <button
          type="button"
          className={mode === "buy" ? "seg-btn on-buy" : "seg-btn"}
          onClick={() => setMode("buy")}
        >
          {t("swap.buy")}
        </button>
        <button
          type="button"
          className={mode === "sell" ? "seg-btn on-sell" : "seg-btn"}
          onClick={() => setMode("sell")}
        >
          {t("swap.sell")}
        </button>
      </div>

      {txStatus && (
        <div
          className={`swap-status-overlay ${txStatus.kind}`}
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          data-phase={txStatus.phase}
          onClick={() => {
            if (txStatus.phase === "success" || txStatus.phase === "failed") setTxStatus(null);
          }}
        >
          <div
            className={`swap-status-modal ${txStatus.kind}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`swap-status-icon ${txStatus.phase}`} aria-hidden>
              {txStatus.phase === "success" ? "✓" : txStatus.phase === "failed" ? "!" : "···"}
            </div>
            <h3 className="swap-status-title">
              {txStatus.phase === "success"
                ? t("swap.statusSuccess")
                : txStatus.phase === "failed"
                  ? t("swap.statusFailed")
                  : t("swap.statusProcessing")}
            </h3>
            <p className="swap-status-body">{txStatus.text}</p>
            {txStatus.hash && (
              <p className="swap-status-link">
                <a href={`https://bscscan.com/tx/${txStatus.hash}`} target="_blank" rel="noreferrer">
                  {t("swap.viewTx")}
                </a>
              </p>
            )}
            {(txStatus.phase === "success" || txStatus.phase === "failed") && (
              <button type="button" className="btn primary swap-status-ok" onClick={() => setTxStatus(null)}>
                {t("swap.statusDismiss")}
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`card swap-card ${mode}`}>
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
            {!allowanceReady && parsed > 0n && (
              <p className="muted tip-line">{t("swap.checkingAllowance")}</p>
            )}
            {allowanceAssumedZero && parsed > 0n && (
              <p className="banner warn" style={{ marginBottom: "0.65rem" }}>
                {t("swap.allowanceCheckFailed")}
              </p>
            )}
            {needApprove && !allowanceAssumedZero && parsed > 0n && !insufficientBal && (
              <p className="banner warn" style={{ marginBottom: "0.65rem" }}>
                {t("swap.needApproveFirst")}
              </p>
            )}
            {!needApprove && allowanceReady && quotePending && (
              <p className="banner warn" style={{ marginBottom: "0.65rem" }}>
                {t("swap.quotePending")}
              </p>
            )}
            {mode === "sell" && hopOut != null && parsed > 0n && (
              <p className="muted tip-line">
                {t("swap.sellSpotHint", { amount: fmtToken(hopOut), token: paymentLabel })}
              </p>
            )}
            <div className="cta-row">
              {showApproveCta ? (
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
                  disabled={ctaDisabled}
                  onClick={onSwap}
                >
                  {ctaLabel}
                </button>
              )}
            </div>
            {!allowanceReady && parsed > 0n && (
              <button
                type="button"
                className="btn"
                style={{ width: "100%", marginTop: "0.5rem" }}
                disabled={allowanceFetching}
                onClick={() => {
                  void refetchPayAllowance();
                  void refetchTokenAllowance();
                  setAllowanceTimedOut(false);
                  setHistoryTick((n) => n + 1);
                }}
              >
                {t("swap.retryAllowance")}
              </button>
            )}
          </>
        )}

        <dl className="stats" style={{ marginTop: "1rem" }}>
          <div>
            <dt>{mode === "sell" ? t("swap.sellProceeds") : t("swap.usdEquiv")}</dt>
            <dd>{usdAmount != null ? fmtToken(usdAmount) : "—"}</dd>
          </div>
          {mode === "buy" ? (
            <div>
              <dt>{t("swap.selfRebate")}</dt>
              <dd>
                {fmtToken(selfReward)} {rewardLabel}
              </dd>
            </div>
          ) : null}
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
        ) : historyError && !history?.rows?.length ? (
          <p className="banner warn">{t("swap.historyLoadFailed")}</p>
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
                  {row.side === "BUY" ? `${t("swap.selfRebate")}: ${row.selfReward}` : row.paymentAmount}
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
