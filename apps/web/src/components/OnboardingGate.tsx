"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  useAccount,
  useBalance,
  useConnect,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { isAddressLoose, toChecksumAddress } from "@/lib/addressUtils";
import { shortAddr } from "@/lib/format";
import { formatTxError } from "@/lib/txError";
import { useOnboarding } from "@/components/OnboardingProvider";
import TreeAbi from "@/lib/abi/ReferralTree.json";
import { stashPendingRef } from "@/lib/onboardingStorage";
import { useI18n } from "@/lib/i18n";

const BIND_TIMEOUT_MS = 90_000;

export function OnboardingGate() {
  const {
    showGate,
    refDraft,
    setRefDraft,
    editingRef,
    setEditingRef,
    softSkip,
    markCompleted,
    referrer,
    bound,
    refetchReferrer,
  } = useOnboarding();
  const { t, locale } = useI18n();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const publicClient = usePublicClient({ chainId: appChainId });
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const {
    isLoading: confirming,
    isSuccess,
    isError: receiptError,
    error: receiptErr,
  } = useWaitForTransactionReceipt({ hash, chainId: appChainId });
  const { data: nativeBal } = useBalance({
    address,
    chainId: appChainId,
    query: { enabled: !!address && isConnected },
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const startedAt = useRef<number | null>(null);

  const checksumRef = toChecksumAddress(refDraft);
  const validRef = !!checksumRef && checksumRef.toLowerCase() !== address?.toLowerCase();
  const fromInvite = isAddressLoose(refDraft);
  const busy = isPending || confirming || simulating;
  const displayError =
    localError ||
    (error ? formatTxError(error, locale) : null) ||
    (receiptError && receiptErr ? formatTxError(receiptErr, locale) : null);

  // Tx mined OR on-chain already bound → close gate (covers receipt-poll stalls)
  useEffect(() => {
    if (!address) return;
    if (isSuccess || bound) {
      markCompleted(referrer ?? checksumRef ?? refDraft);
      reset();
      startedAt.current = null;
      setSimulating(false);
    }
  }, [isSuccess, bound, address, referrer, checksumRef, refDraft, markCompleted, reset]);

  // While waiting for wallet / receipt, keep re-reading referrerOf
  useEffect(() => {
    if (!busy && !hash) return;
    refetchReferrer();
    const id = window.setInterval(() => refetchReferrer(), 4_000);
    return () => window.clearInterval(id);
  }, [busy, hash, refetchReferrer]);

  // Hard timeout so "确认中…" cannot spin forever
  useEffect(() => {
    if (!busy) {
      startedAt.current = null;
      return;
    }
    if (startedAt.current == null) startedAt.current = Date.now();
    const id = window.setInterval(() => {
      if (startedAt.current == null) return;
      if (Date.now() - startedAt.current < BIND_TIMEOUT_MS) return;
      refetchReferrer();
      reset();
      setSimulating(false);
      startedAt.current = null;
      setLocalError(t("onboarding.errTimeout"));
    }, 2_000);
    return () => window.clearInterval(id);
  }, [busy, refetchReferrer, reset, t]);

  useEffect(() => {
    if (receiptError) {
      setSimulating(false);
      startedAt.current = null;
    }
  }, [receiptError]);

  if (!showGate) return null;

  async function onPrimary() {
    setLocalError(null);
    if (!isConnected) {
      if (connectors[0]) connect({ connector: connectors[0] });
      return;
    }
    if (bound) {
      markCompleted(referrer ?? checksumRef ?? refDraft);
      return;
    }
    const ref = toChecksumAddress(refDraft);
    if (!ref) {
      setLocalError(t("onboarding.errInvalidRef"));
      setEditingRef(true);
      return;
    }
    if (!isConfigured) {
      setLocalError(t("onboarding.errUnconfigured"));
      return;
    }
    if (ref.toLowerCase() === address?.toLowerCase()) {
      setLocalError(t("onboarding.errSelf"));
      return;
    }
    if (nativeBal && nativeBal.value === 0n) {
      setLocalError(t("onboarding.errZeroGas"));
      return;
    }

    setRefDraft(ref);
    stashPendingRef(ref);
    reset();
    setSimulating(true);
    startedAt.current = Date.now();

    if (publicClient && address) {
      try {
        await publicClient.simulateContract({
          address: addresses.registry,
          abi: TreeAbi,
          functionName: "bindReferrer",
          args: [ref],
          account: address,
          chain: publicClient.chain,
        });
      } catch (e) {
        setSimulating(false);
        startedAt.current = null;
        setLocalError(formatTxError(e, locale));
        return;
      }
    }

    setSimulating(false);
    writeContract({
      address: addresses.registry,
      abi: TreeAbi,
      functionName: "bindReferrer",
      args: [ref],
      chainId: appChainId,
    });
  }

  const primaryLabel = !isConnected
    ? connecting
      ? t("common.connecting")
      : t("onboarding.primaryConnect")
    : simulating
      ? t("onboarding.simulating")
      : isPending
        ? t("onboarding.waitingWallet")
        : confirming
          ? t("onboarding.confirmingOnChain")
          : bound
            ? t("onboarding.primaryEnter")
            : t("onboarding.primaryBindEnter");

  const hint = !isConnected
    ? t("onboarding.hintConnect")
    : !validRef
      ? t("onboarding.hintConfirmRef")
      : t("onboarding.hintOnce");

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="ob-modal">
        <div className="ob-hero">
          <div className="ob-logo-wrap">
            <Image src="/umidor-logo.png" alt="" width={56} height={54} className="ob-logo" priority />
          </div>
          <h1 id="ob-title" className="ob-title">
            {t("onboarding.title")} <span>Umidor</span>
          </h1>
          <p className="ob-sub">{t("onboarding.sub")}</p>
        </div>

        <section className="ob-step">
          <div className="ob-step-head">
            <span className="ob-step-n n1">1</span>
            <span className="ob-step-label">{t("onboarding.stepRef")}</span>
            {fromInvite && !editingRef ? (
              <span className="ob-pill ok">{t("onboarding.inviteImported")}</span>
            ) : (
              <span className="ob-pill">{t("onboarding.pendingConfirm")}</span>
            )}
          </div>

          {editingRef ? (
            <label className="ob-edit-field">
              <span>{t("onboarding.inviterAddr")}</span>
              <input
                value={refDraft}
                onChange={(e) => setRefDraft(e.target.value.trim())}
                placeholder="0x…"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="ob-link"
                onClick={() => {
                  const normalized = toChecksumAddress(refDraft);
                  if (normalized) {
                    setRefDraft(normalized);
                    stashPendingRef(normalized);
                    setEditingRef(false);
                  } else {
                    setLocalError(t("onboarding.errInvalidRef"));
                  }
                }}
              >
                {t("onboarding.useThisAddr")}
              </button>
            </label>
          ) : (
            <div className="ob-inviter">
              <div className="ob-inviter-icon" aria-hidden>
                {locale === "zh" ? "推" : "R"}
              </div>
              <div className="ob-inviter-body">
                <div className="ob-inviter-name">
                  {t("onboarding.inviter")} {fromInvite ? shortAddr(refDraft) : t("onboarding.unspecified")}
                </div>
                <div className="ob-inviter-ref">
                  {fromInvite ? `ref=${refDraft.slice(0, 10)}…` : t("onboarding.enterViaInvite")}
                </div>
              </div>
            </div>
          )}

          <p className="ob-step-note">{t("onboarding.refNote")}</p>
          {!editingRef && (
            <button type="button" className="ob-link ob-link-end" onClick={() => setEditingRef(true)}>
              {t("onboarding.editRef")}
            </button>
          )}
        </section>

        <section className="ob-step">
          <div className="ob-step-head">
            <span className="ob-step-n n2">2</span>
            <span className="ob-step-label">{t("onboarding.stepWallet")}</span>
            <span className={isConnected ? "ob-pill ok" : "ob-pill muted"}>
              {isConnected ? t("onboarding.connected") : t("onboarding.notConnected")}
            </span>
          </div>
          <div className="ob-wallet-row">
            <div className="ob-wallet-copy">
              <span className="ob-wallet-ico" aria-hidden>
                ⌁
              </span>
              <span>
                {isConnected && address ? shortAddr(address) : t("onboarding.needWallet")}
              </span>
            </div>
            {!isConnected && (
              <button
                type="button"
                className="btn primary ob-wallet-btn"
                disabled={connecting || !connectors[0]}
                onClick={() => connectors[0] && connect({ connector: connectors[0] })}
              >
                {connecting ? t("common.connecting") : t("onboarding.connectWallet")}
              </button>
            )}
          </div>
          <p className="ob-legal">{t("onboarding.legal")}</p>
        </section>

        <p className="ob-hint">{hint}</p>

        <button
          type="button"
          className="btn primary ob-primary"
          disabled={busy || connecting || (isConnected && !validRef && !bound)}
          onClick={() => void onPrimary()}
        >
          {primaryLabel}
        </button>

        {hash && (
          <p className="ob-step-note">
            <a
              href={`https://bscscan.com/tx/${hash}`}
              target="_blank"
              rel="noreferrer"
              className="ob-link"
            >
              {t("onboarding.viewTx")}
            </a>
            {" · "}
            <button
              type="button"
              className="ob-link"
              onClick={() => {
                reset();
                setSimulating(false);
                startedAt.current = null;
                refetchReferrer();
                setLocalError(null);
              }}
            >
              {t("onboarding.retry")}
            </button>
          </p>
        )}

        {displayError && <p className="ob-error">{displayError}</p>}

        <div className="ob-footer">
          <button type="button" className="ob-skip" onClick={softSkip}>
            {t("onboarding.skip")}
          </button>
          <p className="ob-footer-note">{t("onboarding.footerNote")}</p>
        </div>
      </div>
    </div>
  );
}
