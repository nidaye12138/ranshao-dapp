import { decodeAbiParameters, parseAbiParameters, type Hex } from "viem";

type Locale = "zh" | "en";

const TX: Record<
  Locale,
  {
    insufficientGas: string;
    insufficientGasMainnet: string;
    rejected: string;
    alreadyBound: string;
    self: string;
    notInTree: string;
    zero: string;
    cycle: string;
    unknownRpc: string;
    unknownRpcMainnet: string;
    wrongNetwork: string;
    wrongNetworkMainnet: string;
    bindFailed: string;
    bindFailedMainnet: string;
  }
> = {
  zh: {
    insufficientGas:
      "钱包 BNB 余额不足，无法支付 Gas。请先领取或转入 Chapel（BSC Testnet）测试 BNB 后再绑定。",
    insufficientGasMainnet: "钱包 BNB 余额不足，无法支付 Gas。请先转入少量 BNB（BSC 主网）后再绑定。",
    rejected: "已取消交易。",
    alreadyBound: "该地址已绑定推荐关系，不可重复绑定。",
    self: "不能绑定自己为邀请人。",
    notInTree: "邀请人尚未入网（非根节点且未绑定），请使用有效邀请链接。",
    zero: "邀请人地址无效。",
    cycle: "绑定会形成环路，请更换邀请人。",
    unknownRpc:
      "交易未能提交（常见原因：BNB Gas 不足，或合约拒绝）。请确认已切到 BSC Testnet 且钱包有测试 BNB。",
    unknownRpcMainnet:
      "交易未能提交（常见原因：BNB Gas 不足，或合约拒绝如已绑定/邀请人无效）。请确认已切到 BSC 主网且钱包有少量 BNB。",
    wrongNetwork: "网络不正确，请切换到 BSC Testnet（Chapel，chainId 97）。",
    wrongNetworkMainnet: "网络不正确，请切换到 BSC 主网（chainId 56）。",
    bindFailed: "绑定失败，请稍后重试。若持续失败，请确认钱包有 Chapel 测试 BNB 并使用有效邀请链接。",
    bindFailedMainnet: "绑定失败，请稍后重试。若持续失败，请确认钱包有 BNB Gas，且邀请人已在推荐树中。",
  },
  en: {
    insufficientGas:
      "Not enough BNB for gas. Get or transfer Chapel (BSC Testnet) test BNB, then bind.",
    insufficientGasMainnet: "Not enough BNB for gas. Transfer a little BNB on BSC mainnet, then bind.",
    rejected: "Transaction cancelled.",
    alreadyBound: "This address already has a referrer and cannot rebind.",
    self: "You cannot bind yourself as referrer.",
    notInTree: "Referrer is not in the tree yet (not root and unbound). Use a valid invite link.",
    zero: "Invalid referrer address.",
    cycle: "Binding would create a cycle. Choose another referrer.",
    unknownRpc:
      "Transaction could not be submitted (often low BNB gas or a contract reject). Confirm BSC Testnet and test BNB.",
    unknownRpcMainnet:
      "Transaction could not be submitted (often low BNB gas or a contract reject such as already bound / invalid referrer). Confirm BSC mainnet and a little BNB.",
    wrongNetwork: "Wrong network — switch to BSC Testnet (Chapel, chainId 97).",
    wrongNetworkMainnet: "Wrong network — switch to BSC mainnet (chainId 56).",
    bindFailed:
      "Bind failed. Retry later. If it keeps failing, confirm Chapel test BNB and a valid invite link.",
    bindFailedMainnet:
      "Bind failed. Retry later. If it keeps failing, confirm BNB for gas and that the referrer is already in the tree.",
  },
};

function isMainnet(chainId?: number): boolean {
  return chainId === 56;
}

/**
 * Map wagmi/viem wallet/RPC failures to short localized copy for the UI.
 * UnknownRpcError is common when MetaMask has 0 gas, or when wallets strip
 * Solidity revert strings from eth_estimateGas (e.g. TokenPocket「无法预估 Gas」).
 */
export function formatTxError(err: unknown, locale: Locale = "zh", chainId?: number): string {
  const raw = stringifyError(err);
  const decoded = decodeEmbeddedErrorString(raw);
  const lower = `${raw} ${decoded ?? ""}`.toLowerCase();
  const tx = TX[locale] ?? TX.zh;
  const main = isMainnet(chainId);

  if (
    /insufficient funds|insufficient balance|exceeds the balance|gas required exceeds|不够支付|余额不足/.test(
      lower,
    )
  ) {
    return main ? tx.insufficientGasMainnet : tx.insufficientGas;
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

  if (
    /unknown rpc error|internal json-rpc error|eth_estimategas|execution reverted|无法预估\s*gas|合约错误/.test(
      lower,
    )
  ) {
    return main ? tx.unknownRpcMainnet : tx.unknownRpc;
  }

  if (/chain mismatch|wrong network|unrecognized chain|switch.*chain/.test(lower)) {
    return main ? tx.wrongNetworkMainnet : tx.wrongNetwork;
  }

  const short = pickShort(err);
  if (short && short.length < 180 && !/docs\.wallet|viem@|version=/.test(short)) {
    return short;
  }

  return main ? tx.bindFailedMainnet : tx.bindFailed;
}

/** Pull Solidity `Error(string)` reason from nested RPC hex when wallets omit plaintext. */
export function decodeEmbeddedErrorString(raw: string): string | null {
  const match = raw.match(/0x08c379a0[0-9a-fA-F]*/);
  if (!match) return null;
  let hex = match[0] as Hex;
  // Trim odd-length / trailing junk from JSON concatenation
  if (hex.length % 2 === 1) hex = hex.slice(0, -1) as Hex;
  try {
    const [msg] = decodeAbiParameters(parseAbiParameters("string"), `0x${hex.slice(10)}` as Hex);
    return typeof msg === "string" ? msg : null;
  } catch {
    return null;
  }
}

function stringifyError(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const anyErr = err as Error & {
      shortMessage?: string;
      details?: string;
      cause?: unknown;
      data?: { message?: string } | Hex;
    };
    const dataStr =
      typeof anyErr.data === "string"
        ? anyErr.data
        : anyErr.data && typeof anyErr.data === "object" && "message" in anyErr.data
          ? String(anyErr.data.message ?? "")
          : "";
    return [anyErr.shortMessage, anyErr.message, anyErr.details, dataStr, stringifyError(anyErr.cause)]
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
