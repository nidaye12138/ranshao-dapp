"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, zeroAddress } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { shortAddr } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import { banners as fallbackBanners, dappRules as fallbackRules, tokenIntro as fallbackIntro } from "@/lib/mockData";
import { useAnnouncements, useLeaderboard, useStats } from "@/lib/api/client";
import TreeAbi from "@/lib/abi/ReferralTree.json";

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

  const { data: cms } = useAnnouncements();
  const { data: board } = useLeaderboard();
  const { data: stats } = useStats();

  const announcements = cms?.announcements?.length ? cms.announcements : [{ id: "0", text: "加载公告…" }];
  const banner = cms?.banners?.[0] ?? fallbackBanners[0];
  const tokenIntro = cms?.tokenIntro ?? fallbackIntro;
  const dappRules = cms?.dappRules?.length ? cms.dappRules : fallbackRules;

  useEffect(() => {
    if (announcements.length === 0) return;
    const t = setInterval(() => setAnnIndex((i) => (i + 1) % announcements.length), 4200);
    return () => clearInterval(t);
  }, [announcements.length]);

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

  const bound = myReferrer && (myReferrer as string) !== zeroAddress;
  const ann = announcements[annIndex % announcements.length];

  const priceDisplay =
    stats?.priceUsd != null ? `≈ $${stats.priceUsd}` : stats?.source === "unconfigured" ? "—" : "…";
  const burnedDisplay =
    stats?.totalBurnedToken != null ? stats.totalBurnedToken : stats?.source === "unconfigured" ? "—" : "…";

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
        <p key={ann.id} className="announce-text">
          {ann.text}
        </p>
      </section>

      <section className="stat-pair">
        <div>
          <dt>实时币价</dt>
          <dd>{priceDisplay}</dd>
        </div>
        <div>
          <dt>累计销毁</dt>
          <dd>{burnedDisplay}</dd>
        </div>
      </section>

      <section className="panel-block">
        <h2>直推排行榜 Top 10</h2>
        <p className="muted">
          {board?.source === "graph"
            ? "按直推人数（索引）"
            : board?.source === "unconfigured"
              ? "索引未配置（GRAPH_URL）— 暂无排行数据"
              : "加载中…"}
        </p>
        {!board || board.items.length === 0 ? (
          <p className="muted">{board?.source === "unconfigured" ? "—" : "暂无数据"}</p>
        ) : (
          <ol className="rank-list">
            {board.items.map((r) => (
              <li key={r.address}>
                <span className="rank-n">{r.rank}</span>
                <span className="rank-addr">{shortAddr(r.address)}</span>
                <span className="rank-val">{r.directs}</span>
              </li>
            ))}
          </ol>
        )}
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
