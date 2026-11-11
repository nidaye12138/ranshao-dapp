"use client";

import Link from "next/link";
import { useOnboarding } from "@/components/OnboardingProvider";

/**
 * Post-bind coach: activate 推广 via 100U 权重档 burnTier — not 质押.
 * 质押 unlocks only at 1500U. Zero UMplan → Swap buy CTA.
 */
export function ActivationCoach() {
  const { showCoach, dismissCoach, umplanBalance } = useOnboarding();

  if (!showCoach) return null;

  const noBalance = umplanBalance === undefined || umplanBalance === 0n;

  return (
    <div className="ob-overlay ob-overlay-coach" role="dialog" aria-modal="true" aria-labelledby="coach-title">
      <div className="ob-modal ob-coach">
        <p className="ob-coach-kicker">下一步 · 激活推广</p>
        <h2 id="coach-title" className="ob-coach-title">
          选择 <span>100U</span> 权重档并销毁
        </h2>
        <p className="ob-coach-body">
          激活推广 = 在「权重」页用<strong>档位按钮</strong>完成至少 <strong>100U</strong> 的权重销毁（burnTier）。
          这不是质押；质押台仅在完成 <strong>1500U</strong> 档位销毁后解锁。
        </p>

        {noBalance ? (
          <div className="ob-coach-alert">
            <p>当前钱包 UMplan 余额为 0，请先在 Swap 买入后再回来激活。</p>
            <div className="ob-coach-actions">
              <Link href="/swap" className="btn primary" onClick={dismissCoach}>
                去 Swap 买入
              </Link>
              <button type="button" className="btn ghost" onClick={dismissCoach}>
                稍后再说
              </button>
            </div>
          </div>
        ) : (
          <div className="ob-coach-actions">
            <Link href="/promo" className="btn primary" onClick={dismissCoach}>
              去权重 · 选 100U 档
            </Link>
            <button type="button" className="btn ghost" onClick={dismissCoach}>
              稍后再说
            </button>
          </div>
        )}

        <p className="ob-coach-foot">激活后即可在「我的」生成邀请链接，发展直推成员。</p>
      </div>
    </div>
  );
}
