"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { addresses, isConfigured } from "@/lib/addresses";
import { fmtToken, parseAmount } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import SwapAbi from "@/lib/abi/SwapFacade.json";
import ERC20Abi from "@/lib/abi/ERC20.json";

type Mode = "buy" | "sell";

export default function SwapPage() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("100");
  const [slippage, setSlippage] = useState("1");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

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
    query: { enabled: mounted && !!address && isConfigured },
  });

  const { data: usdtBal } = useReadContract({
    address: addresses.usdt,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: mounted && !!address && isConfigured },
  });

  const { data: buyQuote } = useReadContract({
    address: addresses.swap,
    abi: SwapAbi,
    functionName: "quoteUsdt",
    args: [parsed],
    query: { enabled: isConfigured && mode === "buy" && parsed > 0n },
  });

  const { data: sellQuote } = useReadContract({
    address: addresses.swap,
    abi: SwapAbi,
    functionName: "quoteSellUsdt",
    args: [parsed],
    query: { enabled: isConfigured && mode === "sell" && parsed > 0n },
  });

  const spendToken = mode === "buy" ? addresses.usdt : addresses.token;
  const { data: allowance } = useReadContract({
    address: spendToken,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.swap],
    query: { enabled: mounted && !!address && isConfigured },
  });

  const quote = mode === "buy" ? (buyQuote as [bigint, bigint] | undefined) : (sellQuote as [bigint, bigint] | undefined);
  const outAmount = quote?.[0];
  const usdAmount = quote?.[1];
  const selfReward = (parsed * 50n) / 10_000n;
  const needApprove = (allowance as bigint | undefined ?? 0n) < parsed;

  const bal = mode === "buy" ? (usdtBal as bigint | undefined) : (tokenBal as bigint | undefined);

  function setPct(pct: number) {
    if (!bal) return;
    if (pct >= 100) setAmount(fmtRaw(bal));
    else setAmount(fmtRaw((bal * BigInt(pct)) / 100n));
  }

  function fmtRaw(v: bigint) {
    const s = (Number(v) / 1e18).toString();
    return s;
  }

  async function onApprove() {
    writeContract({
      address: spendToken,
      abi: ERC20Abi,
      functionName: "approve",
      args: [addresses.swap, parsed],
    });
  }

  async function onSwap() {
    if (mode === "buy") {
      writeContract({
        address: addresses.swap,
        abi: SwapAbi,
        functionName: "buyWithUSDT",
        args: [parsed],
      });
    } else {
      writeContract({
        address: addresses.swap,
        abi: SwapAbi,
        functionName: "sellForUSDT",
        args: [parsed],
      });
    }
  }

  return (
    <section className="panel">
      <h1>Swap</h1>
      <p className="muted">买/卖即时 0.5% 自返 + 0.5% 直推（支付币种）。无买入业绩级别。</p>

      <div className="row gap">
        <button type="button" className={mode === "buy" ? "btn primary" : "btn"} onClick={() => setMode("buy")}>
          Buy
        </button>
        <button type="button" className={mode === "sell" ? "btn primary" : "btn"} onClick={() => setMode("sell")}>
          Sell
        </button>
      </div>

      <label className="field">
        <span>{mode === "buy" ? "支付 USDT" : "卖出 UMplan"}</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </label>

      <div className="pct-row">
        {[25, 50, 75, 100].map((p) => (
          <button key={p} type="button" className="btn ghost" onClick={() => setPct(p)} disabled={!bal}>
            {p === 100 ? "Max" : `${p}%`}
          </button>
        ))}
      </div>

      <label className="field">
        <span>滑点容忍 (%)</span>
        <input value={slippage} onChange={(e) => setSlippage(e.target.value)} inputMode="decimal" />
      </label>
      <p className="muted">报价为预言机固定价 MVP；滑点字段预留校验，上线池化后再强制。</p>

      <dl className="stats">
        <div>
          <dt>{mode === "buy" ? "预估到账" : "预估 USDT"}</dt>
          <dd>{outAmount != null ? fmtToken(outAmount) : "—"}</dd>
        </div>
        <div>
          <dt>折合 USD</dt>
          <dd>{usdAmount != null ? fmtToken(usdAmount) : "—"}</dd>
        </div>
        <div>
          <dt>自返 0.5%</dt>
          <dd>
            {fmtToken(selfReward)} {mode === "buy" ? "USDT" : "USDT"}
          </dd>
        </div>
      </dl>

      <div className="rules-box">
        <p>即时奖励：买方/卖方 0.5% + 直推上级 0.5% 到钱包；无推荐人则直推份额入 Treasury。</p>
        <p>不做累计买入业绩 / 里程碑。</p>
      </div>

      {!mounted ? (
        <p className="muted">加载中…</p>
      ) : !isConnected ? (
        <p className="banner warn">请先连接钱包</p>
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
            className="btn primary"
            disabled={isPending || confirming || needApprove || parsed === 0n}
            onClick={onSwap}
          >
            {isPending || confirming ? "确认中…" : mode === "buy" ? "买入" : "卖出"}
          </button>
        </div>
      )}

      {isSuccess && <p className="banner ok">交易已确认</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </section>
  );
}
