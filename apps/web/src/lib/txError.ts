/**
 * Map wagmi/viem wallet/RPC failures to short Chinese copy for the UI.
 * UnknownRpcError is common when MetaMask has 0 gas on Chapel.
 */
export function formatTxError(err: unknown): string {
  const raw = stringifyError(err);
  const lower = raw.toLowerCase();

  if (
    /insufficient funds|insufficient balance|exceeds the balance|gas required exceeds|不够支付|余额不足/.test(
      lower,
    )
  ) {
    return "钱包 BNB 余额不足，无法支付 Gas。请先领取或转入 Chapel（BSC Testnet）测试 BNB 后再绑定。";
  }

  if (/user rejected|user denied|rejected the request|denied transaction|用户拒绝/.test(lower)) {
    return "已取消交易。";
  }

  if (/tree:\s*already bound|already bound/.test(lower)) {
    return "该地址已绑定推荐关系，不可重复绑定。";
  }
  if (/tree:\s*self|cannot bind self/.test(lower)) {
    return "不能绑定自己为邀请人。";
  }
  if (/tree:\s*referrer not in tree|not in tree/.test(lower)) {
    return "邀请人尚未入网（非根节点且未绑定），请使用有效邀请链接。";
  }
  if (/tree:\s*zero/.test(lower)) {
    return "邀请人地址无效。";
  }
  if (/tree:\s*cycle/.test(lower)) {
    return "绑定会形成环路，请更换邀请人。";
  }

  if (/unknown rpc error|internal json-rpc error| eth_estimateGas|execution reverted/.test(lower)) {
    // Zero-gas wallets often surface as UnknownRpcError before a typed insufficient-funds error.
    return "交易未能提交（常见原因：BNB Gas 不足，或合约拒绝）。请确认已切到 BSC Testnet 且钱包有测试 BNB。";
  }

  if (/chain mismatch|wrong network|unrecognized chain|switch.*chain/.test(lower)) {
    return "网络不正确，请切换到 BSC Testnet（Chapel，chainId 97）。";
  }

  // Prefer shortMessage / cause message when present and not a huge dump
  const short = pickShort(err);
  if (short && short.length < 180 && !/docs\.wallet|viem@|version=/.test(short)) {
    return short;
  }

  return "绑定失败，请稍后重试。若持续失败，请确认钱包有 Chapel 测试 BNB 并使用有效邀请链接。";
}

function stringifyError(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const anyErr = err as Error & {
      shortMessage?: string;
      details?: string;
      cause?: unknown;
      data?: { message?: string };
    };
    return [anyErr.shortMessage, anyErr.message, anyErr.details, stringifyError(anyErr.cause)]
      .filter(Boolean)
      .join(" | ");
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function pickShort(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { shortMessage?: string; message?: string };
  return e.shortMessage || e.message || null;
}
