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
import EliteAbi from "@/lib/abi/EliteStake.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import ERC20Abi from "@/lib/abi/ERC20.json";

export default function ElitePage() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("100");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const parsed = useMemo(() => {
    try {
      return parseAmount(amount, 18);
    } catch {
      return 0n;
    }
  }, [amount]);

  const eliteConfigured = isConfigured && addresses.elite !== "0x0000000000000000000000000000000000000000";
  const enabled = eliteConfigured && !!address;

  const { data: tier } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierOf",
    args: [address!],
    query: { enabled: isConfigured && !!address },
  });

  const { data: staked } = useReadContract({
    address: addresses.elite,
    abi: EliteAbi,
    functionName: "stakedOf",
    args: [address!],
    query: { enabled },
  });

  const { data: pending } = useReadContract({
    address: addresses.elite,
    abi: EliteAbi,
    functionName: "pendingRewards",
    args: [address!],
    query: { enabled },
  });

  const { data: totalStaked } = useReadContract({
    address: addresses.elite,
    abi: EliteAbi,
    functionName: "totalStaked",
    query: { enabled: eliteConfigured },
  });

  const { data: allowance } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.elite],
    query: { enabled },
  });

  const needApprove = (allowance as bigint | undefined ?? 0n) < parsed;
  const isT4 = tier === 4 || tier === 4n;

  return (
    <section className="panel">
      <h1>1500U 可选质押</h1>
      <p className="muted">
        Umidor · 仅 T4（累计燃烧 ≥ 1500U）可质押。每币分红 = (总释放 × 5%) / 总质押；总释放由管理员
        notifyRelease。初版 15 日 / 30 日生息已废弃。
      </p>

      <dl className="stats">
        <div>
          <dt>档位</dt>
          <dd>{tier != null ? `T${tier}` : "—"}</dd>
        </div>
        <div>
          <dt>我的质押</dt>
          <dd>{staked != null ? fmtToken(staked as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>待领奖励（SPCXB）</dt>
          <dd>{pending != null ? fmtToken(pending as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>总质押</dt>
          <dd>{totalStaked != null ? fmtToken(totalStaked as bigint) : "—"}</dd>
        </div>
      </dl>

      <label className="field">
        <span>质押数量</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </label>

      {!isConnected ? (
        <p className="banner warn">请先连接钱包</p>
      ) : !eliteConfigured ? (
        <p className="banner warn">EliteStake 地址未配置</p>
      ) : !isT4 ? (
        <p className="banner warn">需达到 1500U 燃烧档（T4）</p>
      ) : (
        <div className="cta-row">
          {needApprove && (
            <button
              type="button"
              className="btn"
              disabled={isPending || confirming}
              onClick={() =>
                writeContract({
                  address: addresses.token,
                  abi: ERC20Abi,
                  functionName: "approve",
                  args: [addresses.elite, parsed],
                })
              }
            >
              授权
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={isPending || confirming || needApprove || parsed === 0n}
            onClick={() =>
              writeContract({
                address: addresses.elite,
                abi: EliteAbi,
                functionName: "stake",
                args: [parsed],
              })
            }
          >
            质押
          </button>
          <button
            type="button"
            className="btn"
            disabled={isPending || confirming || !(staked as bigint)}
            onClick={() =>
              writeContract({
                address: addresses.elite,
                abi: EliteAbi,
                functionName: "unstake",
                args: [staked as bigint],
              })
            }
          >
            全部解除
          </button>
          <button
            type="button"
            className="btn"
            disabled={isPending || confirming || !(pending as bigint)}
            onClick={() =>
              writeContract({
                address: addresses.elite,
                abi: EliteAbi,
                functionName: "claim",
              })
            }
          >
            领取奖励
          </button>
        </div>
      )}

      {isSuccess && <p className="banner ok">交易已确认</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </section>
  );
}
