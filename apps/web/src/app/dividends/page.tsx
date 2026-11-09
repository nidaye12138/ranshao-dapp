"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { addresses, isConfigured } from "@/lib/addresses";
import { fmtToken } from "@/lib/format";
import DivAbi from "@/lib/abi/DividendPools.json";
import PrecipAbi from "@/lib/abi/PrecipitationPool.json";

export default function DividendsPage() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const enabled = isConfigured && !!address;

  const { data: tier } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierOf",
    args: [address!],
    query: { enabled },
  });

  const { data: claimable } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "claimable",
    args: [address!],
    query: { enabled },
  });

  const { data: t1 } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierMemberCount",
    args: [1],
    query: { enabled: isConfigured },
  });
  const { data: t2 } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierMemberCount",
    args: [2],
    query: { enabled: isConfigured },
  });
  const { data: t3 } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierMemberCount",
    args: [3],
    query: { enabled: isConfigured },
  });
  const { data: t4 } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierMemberCount",
    args: [4],
    query: { enabled: isConfigured },
  });

  const { data: precipClaimable } = useReadContract({
    address: addresses.precip,
    abi: PrecipAbi,
    functionName: "claimable",
    args: [address!],
    query: { enabled: enabled && addresses.precip !== "0x0000000000000000000000000000000000000000" },
  });

  return (
    <section className="panel">
      <h1>分红中心</h1>
      <p className="muted">Umidor · 四档池同档均分（地址均分）。资产为 SPCXB，不是项目币 UMplan。</p>

      <dl className="stats">
        <div>
          <dt>我的档位</dt>
          <dd>{tier != null ? `T${tier}` : "—"}</dd>
        </div>
        <div>
          <dt>可领 SPCXB</dt>
          <dd>{claimable != null ? fmtToken(claimable as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>同档人数 T1–T4</dt>
          <dd>
            {String(t1 ?? "—")} / {String(t2 ?? "—")} / {String(t3 ?? "—")} / {String(t4 ?? "—")}
          </dd>
        </div>
        <div>
          <dt>沉淀可领</dt>
          <dd>{precipClaimable != null ? fmtToken(precipClaimable as bigint) : "—"}</dd>
        </div>
      </dl>

      {!isConnected ? (
        <p className="banner warn">请先连接钱包</p>
      ) : !isConfigured ? (
        <p className="banner warn">合约地址未配置</p>
      ) : (
        <div className="cta-row">
          <button
            type="button"
            className="btn primary"
            disabled={isPending || confirming || !(claimable as bigint) }
            onClick={() =>
              writeContract({
                address: addresses.dividends,
                abi: DivAbi,
                functionName: "claim",
              })
            }
          >
            领取档位分红
          </button>
          {addresses.precip !== "0x0000000000000000000000000000000000000000" && (
            <button
              type="button"
              className="btn"
              disabled={isPending || confirming || !(precipClaimable as bigint)}
              onClick={() =>
                writeContract({
                  address: addresses.precip,
                  abi: PrecipAbi,
                  functionName: "claim",
                })
              }
            >
              领取沉淀 5% 份额
            </button>
          )}
        </div>
      )}

      {isSuccess && <p className="banner ok">领取已确认</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </section>
  );
}
