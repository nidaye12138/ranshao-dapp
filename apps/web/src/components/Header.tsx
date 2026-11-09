"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { bsc, bscTestnet, hardhat } from "wagmi/chains";
import { shortAddr } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";

const links = [
  { href: "/", label: "首页" },
  { href: "/buy", label: "购买" },
  { href: "/burn", label: "燃烧" },
  { href: "/dividends", label: "分红" },
  { href: "/promo", label: "推荐" },
  { href: "/elite", label: "1500U" },
  { href: "/shareholder", label: "股东" },
];

export function Header() {
  const pathname = usePathname();
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const chainOk = chainId === bsc.id || chainId === bscTestnet.id || chainId === hardhat.id;

  return (
    <header className="site-header">
      <Link href="/" className="brand-lockup" aria-label="Umidor 首页">
        <Image
          src="/umidor-logo.png"
          alt="Umidor"
          width={40}
          height={38}
          className="brand-mark"
          priority
        />
        <span className="brand-text">
          <span className="brand">Umidor</span>
          <span className="brand-sub">UM plan</span>
        </span>
      </Link>
      <nav className="nav">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="wallet">
        {!mounted ? (
          <button type="button" className="btn primary" disabled>
            连接钱包
          </button>
        ) : (
          <>
            {isConnected && !chainOk && (
              <button type="button" className="btn ghost" onClick={() => switchChain({ chainId: bsc.id })}>
                切换 BSC
              </button>
            )}
            {isConnected ? (
              <button type="button" className="btn ghost" onClick={() => disconnect()}>
                {shortAddr(address)}
              </button>
            ) : (
              <button
                type="button"
                className="btn primary"
                disabled={isPending || !connectors[0]}
                onClick={() => connect({ connector: connectors[0] })}
              >
                {isPending ? "连接中…" : "连接钱包"}
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
