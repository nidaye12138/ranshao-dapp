"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, zeroAddress } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { shortAddr } from "@/lib/format";
import TreeAbi from "@/lib/abi/ReferralTree.json";
import { useMounted } from "@/lib/useMounted";

export default function PromoPage() {
  return (
    <Suspense fallback={<div className="panel">加载中…</div>}>
      <PromoInner />
    </Suspense>
  );
}

function PromoInner() {
  const { address, isConnected } = useAccount();
  const mounted = useMounted();
  const search = useSearchParams();
  const [referrer, setReferrer] = useState("");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    const ref = search.get("ref");
    if (ref && isAddress(ref)) setReferrer(ref);
  }, [search]);

  const enabled = isConfigured && !!address && mounted;

  const { data: myReferrer } = useReadContract({
    address: addresses.registry,
    abi: TreeAbi,
    functionName: "referrerOf",
    args: [address!],
    query: { enabled },
  });

  const { data: directCount } = useReadContract({
    address: addresses.registry,
    abi: TreeAbi,
    functionName: "directRefCount",
    args: [address!],
    query: { enabled },
  });

  const { data: walk } = useReadContract({
    address: addresses.registry,
    abi: TreeAbi,
    functionName: "walk",
    args: [address!, 9n],
    query: { enabled },
  });

  const bound = myReferrer && (myReferrer as string) !== zeroAddress;
  const inviteLink =
    typeof window !== "undefined" && address
      ? `${window.location.origin}/promo?ref=${address}`
      : "";

  return (
    <section className="panel">
      <h1>推荐关系</h1>
      <p className="muted">
        绑定一次不可改；支撑 Swap 直推 0.5% 与燃烧九层。初版业绩里程碑已废弃。
      </p>

      <dl className="stats">
        <div>
          <dt>我的上级</dt>
          <dd>{bound ? shortAddr(myReferrer as `0x${string}`) : "未绑定"}</dd>
        </div>
        <div>
          <dt>直推人数</dt>
          <dd>{directCount != null ? String(directCount) : "—"}</dd>
        </div>
      </dl>

      {Array.isArray(walk) && (
        <div className="muted" style={{ marginBottom: "1rem" }}>
          <p>向上 9 层：</p>
          <ol>
            {(walk as readonly `0x${string}`[]).map((a, i) => (
              <li key={i}>
                L{i + 1}: {a === zeroAddress ? "（缺层→沉淀）" : shortAddr(a)}
              </li>
            ))}
          </ol>
        </div>
      )}

      {!bound && (
        <label className="field">
          <span>推荐人地址</span>
          <input value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder="0x…" />
        </label>
      )}

      {inviteLink && (
        <p className="muted">
          邀请链接：<code>{inviteLink}</code>
        </p>
      )}

      {!isConnected ? (
        <p className="banner warn">请先连接钱包</p>
      ) : !isConfigured ? (
        <p className="banner warn">合约地址未配置</p>
      ) : !bound ? (
        <button
          type="button"
          className="btn primary"
          disabled={isPending || confirming || !isAddress(referrer)}
          onClick={() =>
            writeContract({
              address: addresses.registry,
              abi: TreeAbi,
              functionName: "bindReferrer",
              args: [referrer as `0x${string}`],
            })
          }
        >
          {isPending || confirming ? "确认中…" : "绑定推荐人"}
        </button>
      ) : (
        <p className="banner ok">已绑定，不可更改</p>
      )}

      {isSuccess && <p className="banner ok">绑定成功</p>}
      {error && <p className="banner warn">{error.message}</p>}
    </section>
  );
}
