"use client";

import Link from "next/link";
import { useOnboarding } from "@/components/OnboardingProvider";
import { useI18n } from "@/lib/i18n";

/**
 * Post-bind coach: activate 推广 via 1U 权重档 burnTier — not 质押.
 * 质押 unlocks only at 15U (T4). Zero UMplan → Swap buy CTA.
 */
export function ActivationCoach() {
  const { showCoach, dismissCoach, umplanBalance } = useOnboarding();
  const { t } = useI18n();

  if (!showCoach) return null;

  const noBalance = umplanBalance === undefined || umplanBalance === 0n;

  return (
    <div className="ob-overlay ob-overlay-coach" role="dialog" aria-modal="true" aria-labelledby="coach-title">
      <div className="ob-modal ob-coach">
        <p className="ob-coach-kicker">{t("coach.kicker")}</p>
        <h2 id="coach-title" className="ob-coach-title">
          {t("coach.title")}
        </h2>
        <p className="ob-coach-body">{t("coach.body")}</p>

        {noBalance ? (
          <div className="ob-coach-alert">
            <p>{t("coach.zeroBal")}</p>
            <div className="ob-coach-actions">
              <Link href="/swap" className="btn primary" onClick={dismissCoach}>
                {t("coach.goSwap")}
              </Link>
              <button type="button" className="btn ghost" onClick={dismissCoach}>
                {t("coach.later")}
              </button>
            </div>
          </div>
        ) : (
          <div className="ob-coach-actions">
            <Link href="/promo" className="btn primary" onClick={dismissCoach}>
              {t("coach.goWeight")}
            </Link>
            <button type="button" className="btn ghost" onClick={dismissCoach}>
              {t("coach.later")}
            </button>
          </div>
        )}

        <p className="ob-coach-foot">{t("coach.foot")}</p>
      </div>
    </div>
  );
}
