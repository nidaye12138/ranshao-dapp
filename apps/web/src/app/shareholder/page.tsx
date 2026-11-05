"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { addresses, isConfigured } from "@/lib/addresses";
import { fmtToken } from "@/lib/format";
import ShareholderAbi from "@/lib/abi/Shareholder.json";

export default function ShareholderPage() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const enabled = isConfigured && !!address;

  const { data: holdings } = useReadContract({
    address: addresses.shareholder,
    abi: ShareholderAbi,
    functionName: "holdingsOf",
    args: [address!],
    query: { enabled },
  });

  const { data: directs } = useReadContract({
    address: addresses.shareholder,
    abi: ShareholderAbi,
    functionName: "directsHoldings",
    args: [address!],
    query: { enabled },
  });

  const { data: qualifies } = useReadContract({
    address: addresses.shareholder,
    abi: ShareholderAbi,
    functionName: "qualifies",
    args: [address!],
    query: { enabled },
  });

  const { data: isShareholder } = useReadContract({
    address: addresses.shareholder,
    abi: ShareholderAbi,
    functionName: "isShareholder",
    args: [address!],
    query: { enabled },
  });

  const { data: seatCount } = useReadContract({
    address: addresses.shareholder,
    abi: ShareholderAbi,
    functionName: "seatCount",
    query: { enabled: isConfigured },
  });

  const { data: minSelf } = useReadContract({
    address: addresses.shareholder,
    abi: ShareholderAbi,
    functionName: "minSelfBalance",
    query: { enabled: isConfigured },
  });

  const { data: minDirects } = useReadContract({
    address: addresses.shareholder,
    abi: ShareholderAbi,
    functionName: "minDirectsBalance",
    query: { enabled: isConfigured },
  });

  return (
    <>
      <header className="page-head">
        <h1>股东中心</h1>
        <p>
          席位上限 300。自身持仓（钱包 + 质押）≥ 50 万 UMplan，直推合计 ≥ 500 万 UMplan 可申请入座。
        </p>
      </header>
    <div className="panel">
      <h2>资格与登记</h2>
      <p className="hint">达标后一键入座；MVP 提供简单分红期次领取接口。</p>

      <div className="meta">
        <div>
          已占席位：<strong>{seatCount?.toString() ?? "—"} / 300</strong>
        </div>
        <div>
          我的有效持仓：<strong>{fmtToken(holdings as bigint | undefined)}</strong> / 门槛{" "}
          {fmtToken(minSelf as bigint | undefined)}
        </div>
        <div>
          直推合计持仓：<strong>{fmtToken(directs as bigint | undefined)}</strong> / 门槛{" "}
          {fmtToken(minDirects as bigint | undefined)}
        </div>
        <div>
          资格状态：<strong>{qualifies ? "已达标" : "未达标"}</strong>
        </div>
        <div>
          登记状态：<strong>{isShareholder ? "已是股东" : "未登记"}</strong>
        </div>
      </div>

      <button
        className="btn primary"
        type="button"
        disabled={
          !isConnected || !isConfigured || isPending || confirming || !!isShareholder || !qualifies
        }
        onClick={() =>
          writeContract({
            address: addresses.shareholder,
            abi: ShareholderAbi,
            functionName: "register",
          })
        }
      >
        {isShareholder ? "已登记" : "申请入座"}
      </button>

      {isSuccess && <div className="banner ok" style={{ marginTop: "1rem" }}>登记成功。</div>}
      {error && <div className="banner warn" style={{ marginTop: "1rem" }}>{error.message}</div>}
    </div>
    </>
  );
}
