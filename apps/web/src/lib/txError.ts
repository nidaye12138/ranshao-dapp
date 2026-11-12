type Locale = "zh" | "en";

const TX: Record<
  Locale,
  {
    insufficientGas: string;
    rejected: string;
    alreadyBound: string;
    self: string;
    notInTree: string;
    zero: string;
    cycle: string;
    unknownRpc: string;
    wrongNetwork: string;
    bindFailed: string;
  }
> = {
  zh: {
    insufficientGas:
      "钱包 BNB 余额不足，无法支付 Gas。请先领取或转入 Chapel（BSC Testnet）测试 BNB 后再绑定。",
    rejected: "已取消交易。",
    alreadyBound: "该地址已绑定推荐关系，不可重复绑定。",
    self: "不能绑定自己为邀请人。",
    notInTree: "邀请人尚未入网（非根节点且未绑定），请使用有效邀请链接。",
    zero: "邀请人地址无效。",
    cycle: "绑定会形成环路，请更换邀请人。",
    unknownRpc:
      "交易未能提交（常见原因：BNB Gas 不足，或合约拒绝）。请确认已切到 BSC Testnet 且钱包有测试 BNB。",
    wrongNetwork: "网络不正确，请切换到 BSC Testnet（Chapel，chainId 97）。",
    bindFailed: "绑定失败，请稍后重试。若持续失败，请确认钱包有 Chapel 测试 BNB 并使用有效邀请链接。",
  },
  en: {
    insufficientGas:
      "Not enough BNB for gas. Get or transfer Chapel (BSC Testnet) test BNB, then bind.",
    rejected: "Transaction cancelled.",
    alreadyBound: "This address already has a referrer and cannot rebind.",
    self: "You cannot bind yourself as referrer.",
    notInTree: "Referrer is not in the tree yet (not root and unbound). Use a valid invite link.",
    zero: "Invalid referrer address.",
    cycle: "Binding would create a cycle. Choose another referrer.",
    unknownRpc:
      "Transaction could not be submitted (often low BNB gas or a contract reject). Confirm BSC Testnet and test BNB.",
    wrongNetwork: "Wrong network — switch to BSC Testnet (Chapel, chainId 97).",
    bindFailed:
      "Bind failed. Retry later. If it keeps failing, confirm Chapel test BNB and a valid invite link.",
  },
};

/**
 * Map wagmi/viem wallet/RPC failures to short localized copy for the UI.
 * UnknownRpcError is common when MetaMask has 0 gas on Chapel.
 */
export function formatTxError(err: unknown, locale: Locale = "zh"): string {
  const raw = stringifyError(err);
  const lower = raw.toLowerCase();
  const tx = TX[locale] ?? TX.zh;

  if (
    /insufficient funds|insufficient balance|exceeds the balance|gas required exceeds|不够支付|余额不足/.test(
      lower,
    )
  ) {
    return tx.insufficientGas;
  }

  if (/user rejected|user denied|rejected the request|denied transaction|用户拒绝/.test(lower)) {
    return tx.rejected;
  }

  if (/tree:\s*already bound|already bound/.test(lower)) {
    return tx.alreadyBound;
  }
  if (/tree:\s*self|cannot bind self/.test(lower)) {
    return tx.self;
  }
  if (/tree:\s*referrer not in tree|not in tree/.test(lower)) {
    return tx.notInTree;
  }
  if (/tree:\s*zero/.test(lower)) {
    return tx.zero;
  }
  if (/tree:\s*cycle/.test(lower)) {
    return tx.cycle;
  }

  if (/unknown rpc error|internal json-rpc error| eth_estimateGas|execution reverted/.test(lower)) {
    return tx.unknownRpc;
  }

  if (/chain mismatch|wrong network|unrecognized chain|switch.*chain/.test(lower)) {
    return tx.wrongNetwork;
  }

  const short = pickShort(err);
  if (short && short.length < 180 && !/docs\.wallet|viem@|version=/.test(short)) {
    return short;
  }

  return tx.bindFailed;
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
