"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { zeroAddress } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { isAddressLoose, toChecksumAddress } from "@/lib/addressUtils";
import { shortAddr } from "@/lib/format";
import { formatTxError } from "@/lib/txError";
import { useMounted } from "@/lib/useMounted";
import { useLeaderboard, useStats } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import TreeAbi from "@/lib/abi/ReferralTree.json";

const TOKEN_SUPPLY = 1_000_000_000;

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSuspenseFallback />}>
      <HomeInner />
    </Suspense>
  );
}

function HomeSuspenseFallback() {
  const { t } = useI18n();
  return <div className="panel">{t("common.loading")}</div>;
}

function HomeInner() {
  const mounted = useMounted();
  const { t, locale, messages } = useI18n();
  const { address, isConnected } = useAccount();
  const search = useSearchParams();
  const [annIndex, setAnnIndex] = useState(0);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [refInput, setRefInput] = useState("");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: appChainId });

  const { data: board } = useLeaderboard();
  const { data: stats } = useStats();

  const announcements = messages.home.announcements;
  const slides = messages.home.slides.map((s) => ({
    ...s,
    cta: t("home.viewRules"),
  }));
  const dappRules = messages.home.rules;

  useEffect(() => {
    if (announcements.length === 0) return;
    const timer = setInterval(() => setAnnIndex((i) => (i + 1) % announcements.length), 4200);
    return () => clearInterval(timer);
  }, [announcements.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => setBannerIndex((i) => (i + 1) % slides.length), 4000);
    return () => clearInterval(timer);
  }, [slides.length]);

  useEffect(() => {
    const ref = toChecksumAddress(search.get("ref"));
    if (ref) setRefInput(ref);
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
    stats?.priceUsd != null ? stats.priceUsd : stats?.source === "unconfigured" ? "—" : "…";
  const burnedDisplay =
    stats?.totalBurnedToken != null ? stats.totalBurnedToken : stats?.source === "unconfigured" ? "—" : "…";

  const burnedNum =
    stats?.totalBurnedToken != null ? Number(String(stats.totalBurnedToken).replace(/,/g, "")) : NaN;
  const circulating =
    Number.isFinite(burnedNum) && burnedNum >= 0
      ? Math.max(0, TOKEN_SUPPLY - burnedNum).toLocaleString("en-US")
      : "—";

  function scrollToRules() {
    document.getElementById("dapp-rules")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="home-board">
      <section className="banner-carousel" aria-label="Banner">
        <div className="banner-track" style={{ transform: `translateX(-${bannerIndex * 100}%)` }}>
          {slides.map((s) => (
            <div key={s.id} className={`banner-slide ${s.tone}`}>
              <div className="banner-copy">
                <p className="banner-title">{s.title}</p>
                <p className="banner-sub">{s.subtitle}</p>
                <button type="button" className="banner-cta" onClick={scrollToRules}>
                  {s.cta}
                </button>
              </div>
              <div className="banner-art" aria-hidden>
                <span className="banner-rocket">▲</span>
              </div>
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
        <span className="notice-tag">{t("home.noticeTag")}</span>
        <div className="notice-viewport">
          <p key={`${locale}-${ann.id}`} className="notice-text">
            {ann.text}
          </p>
        </div>
      </section>

      <section className="flat-row">
        <div className="flat-card">
          <div className="flat-label">{t("home.priceLabel")}</div>
          <div className="flat-value">
            {priceDisplay}
            <span className="flat-unit">USDT</span>
          </div>
          <div className="flat-extra">{t("home.priceExtra")}</div>
        </div>
        <div className="flat-card">
          <div className="flat-label">{t("home.burnedLabel")}</div>
          <div className="flat-value">{burnedDisplay}</div>
          <div className="flat-extra" style={{ color: "var(--text-secondary)" }}>
            {t("home.burnedExtra")}
          </div>
        </div>
      </section>

      <section className="card card-dense">
        <h2 className="card-title">
          {t("home.boardTitle")}
          <span className="muted">{t("home.boardSub")}</span>
        </h2>
        <p className="muted source-line">
          {board?.source === "graph" || board?.source === "chain"
            ? t("home.boardByDirects")
            : board?.source === "unconfigured"
              ? t("home.boardUnconfigured")
              : t("home.boardLoading")}
        </p>
        {!board || board.items.length === 0 ? (
          <p className="muted">{board?.source === "unconfigured" ? "—" : t("home.noData")}</p>
        ) : (
          <ol className="rank-list">
            {board.items.map((r) => {
              const vol =
                r.umbrellaToken != null
                  ? t("home.umbrellaVolume", { amount: `${r.umbrellaToken} UMplan` })
                  : r.umbrellaUsd != null
                    ? t("home.umbrellaVolume", { amount: `$${r.umbrellaUsd}` })
                    : null;
              return (
                <li key={r.address}>
                  <span className="rank-n">{r.rank}</span>
                  <span className="rank-addr">{shortAddr(r.address)}</span>
                  <span className="rank-meta">
                    <span className="rank-val">{t("home.directsCount", { n: r.directs })}</span>
                    {vol && <span className="rank-vol">{vol}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="card card-dense">
        <h2 className="card-title">{t("home.myInviter")}</h2>
        {!mounted ? (
          <p className="muted">{t("common.loading")}</p>
        ) : !isConnected ? (
          <p className="muted">{t("home.connectToBind")}</p>
        ) : bound ? (
          <div className="referrer-row">
            <div className="avatar avatar-ring" aria-hidden>
              ↑
            </div>
            <div className="ref-meta">
              <div className="ref-name">
                {t("home.inviterPrefix")} {shortAddr(myReferrer as string)}
              </div>
              <div className="ref-addr">{myReferrer as string}</div>
            </div>
          </div>
        ) : (
          <>
            <label className="field">
              <span>{t("home.referrerAddr")}</span>
              <input value={refInput} onChange={(e) => setRefInput(e.target.value)} placeholder="0x…" />
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={!isConfigured || isPending || confirming || !isAddressLoose(refInput)}
              onClick={() => {
                const ref = toChecksumAddress(refInput);
                if (!ref) return;
                writeContract({
                  address: addresses.registry,
                  abi: TreeAbi,
                  functionName: "bindReferrer",
                  args: [ref],
                  chainId: appChainId,
                });
              }}
            >
              {isPending || confirming ? t("common.confirming") : t("home.bindReferrer")}
            </button>
            {error && <p className="banner warn">{formatTxError(error, locale)}</p>}
            {isSuccess && <p className="banner ok">{t("home.bindOk")}</p>}
          </>
        )}
      </section>

      <section className="card card-dense">
        <h2 className="card-title">{t("home.tokenInfo")}</h2>
        <div className="info-quad" aria-label={t("home.tokenInfoAria")}>
          <div className="iq-cell">
            <div className="iq-val">{TOKEN_SUPPLY.toLocaleString("en-US")}</div>
            <div className="iq-label">{t("home.supply")}</div>
          </div>
          <div className="iq-cell">
            <div className="iq-val">{circulating}</div>
            <div className="iq-label">{t("home.circulating")}</div>
          </div>
          <div className="iq-cell">
            <div className="iq-val">BNB Chain</div>
            <div className="iq-label">{t("home.chain")}</div>
          </div>
          <div className="iq-cell">
            <div className="iq-val">{t("home.feeDefault")}</div>
            <div className="iq-label">{t("home.feeLabel")}</div>
          </div>
        </div>
      </section>

      <section className="card card-dense" id="dapp-rules">
        <h2 className="card-title">{t("home.rulesTitle")}</h2>
        <div className="doc-text rules-list">
          {dappRules.map((rule) => (
            <p key={rule}>{rule}</p>
          ))}
        </div>
      </section>
    </div>
  );
}
