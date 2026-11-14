import { formatUnits, parseUnits } from "viem";

/** Deterministic token format — avoid `toLocaleString` SSR/client locale drift. */
export function fmtToken(value?: bigint, decimals = 18, digits = 4): string {
  if (value === undefined) return "—";
  const raw = formatUnits(value, decimals);
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const neg = n < 0;
  const abs = Math.abs(n);
  const fixed = abs.toFixed(digits);
  const [intPart, fracPart = ""] = fixed.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = fracPart.replace(/0+$/, "");
  const body = frac ? `${withCommas}.${frac}` : withCommas;
  return neg ? `-${body}` : body;
}

export function parseAmount(input: string, decimals = 18): bigint {
  const cleaned = input.trim();
  if (!cleaned) return 0n;
  return parseUnits(cleaned, decimals);
}

export function shortAddr(addr?: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Masked wallet for team lists: `0xabcd****1234`. */
export function maskAddr(addr?: string): string {
  if (!addr || addr.length < 10) return addr || "";
  const hex = addr.startsWith("0x") || addr.startsWith("0X") ? addr.slice(2) : addr;
  if (hex.length < 8) return addr;
  return `0x${hex.slice(0, 4)}****${hex.slice(-4)}`;
}
