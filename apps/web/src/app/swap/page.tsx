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
import { StakeDesk } from "@/components/StakeDesk";
import { FeatureGateBanner } from "@/components/FeatureGateBanner";
import { useOnboardingOptional } from "@/components/OnboardingProvider";
import SwapAbi from "@/lib/abi/SwapFacade.json";
import ERC20Abi from "@/lib/abi/ERC20.json";

type Mode = "buy" | "sell";

const SLIP_PRESETS = [3.5, 5, 10];
const FEE_PCT = 3.5;
const FEE_FLOOR = 3;

export default function SwapPage() {
  const mounted = useMounted();
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
      <FeatureGateBanner feature="买入" />
      <div className="seg" role="tablist" aria-label="买卖切换">
        <button
          type="button"
          className={mode === "buy" ? "seg-btn on-buy" : "seg-btn"}
          onClick={() => setMode("buy")}
        >
          买入
        </button>
        <button
          type="button"
          className={mode === "sell" ? "seg-btn on-sell" : "seg-btn"}
          onClick={() => setMode("sell")}
        >
          卖出
        </button>
      </div>

      <div className={`card swap-card ${mode}`}>
        <div className="input-box">
          <div className="ib-label">{mode === "buy" ? "支付 USDT" : "卖出 UMplan"}</div>
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
              {p === 100 ? "最大" : `${p}%`}
            </button>
          ))}
        </div>

        <div className="result-box">
          <span>可得 {mode === "buy" ? "UMplan" : "USDT"}</span>
          <span className="rb-value">{outAmount != null ? fmtToken(outAmount) : "0.00"}</span>
        </div>

        <div className="fee-row">
          <span>
            交易手续费 {FEE_PCT}%（最低 {FEE_FLOOR}%）
          </span>
          <span className="fee-amt">
            −{Number.isFinite(feePreview) ? feePreview.toFixed(2) : "0.00"}{" "}
            {mode === "buy" ? "USDT" : "UMplan"}
          </span>
        </div>

        <div className="slip-row">
          <span>滑点</span>
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
          <span>
            {mode === "buy"
              ? "买入瞬间，你与你的邀请人各获得买入金额 0.5% 的奖励，立刻到账钱包。"
              : "卖出瞬间，你与你的邀请人各获得卖出金额 0.5% 的奖励，立刻到账钱包。"}
          </span>
        </div>

        <div className="info-strip gold compact">
          <span>
            买入 / 卖出手续费按协议最低 {FEE_FLOOR}%、系统默认 {FEE_PCT}% 收取，直接从交易金额中扣除，属正常交易费用，不参与权重销毁分配。
          </span>
        </div>

        {!mounted ? (
          <p className="muted">加载中…</p>
        ) : !isConnected ? (
          <p className="banner warn">请先连接钱包</p>
        ) : !featuresUnlocked ? (
          <p className="banner warn">请先完成邀请人绑定后再买入 / 卖出</p>
        ) : !isConfigured ? (
          <p className="banner warn">合约地址未配置</p>
        ) : (
          <div className="cta-row">
            {needApprove && (
              <button type="button" className="btn" disabled={isPending || confirming} onClick={onApprove}>
                授权
              </button>
            )}
            <button
              type="button"
              className={mode === "sell" ? "btn primary sell" : "btn primary"}
              style={{ flex: 1 }}
              disabled={isPending || confirming || needApprove || parsed === 0n || !featuresUnlocked}
              onClick={onSwap}
            >
              {isPending || confirming ? "确认中…" : mode === "buy" ? "确认买入" : "确认卖出"}
            </button>
          </div>
        )}

        <dl className="stats" style={{ marginTop: "1rem" }}>
          <div>
            <dt>折合 USD</dt>
            <dd>{usdAmount != null ? fmtToken(usdAmount) : "—"}</dd>
          </div>
          <div>
            <dt>自返 0.5%</dt>
            <dd>{fmtToken(selfReward)} USDT</dd>
          </div>
        </dl>

        {isSuccess && (
          <p className="banner ok">
            {mode === "buy"
              ? `买入成功，已按约 ${FEE_PCT}% 手续费口径展示，0.5% 奖励即时到账你与邀请人`
              : `卖出已提交，按约 ${FEE_PCT}% 手续费口径展示，等待链上确认`}
          </p>
        )}
        {error && <p className="banner warn">{error.message}</p>}
      </div>

      <div className="card">
        <h2 className="card-title">即时奖励说明</h2>
        <div className="doc-text">
          <p>
            <b>仅即时奖：</b>买/卖 → 交易方 0.5% + 直推邀请人 0.5%（支付币种）到钱包。
          </p>
          <p>
            <b>不做</b>累计买入业绩、级别或里程碑奖励。
          </p>
          <p>
            滑点展示预设（当前 {slippage}%）；报价为预言机固定价 MVP。手续费产品承诺{" "}
            {FEE_PCT}%（最低 {FEE_FLOOR}%）。
          </p>
        </div>
      </div>

      <StakeDesk />
    </section>
  );
}
