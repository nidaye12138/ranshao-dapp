"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { zeroAddress } from "viem";
import { addresses, isConfigured } from "@/lib/addresses";
import { appChainId } from "@/lib/chain";
import { toChecksumAddress } from "@/lib/addressUtils";
import { useMounted } from "@/lib/useMounted";
import TreeAbi from "@/lib/abi/ReferralTree.json";
import DivAbi from "@/lib/abi/DividendPools.json";
import ERC20Abi from "@/lib/abi/ERC20.json";
import {
  captureRefFromSearch,
  readOnboarding,
  readPendingRef,
  stashPendingRef,
  writeOnboarding,
  type OnboardingRecord,
} from "@/lib/onboardingStorage";

export type GatePhase =
  | "loading"
  | "needs_wallet"
  | "needs_bind"
  | "ready"
  | "soft_blocked";

export type OnboardingGateState = {
  phase: GatePhase;
  /** Show welcome modal (not soft-skipped / not completed). */
  showGate: boolean;
  /** Show post-bind activation coach. */
  showCoach: boolean;
  /** Buy / 权重 burn / 收益 interactive actions allowed. */
  featuresUnlocked: boolean;
  bound: boolean;
  isRoot: boolean;
  referrer: string | null;
  refDraft: string;
  setRefDraft: (v: string) => void;
  editingRef: boolean;
  setEditingRef: (v: boolean) => void;
  umplanBalance: bigint | undefined;
  activated: boolean;
  local: OnboardingRecord;
  markCompleted: (referrer?: string) => void;
  softSkip: () => void;
  reopenGate: () => void;
  dismissCoach: () => void;
  openCoach: () => void;
  /** Re-read on-chain referrer (after bind tx when receipt poll stalls). */
  refetchReferrer: () => void;
};

/**
 * First-visit gate: connect → bind referrer (once) → enter.
 * Soft-skip blocks buy / 权重 / 收益 until wallet + referrer bound (or root).
 */
