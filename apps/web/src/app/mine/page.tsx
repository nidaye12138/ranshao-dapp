"use client";

import { useAccount, useBalance, useReadContract } from "wagmi";
import { addresses, isConfigured } from "@/lib/addresses";
import { fmtToken, shortAddr } from "@/lib/format";
import { mockEarnings } from "@/lib/mockData";
import ERC20Abi from "@/lib/abi/ERC20.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import TreeAbi from "@/lib/abi/ReferralTree.json";

export default function MinePage() {
  const { address, isConnected } = useAccount();
  const enabled = isConfigured && !!address;

  const { data: bnbBal } = useBalance({ address, query: { enabled: !!address } });

  const { data: umplan } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled },
  });
  const { data: usdt } = useReadContract({
    address: addresses.usdt,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled },
  });
  const { data: spcxb } = useReadContract({
    address: addresses.spcxb,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled },
  });

  const { data: activated } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "isActivated",
    args: [address!],
    query: { enabled },
  });

  const { data: directs } = useReadContract({
    address: addresses.registry,
    abi: TreeAbi,
    functionName: "directRefCount",
    args: [address!],
    query: { enabled },
  });

  const invite =
    typeof window !== "undefined" && address
      ? `${window.location.origin}/?ref=${address}`
      : address
        ? `/?ref=${address}`
        : "";

  const team = mockEarnings.team;

  return (
    <section className="panel">
      <h1>我的</h1>
      {!isConnected ? (
        <p className="banner warn">请先连接钱包</p>
      ) : (
        <p className="muted">{shortAddr(address)}</p>
      )}

      <h2>钱包余额</h2>
      <dl className="stats">
        <div>
          <dt>UMplan</dt>
          <dd>{umplan != null ? fmtToken(umplan as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>USDT</dt>
          <dd>{usdt != null ? fmtToken(usdt as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>SPCXB</dt>
          <dd>{spcxb != null ? fmtToken(spcxb as bigint) : "—"}</dd>
        </div>
        <div>
          <dt>BNB</dt>
          <dd>{bnbBal ? fmtToken(bnbBal.value, bnbBal.decimals) : "—"}</dd>
        </div>
      </dl>

      <h2>我的团队</h2>
      <p className="muted">链上直推数已接；其余为索引 stub</p>
      <dl className="stats">
        <div>
          <dt>直推</dt>
          <dd>{directs != null ? String(directs) : String(team.directs)}</dd>
        </div>
        <div>
          <dt>间推</dt>
          <dd>{team.indirects}</dd>
        </div>
        <div>
          <dt>购买总量</dt>
          <dd>${team.buyVolumeUsd}</dd>
        </div>
        <div>
          <dt>伞下总业绩</dt>
          <dd>${team.umbrellaUsd}</dd>
        </div>
      </dl>

      <h2>推广资格</h2>
      {activated ? (
        <div className="rules-box">
          <p className="banner ok">已激活（任意档 ≥100U）</p>
          <p>
            邀请链接：<code>{invite}</code>
          </p>
        </div>
      ) : (
        <p className="banner warn">请先在「推广」燃烧任意档（最低 100U）以解锁邀请链接</p>
      )}

      <h2>我的收益</h2>
      <div className="panel-block">
        <h3>Swap 推广 · 总量 {mockEarnings.swapPromoTotal}</h3>
        <ul className="ledger">
          {mockEarnings.swapPromoRows.map((r) => (
            <li key={r.id}>
              <span>{r.label}</span>
              <span>{r.amount}</span>
              <span className="muted">{r.at}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel-block">
        <h3>
          层奖励 · 直推 {mockEarnings.layerTotal.直推} / 间推 {mockEarnings.layerTotal.间推} / 市场{" "}
          {mockEarnings.layerTotal.市场}
        </h3>
        <ul className="ledger">
          {mockEarnings.layerRows.map((r) => (
            <li key={r.id}>
              <span>{r.label}</span>
              <span>{r.amount}</span>
              <span className="muted">{r.at}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel-block">
        <h3>分红 · 总量 {mockEarnings.dividendTotal}</h3>
        {mockEarnings.dividendRows.length === 0 ? (
          <p className="muted">暂无明细（领取后由索引写入）</p>
        ) : (
          <ul className="ledger">
            {mockEarnings.dividendRows.map((r) => (
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
