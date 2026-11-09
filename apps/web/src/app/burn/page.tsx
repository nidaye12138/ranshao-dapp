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
import BurnAbi from "@/lib/abi/BurnRouter.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import ERC20Abi from "@/lib/abi/ERC20.json";

const TIERS = [
  { id: 1, u: "100 U", w: "33.33%" },
  { id: 2, u: "500 U", w: "25%" },
  { id: 3, u: "800 U", w: "25%" },
  { id: 4, u: "1500 U", w: "16.67%" },
];

export default function BurnPage() {
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

  const enabled = isConfigured && !!address;

  const { data: quoteUsd } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "quoteBurnUsd",
    args: [parsed],
    query: { enabled: enabled && parsed > 0n },
  });

  const { data: burnedUsd } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "burnedUsd",
    args: [address!],
    query: { enabled },
  });

  const { data: tier } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "tierOf",
    args: [address!],
    query: { enabled },
  });

  const { data: allowance } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [address!, addresses.burn],
    query: { enabled },
  });

  const needApprove = (allowance as bigint | undefined ?? 0n) < parsed;
  const toSink = (parsed * 7000n) / 10_000n;
  const toLayers = (parsed * 2000n) / 10_000n;
  const toSh = (parsed * 1000n) / 10_000n;

  return (
    <section className="panel">
      <h1>燃烧</h1>
      <p className="muted">
        Umidor · 金本位定档；拆账 70% 销毁 / 20% 九层 / 10% 股东。MVP：仅保留最高档资格。
      </p>

      <label className="field">
        <span>燃烧数量（UMplan）</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </label>

      <dl className="stats">
        <div>
          <dt>本次折合 U</dt>
          <dd>{quoteUsd != null ? fmtToken(quoteUsd as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>累计燃烧 U</dt>
          <dd>{burnedUsd != null ? fmtToken(burnedUsd as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>当前档位</dt>
          <dd>{tier != null ? `T${tier}` : "—"}</dd>
        </div>
        <div>
          <dt>销毁 / 九层 / 股东</dt>
          <dd>
            {fmtToken(toSink)} / {fmtToken(toLayers)} / {fmtToken(toSh)}
          </dd>
        </div>
      </dl>

      <ul className="muted" style={{ marginBottom: "1rem" }}>
        {TIERS.map((t) => (
          <li key={t.id}>
            T{t.id} · 门槛 {t.u} · 池权重 {t.w}
          </li>
        ))}
      </ul>

      {!isConnected ? (
        <p className="banner warn">请先连接钱包</p>
      ) : !isConfigured ? (
        <p className="banner warn">合约地址未配置</p>
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
                  args: [addresses.burn, parsed],
                })
              }
            >
              授权代币
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={isPending || confirming || needApprove || parsed === 0n}
            onClick={() =>
              writeContract({
                address: addresses.burn,
                abi: BurnAbi,
                functionName: "burn",
                args: [parsed],
              })
            }
          >
            {isPending || confirming ? "确认中…" : "燃烧"}
          </button>
        </div>
      )}

      {isSuccess && <p className="banner ok">燃烧已确认</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </section>
  );
}
