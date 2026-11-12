"use client";

import Image from "next/image";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { appChainId } from "@/lib/chain";
import { shortAddr } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";
import { useI18n } from "@/lib/i18n";

export function Header() {
  const mounted = useMounted();
  const { t, locale, setLocale } = useI18n();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const chainOk = chainId === appChainId;
  const switchLabel =
    appChainId === 97
      ? t("header.switchChapel")
      : appChainId === 56
        ? t("header.switchBsc")
        : t("header.switchNetwork");

  return (
    <header className="site-header site-header-compact">
      <Link href="/" className="brand-lockup" aria-label={t("header.homeAria")}>
        <Image src="/umidor-logo.png" alt="Umidor" width={40} height={38} className="brand-mark" priority />
        <span className="brand-text">
          <span className="brand">Umidor</span>
          <span className="brand-sub">UMplan</span>
        </span>
      </Link>
      <div className="header-actions">
        <div className="locale-toggle" role="group" aria-label={t("header.localeAria")}>
          <button
            type="button"
            className={locale === "zh" ? "locale-btn on" : "locale-btn"}
            onClick={() => setLocale("zh")}
            aria-pressed={locale === "zh"}
          >
            {t("header.localeZh")}
          </button>
          <button
            type="button"
            className={locale === "en" ? "locale-btn on" : "locale-btn"}
            onClick={() => setLocale("en")}
            aria-pressed={locale === "en"}
          >
            {t("header.localeEn")}
          </button>
        </div>
        <div className="wallet">
          {!mounted ? (
            <button type="button" className="btn wallet-pill" disabled>
              {t("common.bindWallet")}
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
                  {isPending ? t("common.connecting") : t("common.bindWallet")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
