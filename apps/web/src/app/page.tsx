"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, zeroAddress } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { shortAddr } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import { banners as fallbackBanners, dappRules as fallbackRules, tokenIntro as fallbackIntro } from "@/lib/mockData";
import { useAnnouncements, useLeaderboard, useStats } from "@/lib/api/client";
import TreeAbi from "@/lib/abi/ReferralTree.json";

const FALLBACK_SLIDES = [
  { id: "s1", title: "四档分红 · 每日可领", subtitle: "持有对应权重档位后进入 SPCXB 分红池，24 小时可领一次", tone: "b1" },
  { id: "s2", title: "推广奖励即时到账", subtitle: "买卖皆享交易方与直推各 0.5%，立刻到账钱包", tone: "b2" },
  { id: "s3", title: "通缩模型 · 权重销毁", subtitle: "权重订单 70% 打入销毁地址，永久移出流通", tone: "b3" },
];

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
  const [bannerIndex, setBannerIndex] = useState(0);
  const [refInput, setRefInput] = useState("");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: appChainId });

  const { data: cms } = useAnnouncements();
  const { data: board } = useLeaderboard();
  const { data: stats } = useStats();

  const announcements = cms?.announcements?.length ? cms.announcements : [{ id: "0", text: "加载公告…" }];
  const cmsBanner = cms?.banners?.[0] ?? fallbackBanners[0];
  const slides =
    cms?.banners && cms.banners.length >= 2
      ? cms.banners.map((b, i) => ({
          id: b.id,
          title: b.title,
          subtitle: b.subtitle,
          tone: (`b${(i % 3) + 1}` as "b1" | "b2" | "b3"),
        }))
      : [
          { id: cmsBanner.id, title: cmsBanner.title, subtitle: cmsBanner.subtitle, tone: "b1" as const },
          ...FALLBACK_SLIDES.slice(1),
        ];
  const tokenIntro = cms?.tokenIntro ?? fallbackIntro;
  const dappRules = cms?.dappRules?.length ? cms.dappRules : fallbackRules;

  useEffect(() => {
    if (announcements.length === 0) return;
    const t = setInterval(() => setAnnIndex((i) => (i + 1) % announcements.length), 4200);
    return () => clearInterval(t);
  }, [announcements.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setBannerIndex((i) => (i + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [slides.length]);

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
    chainId: appChainId,
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
      <section className="banner-carousel" aria-label="Banner">
        <div className="banner-track" style={{ transform: `translateX(-${bannerIndex * 100}%)` }}>
          {slides.map((s) => (
            <div key={s.id} className={`banner-slide ${s.tone}`}>
              <p className="banner-title">{s.title}</p>
              <p className="banner-sub">{s.subtitle}</p>
            </div>
          ))}
        </div>
        <div className="banner-dots">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={i === bannerIndex ? "banner-dot on" : "banner-dot"}
              aria-label={`Banner ${i + 1}`}
              onClick={() => setBannerIndex(i)}
            />
          ))}
        </div>
      </section>

      <section className="notice" aria-live="polite">
        <span className="notice-tag">公告</span>
        <div className="notice-viewport">
          <p key={ann.id} className="notice-text">
            {ann.text}
          </p>
        </div>
      </section>

      <section className="flat-row">
        <div className="flat-card">
          <div className="flat-label">
            实时币价
            <span className="flat-badge">合约实时价</span>
          </div>
          <div className="flat-value">{priceDisplay}</div>
          <div className="flat-extra">USDT</div>
        </div>
        <div className="flat-card">
          <div className="flat-label">权重销毁总量</div>
          <div className="flat-value">{burnedDisplay}</div>
          <div className="flat-extra" style={{ color: "var(--text-secondary)" }}>
            UMplan 已永久销毁
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">
          全网龙虎榜 TOP10
          <span className="muted">按直推人数排行</span>
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
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
                <span className="rank-val">{r.directs} 人直推</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">我的邀请人</h2>
        {!mounted ? (
          <p className="muted">加载中…</p>
        ) : !isConnected ? (
          <p className="muted">连接钱包后查看 / 绑定</p>
        ) : bound ? (
          <div className="referrer-row">
            <div className="avatar" aria-hidden>
              ↑
            </div>
            <div>
              <div className="ref-name">邀请人 {shortAddr(myReferrer as string)}</div>
              <div className="ref-addr">{myReferrer as string}</div>
            </div>
          </div>
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
                  chainId: appChainId,
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

      <section className="card">
        <h2 className="card-title">代币介绍</h2>
        <p className="lead-copy">{tokenIntro}</p>
        <h2 className="card-title">dApp 规则</h2>
        <div className="doc-text">
          {dappRules.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
      </section>
    </div>
  );
}
