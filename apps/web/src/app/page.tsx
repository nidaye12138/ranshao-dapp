"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, zeroAddress } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { fmtToken, shortAddr } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import {
  announcements,
  banners,
  dappRules,
  tokenIntro,
  topDirectRefs,
} from "@/lib/mockData";
import TreeAbi from "@/lib/abi/ReferralTree.json";
import BurnAbi from "@/lib/abi/BurnRouter.json";
import OracleHint from "@/lib/abi/SwapFacade.json";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="panel">加载中…</div>}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const search = useSearchParams();
  const [annIndex, setAnnIndex] = useState(0);
  const [refInput, setRefInput] = useState("");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    const t = setInterval(() => setAnnIndex((i) => (i + 1) % announcements.length), 4200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ref = search.get("ref");
    if (ref && isAddress(ref)) setRefInput(ref);
  }, [search]);

  const enabled = mounted && isConfigured && !!address;

  const { data: myReferrer } = useReadContract({
    address: addresses.registry,
    abi: TreeAbi,
    functionName: "referrerOf",
    args: [address!],
    query: { enabled },
  });

  const { data: totalBurned } = useReadContract({
    address: addresses.burn,
    abi: BurnAbi,
    functionName: "totalBurnedToken",
    query: { enabled: isConfigured },
  });

  // Live price via SwapFacade.oracle is not exposed as public view of price directly;
  // use quoteUsdt(1e18) usdAmount as $ for 1 USDT path — show tokenUsd via 1 token quote inverse.
  const { data: oneUsdtQuote } = useReadContract({
    address: addresses.swap,
    abi: OracleHint,
    functionName: "quoteUsdt",
    args: [10n ** 18n],
    query: { enabled: isConfigured },
  });

  const tokenPerUsdt = (oneUsdtQuote as [bigint, bigint] | undefined)?.[0];
  // price ≈ 1 / tokensPerUsdt when 1 USDT buys N tokens at $1 USDT
  const priceHint =
    tokenPerUsdt && tokenPerUsdt > 0n
      ? (1 / Number(tokenPerUsdt) * 1e18).toFixed(4)
      : null;

  const bound = myReferrer && (myReferrer as string) !== zeroAddress;
  const banner = banners[0];

  return (
    <div className="home-board">
      <section className="banner-block" data-tone={banner.tone}>
        <Image src="/umidor-logo.png" alt="" width={72} height={68} className="banner-logo" />
        <div>
          <p className="banner-title">{banner.title}</p>
          <p className="banner-sub">{banner.subtitle}</p>
        </div>
      </section>

      <section className="announce-rail" aria-live="polite">
        <span className="announce-tag">公告</span>
        <p key={announcements[annIndex].id} className="announce-text">
          {announcements[annIndex].text}
        </p>
      </section>

      <section className="stat-pair">
        <div>
          <dt>实时币价</dt>
          <dd>{priceHint != null ? `≈ $${priceHint}` : isConfigured ? "…" : "—"}</dd>
        </div>
        <div>
          <dt>累计销毁</dt>
          <dd>{totalBurned != null ? fmtToken(totalBurned as bigint, 18, 2) : isConfigured ? "…" : "—"}</dd>
        </div>
      </section>

      <section className="panel-block">
        <h2>直推排行榜 Top 10</h2>
        <p className="muted">按直推人数（索引 stub，待接 API）</p>
        <ol className="rank-list">
          {topDirectRefs.map((r) => (
            <li key={r.rank}>
              <span className="rank-n">{r.rank}</span>
              <span className="rank-addr">{shortAddr(r.address)}</span>
              <span className="rank-val">{r.directs}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel-block">
        <h2>我的上级</h2>
        {!mounted ? (
          <p className="muted">加载中…</p>
        ) : !isConnected ? (
          <p className="muted">连接钱包后查看 / 绑定</p>
        ) : bound ? (
          <p>
            已绑定：<strong>{shortAddr(myReferrer as string)}</strong>
          </p>
        ) : (
          <>
            <label className="field">
              <span>推荐人地址</span>
              <input value={refInput} onChange={(e) => setRefInput(e.target.value)} placeholder="0x…" />
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={!isConfigured || isPending || confirming || !isAddress(refInput)}
              onClick={() =>
                writeContract({
                  address: addresses.registry,
                  abi: TreeAbi,
                  functionName: "bindReferrer",
                  args: [refInput as `0x${string}`],
                })
              }
            >
              {isPending || confirming ? "确认中…" : "绑定推荐人"}
            </button>
            {error && <p className="banner warn">{error.message}</p>}
            {isSuccess && <p className="banner ok">绑定成功</p>}
          </>
        )}
      </section>

      <section className="panel-block">
        <h2>代币介绍</h2>
        <p className="lead-copy">{tokenIntro}</p>
        <h2>dApp 规则</h2>
        <ul className="rules-list">
          {dappRules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