export function useOnboardingGate(): OnboardingGateState {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const search = useSearchParams();
  const [local, setLocal] = useState<OnboardingRecord>({});
  const [refDraft, setRefDraft] = useState("");
  const [editingRef, setEditingRef] = useState(false);
  const [forceCoach, setForceCoach] = useState(false);

  // Persist ?ref= for any landing tab (checksum-tolerant — invite links often mishandle EIP-55)
  useEffect(() => {
    if (!mounted) return;
    const fromUrl = captureRefFromSearch(search);
    const urlRef = toChecksumAddress(fromUrl);
    if (urlRef) {
      stashPendingRef(urlRef);
      setRefDraft(urlRef);
    } else {
      const pending = toChecksumAddress(readPendingRef());
      if (pending) setRefDraft(pending);
    }
  }, [mounted, search]);

  useEffect(() => {
    if (!mounted || !address) {
      setLocal({});
      return;
    }
    setLocal(readOnboarding(address));
  }, [mounted, address]);

  const enabled = mounted && isConfigured && !!address;

  const {
    data: myReferrer,
    isFetched: referrerFetched,
    isError: referrerError,
    refetch: refetchReferrerQuery,
  } = useReadContract({
    address: addresses.registry,
    abi: TreeAbi,
    functionName: "referrerOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled, refetchInterval: enabled ? 12_000 : false },
  });

  const refetchReferrer = useCallback(() => {
    void refetchReferrerQuery();
  }, [refetchReferrerQuery]);

  const { data: rootFlag, isFetched: rootFetched, isError: rootError } = useReadContract({
    address: addresses.registry,
    abi: TreeAbi,
    functionName: "isRoot",
    args: [address!],
    chainId: appChainId,
    query: { enabled, refetchInterval: enabled ? 12_000 : false },
  });

  // RPC blips must not strand users on the gate after a successful bind
  useEffect(() => {
    if (!enabled || (!referrerError && !rootError)) return;
    const id = window.setInterval(() => {
      void refetchReferrerQuery();
    }, 5_000);
    return () => window.clearInterval(id);
  }, [enabled, referrerError, rootError, refetchReferrerQuery]);

  const { data: activated } = useReadContract({
    address: addresses.dividends,
    abi: DivAbi,
    functionName: "isActivated",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const { data: umplanBalance } = useReadContract({
    address: addresses.token,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [address!],
    chainId: appChainId,
    query: { enabled },
  });

  const bound = !!(myReferrer && (myReferrer as string) !== zeroAddress);
  const isRoot = !!rootFlag;
  const referrer = bound ? (myReferrer as string) : null;
  const onChainOk = bound || isRoot;

  // Sync on-chain bind → localStorage complete
  useEffect(() => {
    if (!mounted || !address || !enabled) return;
    if (!referrerFetched || !rootFetched) return;
    if (onChainOk && !local.completed) {
      const next = writeOnboarding(address, {
        completed: true,
        softSkipped: false,
        referrer: referrer ?? local.referrer,
      });
      setLocal(next);
    }
  }, [mounted, address, enabled, referrerFetched, rootFetched, onChainOk, referrer, local.completed, local.referrer]);

  const markCompleted = useCallback(
    (ref?: string) => {
      if (!address) return;
      const next = writeOnboarding(address, {
        completed: true,
        softSkipped: false,
        referrer: ref ?? referrer ?? undefined,
      });
      setLocal(next);
      setForceCoach(true);
    },
    [address, referrer],
  );

  const softSkip = useCallback(() => {
    if (address) {
      const next = writeOnboarding(address, { softSkipped: true });
      setLocal(next);
    } else {
      // Pre-wallet skip: remember for session via a global soft flag
      try {
        window.sessionStorage.setItem("umidor:softSkipNoWallet", "1");
      } catch {
        /* ignore */
      }
      setLocal((prev) => ({ ...prev, softSkipped: true }));
    }
  }, [address]);

  const reopenGate = useCallback(() => {
    if (address) {
      const next = writeOnboarding(address, { softSkipped: false });
      setLocal(next);
    } else {
      try {
        window.sessionStorage.removeItem("umidor:softSkipNoWallet");
      } catch {
        /* ignore */
      }
      setLocal((prev) => ({ ...prev, softSkipped: false }));
    }
  }, [address]);

  const dismissCoach = useCallback(() => {
    if (!address) return;
    const next = writeOnboarding(address, { coachDismissed: true });
    setLocal(next);
    setForceCoach(false);
  }, [address]);

  const openCoach = useCallback(() => {
    if (!address) return;
    const next = writeOnboarding(address, { coachDismissed: false });
    setLocal(next);
    setForceCoach(true);
  }, [address]);

  const softSkipped =
    !!local.softSkipped ||
    (!address &&
      mounted &&
      typeof window !== "undefined" &&
      (() => {
        try {
          return window.sessionStorage.getItem("umidor:softSkipNoWallet") === "1";
        } catch {
          return false;
        }
      })());

  const phase: GatePhase = useMemo(() => {
    if (!mounted) return "loading";
    if (!isConnected) return softSkipped ? "soft_blocked" : "needs_wallet";
    if (!enabled || !referrerFetched || !rootFetched || referrerError || rootError) return "loading";
    if (onChainOk || local.completed) return "ready";
    if (softSkipped) return "soft_blocked";
    return "needs_bind";
  }, [
    mounted,
    isConnected,
    enabled,
    referrerFetched,
    rootFetched,
    referrerError,
    rootError,
    onChainOk,
    local.completed,
    softSkipped,
  ]);

  const featuresUnlocked = onChainOk || !!local.completed;

  const showGate = Boolean(
    mounted &&
      !featuresUnlocked &&
      !softSkipped &&
      (phase === "needs_wallet" || phase === "needs_bind" || phase === "loading") &&
      (phase !== "loading" || !isConnected),
  );

  const showCoach = Boolean(
    mounted &&
      featuresUnlocked &&
      isConnected &&
      !activated &&
      (forceCoach || (!!local.completed && !local.coachDismissed)),
  );

  return {
    phase,
    showGate,
    showCoach,
    featuresUnlocked,
    bound,
    isRoot,
    referrer,
    refDraft,
    setRefDraft,
    editingRef,
    setEditingRef,
    umplanBalance: umplanBalance as bigint | undefined,
    activated: !!activated,
    local,
    markCompleted,
    softSkip,
    reopenGate,
    dismissCoach,
    openCoach,
    refetchReferrer,
  };
}
