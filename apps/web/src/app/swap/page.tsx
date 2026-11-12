"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { fmtToken, parseAmount } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import { FeatureGateBanner } from "@/components/FeatureGateBanner";
import { useOnboardingOptional } from "@/components/OnboardingProvider";
import { useI18n } from "@/lib/i18n";
import SwapAbi from "@/lib/abi/SwapFacade.json";
import ERC20Abi from "@/lib/abi/ERC20.json";

type Mode = "buy" | "sell";

const SLIP_PRESETS = [3.5, 5, 10];
const FEE_PCT = 3.5;
const FEE_FLOOR = 3;

export default function SwapPage() {
  const mounted = useMounted();
  const { t } = useI18n();
  const { address, isConnected } = useAccount();
  const gate = useOnboardingOptional();
  const featuresUnlocked = gate?.featuresUnlocked ?? true;
  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("100");
  const [slippage, setSlippage] = useState(3.5);
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: appChainId });

  const parsed = useMemo(() => {
    try {
      return parseAmount(amount || "0", 18);
    } catch {
      return 0n;
    }
  }, [amount]);

  const { data: tokenBal } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled: mounted && !!address && isConfigured },
  });

  const { data: usdtBal } = useReadContract({
    address: addresses.usdt,
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
    query: { enabled: isConfigured && mode === "buy" && parsed > 0n },
  });

  const { data: sellQuote } = useReadContract({
    address: addresses.swap,
    abi: SwapAbi,
    functionName: "quoteSellUsdt",
    args: [parsed],
    chainId: appChainId,
    query: { enabled: isConfigured && mode === "sell" && parsed > 0n },
  });

  const spendToken = mode === "buy" ? addresses.usdt : addresses.token;
  const { data: allowance } = useReadContract({
    address: spendToken,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.swap],
    chainId: appChainId,
    query: { enabled: mounted && !!address && isConfigured },
  });

  const quote = mode === "buy" ? (buyQuote as [bigint, bigint] | undefined) : (sellQuote as [bigint, bigint] | undefined);
  const outAmount = quote?.[0];
  const usdAmount = quote?.[1];
  const selfReward = (parsed * 50n) / 10_000n;
  const needApprove = (allowance as bigint | undefined ?? 0n) < parsed;
  const feePreview = Number(amount || "0") * (FEE_PCT / 100);

  const bal = mode === "buy" ? (usdtBal as bigint | undefined) : (tokenBal as bigint | undefined);

  function setPct(pct: number) {
    if (!bal) return;
    if (pct >= 100) setAmount(fmtRaw(bal));
    else setAmount(fmtRaw((bal * BigInt(pct)) / 100n));
  }

  function fmtRaw(v: bigint) {
    return (Number(v) / 1e18).toString();
  }

  async function onApprove() {
    writeContract({
      address: spendToken,
      abi: ERC20Abi,
      functionName: "approve",
      args: [addresses.swap, parsed],
      chainId: appChainId,
    });
  }

  async function onSwap() {
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
        <div className="input-box">
          <div className="ib-label">{mode === "buy" ? t("swap.payUsdt") : t("swap.sellUmplan")}</div>
          <div className="input-row">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
            <div className="token-chip">
              <i className={`tc-dot ${mode === "buy" ? "tc-usdt" : "tc-um"}`} />
              {mode === "buy" ? "USDT" : "UMplan"}
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
          <span>{t("swap.receive", { token: mode === "buy" ? "UMplan" : "USDT" })}</span>
          <span className="rb-value">{outAmount != null ? fmtToken(outAmount) : "0.00"}</span>
        </div>

        <div className="fee-row">
          <span>{t("swap.feeRow", { fee: FEE_PCT, floor: FEE_FLOOR })}</span>
          <span className="fee-amt">
            −{Number.isFinite(feePreview) ? feePreview.toFixed(2) : "0.00"}{" "}
            {mode === "buy" ? "USDT" : "UMplan"}
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
          <div className="cta-row">
            {needApprove && (
              <button type="button" className="btn" disabled={isPending || confirming} onClick={onApprove}>
                {t("common.approve")}
              </button>
            )}
            <button
              type="button"
              className={mode === "sell" ? "btn primary sell" : "btn primary"}
              style={{ flex: 1 }}
              disabled={isPending || confirming || needApprove || parsed === 0n || !featuresUnlocked}
              onClick={onSwap}
            >
              {isPending || confirming
                ? t("common.confirming")
                : mode === "buy"
                  ? t("swap.confirmBuy")
                  : t("swap.confirmSell")}
            </button>
          </div>
        )}

        <dl className="stats" style={{ marginTop: "1rem" }}>
          <div>
            <dt>{t("swap.usdEquiv")}</dt>
            <dd>{usdAmount != null ? fmtToken(usdAmount) : "—"}</dd>
          </div>
          <div>
            <dt>{t("swap.selfRebate")}</dt>
            <dd>{fmtToken(selfReward)} USDT</dd>
          </div>
        </dl>

        {isSuccess && (
          <p className="banner ok">
            {mode === "buy" ? t("swap.buyOk", { fee: FEE_PCT }) : t("swap.sellOk", { fee: FEE_PCT })}
          </p>
        )}
        {error && <p className="banner warn">{error.message}</p>}
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
