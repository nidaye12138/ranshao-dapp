/** Per-address first-visit onboarding persistence (localStorage). */

export type OnboardingRecord = {
  /** Wallet connected + referrer bound (or root) — gate dismissed permanently for this address. */
  completed?: boolean;
  /** Soft-skip: modal dismissed but buy / 权重 / 收益 stay blocked until bound. */
  softSkipped?: boolean;
  /** Activation coach (100U burn) dismissed. */
  coachDismissed?: boolean;
  /** Last known bound referrer (display / resume). */
  referrer?: string;
  updatedAt?: number;
};

const PREFIX = "umidor:onboarding:v1:";

function key(address: string): string {
  return `${PREFIX}${address.toLowerCase()}`;
}

export function readOnboarding(address: string | undefined): OnboardingRecord {
  if (!address || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key(address));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as OnboardingRecord;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeOnboarding(address: string, patch: Partial<OnboardingRecord>): OnboardingRecord {
  const next: OnboardingRecord = {
    ...readOnboarding(address),
    ...patch,
    updatedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(key(address), JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
  return next;
}

/** Capture invite ref from URL for any tab (not only home). */
export function captureRefFromSearch(search: string | URLSearchParams): string | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const ref = params.get("ref");
  if (!ref) return null;
  return ref.trim();
}

export const PENDING_REF_KEY = "umidor:pendingRef";

export function stashPendingRef(ref: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_REF_KEY, ref);
  } catch {
    /* ignore */
  }
}

export function readPendingRef(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(PENDING_REF_KEY);
  } catch {
    return null;
  }
}
