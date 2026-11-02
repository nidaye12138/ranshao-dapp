"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { fmtToken, parseAmount } from "@/lib/format";
import SaleAbi from "@/lib/abi/Sale.json";
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
    address: addresses.sale,
    abi: SaleAbi,
    functionName: "quoteUsdt",
    args: [usdtAmount],
    query: { enabled: isConfigured && asset === "USDT" && usdtAmount > 0n },
  });

  const { data: bnbQuote } = useReadContract({
    address: addresses.sale,
    abi: SaleAbi,
    functionName: "quoteBnb",
    args: [bnbAmount],
    query: { enabled: isConfigured && asset === "BNB" && bnbAmount > 0n },
  });

  const { data: allowance } = useReadContract({
    address: addresses.usdt,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.sale],
    query: { enabled: !!address && isConfigured && asset === "USDT" },
  });

  const quote = (asset === "USDT" ? usdtQuote : bnbQuote) as [bigint, bigint] | undefined;
  const tokenOut = quote?.[0];
  const usdAmount = quote?.[1];
  const selfReward =
    asset === "USDT"
      ? (usdtAmount * 50n) / 10_000n
      : (bnbAmount * 50n) / 10_000n;

  const needApprove = asset === "USDT" && (allowance as bigint | undefined ?? 0n) < usdtAmount;

  async function onApprove() {
    writeContract({
      address: addresses.usdt,
      abi: ERC20Abi,
      functionName: "approve",
      args: [addresses.sale, usdtAmount],
    });
  }

  async function onBuy() {
    if (asset === "USDT") {
      writeContract({
        address: addresses.sale,
        abi: SaleAbi,
        functionName: "buyWithUSDT",
        args: [usdtAmount],
      });
    } else {
      writeContract({
        address: addresses.sale,
        abi: SaleAbi,
        functionName: "buyWithBNB",
        value: bnbAmount,
      });
    }
  }

  return (
    <div className="panel">
      <h2>购买代币</h2>
      <p className="hint">支持 BNB / USDT。成交后买方即时获得支付额 0.5% 返还；直推上级获 0.5%（无上级则入金库）。</p>

      {!isConfigured && <div className="banner warn">请先配置合约地址。</div>}
      {!isConnected && <div className="banner">请先连接钱包。</div>}

      <label htmlFor="asset">支付币种</label>
      <select id="asset" value={asset} onChange={(e) => setAsset(e.target.value as PayAsset)}>
        <option value="USDT">USDT</option>
        <option value="BNB">BNB</option>
      </select>

      <label htmlFor="amt">支付数量</label>
      <input
        id="amt"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={asset === "BNB" ? "例如 0.5" : "例如 100"}
      />

      <div className="meta">
        <div>
          预估到账 RS：<strong>{fmtToken(tokenOut)}</strong>
        </div>
        <div>
          折合 USD：<strong>{fmtToken(usdAmount)}</strong>
        </div>
        <div>
          自返 0.5%：
          <strong>
            {asset === "BNB" ? `${formatEther(selfReward)} BNB` : `${fmtToken(selfReward)} USDT`}
          </strong>
        </div>
      </div>

      <div className="cta-row">
        {asset === "USDT" && (
          <button className="btn" type="button" disabled={!isConnected || !needApprove || isPending} onClick={onApprove}>
            授权 USDT
          </button>
        )}
        <button
          className="btn primary"
          type="button"
          disabled={!isConnected || !isConfigured || isPending || confirming || (asset === "USDT" && needApprove)}
          onClick={onBuy}
        >
          {isPending || confirming ? "交易处理中…" : "确认购买"}
        </button>
      </div>

      {isSuccess && <div className="banner ok">购买成功。</div>}
      {error && <div className="banner warn">{error.message}</div>}
    </div>
  );
}
