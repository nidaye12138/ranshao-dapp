/** Server-side GraphQL helper for The Graph endpoint. */

export function graphUrl(): string | undefined {
  const u = process.env.GRAPH_URL?.trim();
  return u || undefined;
}

export async function graphQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<{ data: T } | { error: string }> {
  const url = graphUrl();
  if (!url) return { error: "unconfigured" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return { error: `graph HTTP ${res.status}` };
    }
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) {
      return { error: json.errors.map((e) => e.message).join("; ") };
    }
    if (!json.data) return { error: "empty graph response" };
    return { data: json.data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "graph fetch failed" };
  }
}

export function formatUsdRaw(raw: string | number | bigint, decimals = 18): string {
  try {
    const v = typeof raw === "bigint" ? raw : BigInt(String(raw));
    const neg = v < 0n;
    const abs = neg ? -v : v;
    const base = 10n ** BigInt(decimals);
    const whole = abs / base;
    const frac = abs % base;
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 4);
    const withCommas = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const body = fracStr ? `${withCommas}.${fracStr}` : withCommas;
    return neg ? `-${body}` : body;
  } catch {
    return "0";
  }
}

export function formatTokenRaw(raw: string | number | bigint, symbol: string, decimals = 18): string {
  return `${formatUsdRaw(raw, decimals)} ${symbol}`;
}

export function tsToLocal(ts: string | number): string {
  const n = typeof ts === "string" ? Number(ts) : ts;
  if (!Number.isFinite(n) || n <= 0) return "—";
  const d = new Date(n * 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
