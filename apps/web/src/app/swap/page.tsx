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
  // Fetch both allowances so switching buy↔sell does not flash a false "授权" (undefined → 0).
  const { data: payAllowance, refetch: refetchPayAllowance } = useReadContract({
    address: paymentToken,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.swap],
    chainId: appChainId,
    query: { enabled: mounted && !!address && isConfigured },
  });
  const { data: tokenAllowance, refetch: refetchTokenAllowance } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.swap],
    chainId: appChainId,
    query: { enabled: mounted && !!address && isConfigured },
  });
  const allowance = mode === "buy" ? payAllowance : tokenAllowance;

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
  const allowanceReady = allowance !== undefined;
  const allowanceBi = (allowance as bigint | undefined) ?? 0n;
  /** Only require approve after allowance has loaded — never treat "loading" as 0 allowance. */
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

    const rewardHint = fmtToken(selfReward);
    let text =
      pendingAction === "approve"
        ? t("swap.approveOk")
        : pendingAction === "buy"
          ? t("swap.buyOkDetail", { reward: rewardHint, token: rewardLabel })
          : t("swap.sellOkDetail");

    if (receipt?.logs?.length) {
      try {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== addresses.swap.toLowerCase()) continue;
          if (!log.data || log.data.length < 2 + 64 * 6) continue;
          const word = (i: number) => BigInt(`0x${log.data.slice(2 + 64 * i, 2 + 64 * (i + 1))}`);
          if (pendingAction === "buy") {
            // Bought: payment, usd, quoted, delivered, buyerReward, referrerReward
            const rw = word(4);
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

  const ctaLabel = busy
    ? isPending
      ? t("swap.waitingWallet")
      : t("common.confirming")
    : !allowanceReady
      ? t("swap.checkingAllowance")
      : needApprove || (busy && pendingAction === "approve")
        ? t("common.approve")
        : mode === "buy"
          ? t("swap.confirmBuy")
          : t("swap.confirmSell");
  const ctaDisabled =
    busy || parsed === 0n || insufficientBal || !allowanceReady || (quotePending && !needApprove);

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

      <div className={`card swap-card ${mode}`}>
        {txStatus && (
          <div
            className={`swap-status ${txStatus.kind}`}
            role="status"
            aria-live="polite"
            data-phase={txStatus.phase}
          >
            <div className="swap-status-head">
              <span className="swap-status-phase">
                {txStatus.phase === "success"
                  ? t("swap.statusSuccess")
                  : txStatus.phase === "failed"
                    ? t("swap.statusFailed")
                    : t("swap.statusProcessing")}
              </span>
              {(txStatus.phase === "success" || txStatus.phase === "failed") && (
                <button
                  type="button"
                  className="swap-status-dismiss"
                  onClick={() => setTxStatus(null)}
                >
                  {t("swap.statusDismiss")}
                </button>
              )}
            </div>
            <p className="swap-status-body">{txStatus.text}</p>
            {txStatus.hash && (
              <p className="swap-status-link">
                <a href={`https://bscscan.com/tx/${txStatus.hash}`} target="_blank" rel="noreferrer">
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
            {!allowanceReady && parsed > 0n && (
              <p className="muted tip-line">{t("swap.checkingAllowance")}</p>
            )}
            {needApprove && parsed > 0n && !insufficientBal && (
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
              {needApprove || (busy && pendingAction === "approve") ? (
                <button
                  type="button"
                  className="btn primary"
                  style={{ flex: 1 }}
                  disabled={ctaDisabled && !(needApprove && allowanceReady)}
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
