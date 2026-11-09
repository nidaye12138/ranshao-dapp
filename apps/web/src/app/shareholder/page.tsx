"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { addresses, isConfigured } from "@/lib/addresses";
import { fmtToken } from "@/lib/format";
import ShAbi from "@/lib/abi/ShareholderPool.json";

export default function ShareholderPage() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const enabled = isConfigured && !!address;

  const { data: isShareholder } = useReadContract({
    address: addresses.shareholders,
    abi: ShAbi,
    functionName: "isShareholder",
    args: [address!],
    query: { enabled },
  });

  const { data: seatCount } = useReadContract({
    address: addresses.shareholders,
    abi: ShAbi,
    functionName: "seatCount",
    query: { enabled: isConfigured },
  });

  const { data: claimable } = useReadContract({
    address: addresses.shareholders,
    abi: ShAbi,
    functionName: "claimable",
    args: [address!],
    query: { enabled },
  });

  const { data: seatIndex } = useReadContract({
    address: addresses.shareholders,
    abi: ShAbi,
    functionName: "seatIndex",
    args: [address!],
    query: { enabled },
  });

  return (
    <section className="panel">
      <h1>股东池</h1>
      <p className="muted">
        每次燃烧的 10% 均分在册股东。席位上限 453；MVP 由管理员白名单入座（不可自助注册）。
        初版「自持 50 万 + 直推 500 万 → 300 席」已废弃。
      </p>

      <dl className="stats">
        <div>
          <dt>席位占用</dt>
          <dd>
            {seatCount != null ? String(seatCount) : "—"} / 453
          </dd>
        </div>
        <div>
          <dt>我的席位</dt>
          <dd>{isShareholder ? `席位 #${seatIndex}` : "未入座"}</dd>
        </div>
        <div>
          <dt>可领（UMplan）</dt>
          <dd>{claimable != null ? fmtToken(claimable as bigint) : "—"}</dd>
        </div>
      </dl>

      {!isConnected ? (
        <p className="banner warn">请先连接钱包</p>
      ) : !isConfigured ? (
        <p className="banner warn">合约地址未配置</p>
      ) : !isShareholder ? (
        <p className="banner warn">请联系管理员白名单入座</p>
      ) : (
        <button
          type="button"
          className="btn primary"
          disabled={isPending || confirming || !(claimable as bigint)}
          onClick={() =>
            writeContract({
              address: addresses.shareholders,
              abi: ShAbi,
              functionName: "claim",
            })
          }
        >
          {isPending || confirming ? "确认中…" : "领取股东分红"}
        </button>
      )}

      {isSuccess && <p className="banner ok">领取已确认</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </section>
  );
}
