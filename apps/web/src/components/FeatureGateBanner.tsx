"use client";

import { useOnboardingOptional } from "@/components/OnboardingProvider";

/** Soft-skip banner — reopen onboarding until wallet + referrer bound. */
export function FeatureGateBanner({ feature }: { feature: "买入" | "权重" | "收益" }) {
  const gate = useOnboardingOptional();
  if (!gate || gate.featuresUnlocked) return null;

  return (
    <div className="ob-soft-banner" role="status">
      <p>
        请先连接钱包并绑定邀请人后，才能使用{feature}功能。
      </p>
      <button type="button" className="btn primary" onClick={gate.reopenGate}>
        完成绑定
      </button>
    </div>
  );
}
