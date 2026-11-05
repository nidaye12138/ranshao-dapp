import { formatUnits, parseUnits } from "viem";

export function fmtToken(value?: bigint, decimals = 18, digits = 4): string {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, decimals));
  if (!Number.isFinite(n)) return formatUnits(value, decimals);
  return n.toLocaleString("zh-CN", { maximumFractionDigits: digits });
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
