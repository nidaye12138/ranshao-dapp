"use client";

import { useOnboardingOptional } from "@/components/OnboardingProvider";
import { useI18n } from "@/lib/i18n";

export type GateFeature = "buy" | "weight" | "earnings";

/** Soft-skip banner — reopen onboarding until wallet + referrer bound. */
export function FeatureGateBanner({ feature }: { feature: GateFeature }) {
  const gate = useOnboardingOptional();
  const { t } = useI18n();
  if (!gate || gate.featuresUnlocked) return null;

  const featureLabel =
    feature === "buy"
      ? t("gate.featureBuy")
      : feature === "weight"
        ? t("gate.featureWeight")
        : t("gate.featureEarnings");

  return (
    <div className="ob-soft-banner" role="status">
      <p>{t("gate.softBanner", { feature: featureLabel })}</p>
      <button type="button" className="btn primary" onClick={gate.reopenGate}>
        {t("gate.completeBind")}
      </button>
    </div>
  );
}
