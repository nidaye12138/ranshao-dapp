"use client";

import { useEffect, useState } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { addresses, isConfigured } from "@/lib/addresses";
import { fmtToken, shortAddr } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import { useEarnings, useTeam } from "@/lib/api/client";
import ERC20Abi from "@/lib/abi/ERC20.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import TreeAbi from "@/lib/abi/ReferralTree.json";

export default function MinePage() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const ready = mounted && isConfigured && !!address;
  const [inviteOrigin, setInviteOrigin] = useState("");

  useEffect(() => {
    setInviteOrigin(window.location.origin);
  }, []);

  const { data: bnbBal } = useBalance({
    address,
    query: { enabled: ready },
  });

  const { data: umplan } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: ready },
  });
  const { data: usdt } = useReadContract({
    address: addresses.usdt,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: ready },
  });
  const { data: spcxb } = useReadContract({
    address: addresses.spcxb,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: ready },
  });

  const { data: activated } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "isActivated",
    args: [address!],
    query: { enabled: ready },
  });

  const { data: directsOnChain } = useReadContract({
    address: addresses.registry,
    abi: TreeAbi,
    functionName: "directRefCount",
    args: [address!],
    query: { enabled: ready },
  });

  const { data: team } = useTeam(mounted && address ? address : undefined);
  const { data: earnings } = useEarnings(mounted && address ? address : undefined);

  const inviteDisplay =
    mounted && address ? (inviteOrigin ? `${inviteOrigin}/?ref=${address}` : `/?ref=${address}`) : "";

  const directsDisplay =
    mounted && directsOnChain != null
      ? String(directsOnChain)
      : team?.directs != null
        ? String(team.directs)
        : "—";

  return (
    <section className="panel">
      <h1>我的</h1>
      {!mounted ? (
        <p className="muted">加载中…</p>
      ) : !isConnected ? (
        <p className="banner warn">请先连接钱包</p>
      ) : (
        <p className="muted">{shortAddr(address)}</p>
      )}

      <h2>钱包余额</h2>
      <dl className="stats">
        <div>
          <dt>UMplan</dt>
          <dd>{mounted && umplan != null ? fmtToken(umplan as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>USDT</dt>
          <dd>{mounted && usdt != null ? fmtToken(usdt as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>SPCXB</dt>
          <dd>{mounted && spcxb != null ? fmtToken(spcxb as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>BNB</dt>
          <dd>{mounted && bnbBal ? fmtToken(bnbBal.value, bnbBal.decimals) : "—"}</dd>
        </div>
      </dl>

      <h2>我的团队</h2>
      <p className="muted">
        {team?.source === "graph"
          ? "索引聚合"
          : team?.source === "unconfigured"
            ? "索引未配置（GRAPH_URL）；直推可走链上"
            : mounted && isConnected
              ? "加载中…"
              : "连接钱包后查看"}
      </p>
      <dl className="stats">
        <div>
          <dt>直推</dt>
          <dd>{directsDisplay}</dd>
        </div>
        <div>
          <dt>间推</dt>
          <dd>{mounted && team ? String(team.indirects) : "—"}</dd>
        </div>
        <div>
          <dt>购买总量</dt>
          <dd>{mounted && team ? `$${team.buyVolumeUsd}` : "—"}</dd>
        </div>
        <div>
          <dt>伞下总业绩</dt>
          <dd>{mounted && team ? `$${team.umbrellaUsd}` : "—"}</dd>
        </div>
      </dl>

      <h2>推广资格</h2>
      {!mounted ? (
        <p className="muted">…</p>
      ) : activated ? (
        <div className="rules-box">
          <p className="banner ok">已激活（任意档 ≥100U）</p>
          <p>
            邀请链接：<code>{inviteDisplay}</code>
          </p>
        </div>
      ) : (
        <p className="banner warn">请先在「权重」燃烧任意档（最低 100U）以解锁邀请链接</p>
      )}

      <h2>我的收益</h2>
      <p className="muted">
        {earnings?.source === "graph"
          ? "账本来自索引"
          : earnings?.source === "unconfigured"
            ? "索引未配置 — 明细为空"
            : mounted && isConnected
              ? "加载中…"
              : ""}
      </p>
      <div className="panel-block">
        <h3>Swap 推广 · 总量 {earnings?.swapPromoTotal ?? "—"}</h3>
        {!earnings?.swapPromoRows?.length ? (
          <p className="muted">暂无明细</p>
        ) : (
          <ul className="ledger">
            {earnings.swapPromoRows.map((r) => (
              <li key={r.id}>
                <span>{r.label}</span>
                <span>{r.amount}</span>
                <span className="muted">{r.at}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="panel-block">
        <h3>
          层奖励 · 直推 {earnings?.layerTotal.直推 ?? "—"} / 间推 {earnings?.layerTotal.间推 ?? "—"} / 市场{" "}
          {earnings?.layerTotal.市场 ?? "—"}
        </h3>
        {!earnings?.layerRows?.length ? (
          <p className="muted">暂无明细</p>
        ) : (
          <ul className="ledger">
            {earnings.layerRows.map((r) => (
              <li key={r.id}>
                <span>{r.label}</span>
                <span>{r.amount}</span>
                <span className="muted">{r.at}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="panel-block">
        <h3>分红 · 总量 {earnings?.dividendTotal ?? "—"}</h3>
        {!earnings?.dividendRows?.length ? (
          <p className="muted">暂无明细（领取后由索引写入）</p>
        ) : (
          <ul className="ledger">
            {earnings.dividendRows.map((r) => (
              <li key={r.id}>
                <span>{r.label}</span>
                <span>{r.amount}</span>
                <span className="muted">{r.at}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
