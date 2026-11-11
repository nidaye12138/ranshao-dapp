"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  useAccount,
  useBalance,
  useConnect,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { isAddress } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { shortAddr } from "@/lib/format";
import { formatTxError } from "@/lib/txError";
import { useOnboarding } from "@/components/OnboardingProvider";
import TreeAbi from "@/lib/abi/ReferralTree.json";
import { stashPendingRef } from "@/lib/onboardingStorage";

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
  } = useOnboarding();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: appChainId });
  const { data: nativeBal } = useBalance({
    address,
    chainId: appChainId,
    query: { enabled: !!address && isConnected },
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const validRef = isAddress(refDraft) && refDraft.toLowerCase() !== address?.toLowerCase();
  const fromInvite = isAddress(refDraft);
  const displayError = localError || (error ? formatTxError(error) : null);

  useEffect(() => {
    if (!isSuccess || !address) return;
    markCompleted(refDraft);
    reset();
  }, [isSuccess, address, refDraft, markCompleted, reset]);

  if (!showGate) return null;

  function onPrimary() {
    setLocalError(null);
    if (!isConnected) {
      if (connectors[0]) connect({ connector: connectors[0] });
      return;
    }
    if (bound) {
      markCompleted(referrer ?? refDraft);
      return;
    }
    if (!validRef) {
      setLocalError("请填写有效的邀请人地址");
      setEditingRef(true);
      return;
    }
    if (!isConfigured) {
      setLocalError("合约未配置，无法绑定");
      return;
    }
    if (refDraft.toLowerCase() === address?.toLowerCase()) {
      setLocalError("不能绑定自己为邀请人");
      return;
    }
    // Preflight: MetaMask often surfaces zero-gas as UnknownRpcError.
    if (nativeBal && nativeBal.value === 0n) {
      setLocalError(
        "钱包 BNB 余额为 0，无法支付 Gas。请先领取 Chapel（BSC Testnet）测试 BNB 后再绑定。",
      );
      return;
    }
    stashPendingRef(refDraft);
    writeContract({
      address: addresses.registry,
      abi: TreeAbi,
      functionName: "bindReferrer",
      args: [refDraft as `0x${string}`],
      chainId: appChainId,
    });
  }

  const primaryLabel = !isConnected
    ? connecting
      ? "连接中…"
      : "请先连接钱包"
    : isPending || confirming
      ? "确认中…"
      : bound
        ? "进入 Umidor"
        : "确认绑定并进入";

  const hint = !isConnected
    ? "请先连接钱包，再确认绑定推荐关系。"
    : !validRef
      ? "请确认邀请人地址后再绑定（仅可绑定一次）。"
      : "推荐关系仅可绑定一次，确认后不可更换。";

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="ob-modal">
        <div className="ob-hero">
          <div className="ob-logo-wrap">
            <Image src="/umidor-logo.png" alt="" width={56} height={54} className="ob-logo" priority />
          </div>
          <h1 id="ob-title" className="ob-title">
            欢迎进入 <span>Umidor</span>
          </h1>
          <p className="ob-sub">完成钱包连接与推荐关系绑定后即可进入</p>
        </div>

        {/* Layout matches visual: 推荐关系 then 钱包; action order still wallet-first */}
        <section className="ob-step">
          <div className="ob-step-head">
            <span className="ob-step-n n1">1</span>
            <span className="ob-step-label">推荐关系</span>
            {fromInvite && !editingRef ? (
              <span className="ob-pill ok">邀请链接已带入</span>
            ) : (
              <span className="ob-pill">待确认</span>
            )}
          </div>

          {editingRef ? (
            <label className="ob-edit-field">
              <span>邀请人地址 / 推荐码</span>
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
                  if (isAddress(refDraft)) {
                    stashPendingRef(refDraft);
                    setEditingRef(false);
                  }
                }}
              >
                使用此地址
              </button>
            </label>
          ) : (
            <div className="ob-inviter">
              <div className="ob-inviter-icon" aria-hidden>
                推
              </div>
              <div className="ob-inviter-body">
                <div className="ob-inviter-name">
                  邀请人 {fromInvite ? shortAddr(refDraft) : "未指定"}
                </div>
                <div className="ob-inviter-ref">
                  {fromInvite ? `ref=${refDraft.slice(0, 10)}…` : "请通过邀请链接进入或手动填写"}
                </div>
              </div>
            </div>
          )}

          <p className="ob-step-note">
            推荐关系<strong>仅可绑定一次，绑定后不可更换</strong>。你的直推业绩将计入该邀请人名下。
          </p>
          {!editingRef && (
            <button type="button" className="ob-link ob-link-end" onClick={() => setEditingRef(true)}>
              修改推荐码
            </button>
          )}
        </section>

        <section className="ob-step">
          <div className="ob-step-head">
            <span className="ob-step-n n2">2</span>
            <span className="ob-step-label">绑定钱包</span>
            <span className={isConnected ? "ob-pill ok" : "ob-pill muted"}>
              {isConnected ? "已连接" : "未连接"}
            </span>
          </div>
          <div className="ob-wallet-row">
            <div className="ob-wallet-copy">
              <span className="ob-wallet-ico" aria-hidden>
                ⌁
              </span>
              <span>{isConnected && address ? shortAddr(address) : "需连接钱包后才能进入 DApp"}</span>
            </div>
            {!isConnected && (
              <button
                type="button"
                className="btn primary ob-wallet-btn"
                disabled={connecting || !connectors[0]}
                onClick={() => connectors[0] && connect({ connector: connectors[0] })}
              >
                {connecting ? "连接中…" : "连接钱包"}
              </button>
            )}
          </div>
          <p className="ob-legal">
            连接即表示同意《用户协议》与《隐私政策》。本应用仅读取公开地址，不会托管私钥。
          </p>
        </section>

        <p className="ob-hint">{hint}</p>

        <button
          type="button"
          className="btn primary ob-primary"
          disabled={isPending || confirming || connecting || (isConnected && !validRef && !bound)}
          onClick={onPrimary}
        >
          {primaryLabel}
        </button>

        {displayError && <p className="ob-error">{displayError}</p>}

        <div className="ob-footer">
          <button type="button" className="ob-skip" onClick={softSkip}>
            跳过将无法使用买入、权重与收益功能
          </button>
          <p className="ob-footer-note">如有问题请重新打开邀请人下发的邀请链接</p>
        </div>
      </div>
    </div>
  );
}
