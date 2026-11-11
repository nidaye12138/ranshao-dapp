"use client";

import { createContext, useContext, Suspense, type ReactNode } from "react";
import { useOnboardingGate, type OnboardingGateState } from "@/lib/useOnboardingGate";
import { OnboardingGate } from "@/components/OnboardingGate";
import { ActivationCoach } from "@/components/ActivationCoach";

const OnboardingContext = createContext<OnboardingGateState | null>(null);

function OnboardingProviderInner({ children }: { children: ReactNode }) {
  const gate = useOnboardingGate();
  return (
    <OnboardingContext.Provider value={gate}>
      {children}
      <OnboardingGate />
      <ActivationCoach />
    </OnboardingContext.Provider>
  );
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <OnboardingProviderInner>{children}</OnboardingProviderInner>
    </Suspense>
  );
}

export function useOnboarding(): OnboardingGateState {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}

/** Safe for soft banners — returns null outside provider / during Suspense fallback. */
export function useOnboardingOptional(): OnboardingGateState | null {
  return useContext(OnboardingContext);
}
