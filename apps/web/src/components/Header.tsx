"use client";

import Image from "next/image";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { appChainId } from "@/lib/chain";
import { shortAddr } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";

export function Header() {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const chainOk = chainId === appChainId;
  const switchLabel = appChainId === 97 ? "切换 Chapel" : appChainId === 56 ? "切换 BSC" : "切换网络";

  return (
    <header className="site-header site-header-compact">
      <Link href="/" className="brand-lockup" aria-label="Umidor 首页">
        <Image src="/umidor-logo.png" alt="Umidor" width={40} height={38} className="brand-mark" priority />
        <span className="brand-text">
          <span className="brand">Umidor</span>
          <span className="brand-sub">UMplan</span>
        </span>
      </Link>
      <div className="wallet">
        {!mounted ? (
          <button type="button" className="btn wallet-pill" disabled>
            绑定钱包
          </button>
        ) : (
          <>
            {isConnected && !chainOk && (
              <button
                type="button"
                className="btn wallet-pill"
                onClick={() => switchChain({ chainId: appChainId })}
              >
                {switchLabel}
              </button>
            )}
            {isConnected ? (
              <button type="button" className="btn wallet-pill" onClick={() => disconnect()}>
                {shortAddr(address)}
              </button>
            ) : (
              <button
                type="button"
                className="btn wallet-pill"
                disabled={isPending || !connectors[0]}
                onClick={() => connect({ connector: connectors[0] })}
              >
                {isPending ? "连接中…" : "绑定钱包"}
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
