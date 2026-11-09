"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { fmtToken, parseAmount } from "@/lib/format";
import SwapAbi from "@/lib/abi/SwapFacade.json";
import ERC20Abi from "@/lib/abi/ERC20.json";

type PayAsset = "USDT" | "BNB";

export default function BuyPage() {
  const { address, isConnected } = useAccount();
  const [asset, setAsset] = useState<PayAsset>("USDT");
  const [amount, setAmount] = useState("100");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const usdtAmount = useMemo(() => {
    try {
      return parseAmount(amount, 18);
    } catch {
      return 0n;
    }
  }, [amount]);

  const bnbAmount = useMemo(() => {
    try {
      return parseEther(amount || "0");
    } catch {
      return 0n;
    }
  }, [amount]);

  const { data: usdtQuote } = useReadContract({
    address: addresses.swap,
    abi: SwapAbi,
    functionName: "quoteUsdt",
    args: [usdtAmount],
    query: { enabled: isConfigured && asset === "USDT" && usdtAmount > 0n },
  });

  const { data: bnbQuote } = useReadContract({
    address: addresses.swap,
    abi: SwapAbi,
    functionName: "quoteBnb",
    args: [bnbAmount],
    query: { enabled: isConfigured && asset === "BNB" && bnbAmount > 0n },
  });

  const { data: allowance } = useReadContract({
    address: addresses.usdt,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.swap],
    query: { enabled: !!address && isConfigured && asset === "USDT" },
  });

  const quote = (asset === "USDT" ? usdtQuote : bnbQuote) as [bigint, bigint] | undefined;
  const tokenOut = quote?.[0];
  const usdAmount = quote?.[1];
  const selfReward =
    asset === "USDT" ? (usdtAmount * 50n) / 10_000n : (bnbAmount * 50n) / 10_000n;

  const needApprove = asset === "USDT" && (allowance as bigint | undefined ?? 0n) < usdtAmount;

  async function onApprove() {
    writeContract({
      address: addresses.usdt,
      abi: ERC20Abi,
      functionName: "approve",
      args: [addresses.swap, usdtAmount],
    });
  }

  async function onBuy() {
    if (asset === "USDT") {
      writeContract({
        address: addresses.swap,
        abi: SwapAbi,
        functionName: "buyWithUSDT",
        args: [usdtAmount],
      });
    } else {
      writeContract({
        address: addresses.swap,
        abi: SwapAbi,
        functionName: "buyWithBNB",
        value: bnbAmount,
      });
    }
  }

  return (
    <section className="panel">
      <h1>购买 UMplan</h1>
      <p className="muted">买方即时 0.5% + 直推上级 0.5%（支付币种）。无推荐人时直推份额入 Treasury。</p>

      <div className="row gap">
        <button type="button" className={asset === "USDT" ? "btn primary" : "btn"} onClick={() => setAsset("USDT")}>
          USDT
        </button>
        <button type="button" className={asset === "BNB" ? "btn primary" : "btn"} onClick={() => setAsset("BNB")}>
          BNB
        </button>
      </div>

      <label className="field">
        <span>数量</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </label>

      <dl className="stats">
        <div>
          <dt>预估到账</dt>
          <dd>{tokenOut != null ? fmtToken(tokenOut) : "—"}</dd>
        </div>
        <div>
          <dt>折合 USD</dt>
          <dd>{usdAmount != null ? fmtToken(usdAmount) : "—"}</dd>
        </div>
        <div>
          <dt>自返 0.5%</dt>
          <dd>
            {fmtToken(selfReward)} {asset}
          </dd>
        </div>
      </dl>

      {!isConnected ? (
        <p className="banner warn">请先连接钱包</p>
      ) : !isConfigured ? (
        <p className="banner warn">合约地址未配置</p>
      ) : (
        <div className="cta-row">
          {needApprove && (
            <button type="button" className="btn" disabled={isPending || confirming} onClick={onApprove}>
              授权 USDT
            </button>
          )}
          <button type="button" className="btn primary" disabled={isPending || confirming || needApprove} onClick={onBuy}>
            {isPending || confirming ? "确认中…" : "购买"}
          </button>
        </div>
      )}

      {isSuccess && <p className="banner ok">交易已确认</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </section>
  );
}
