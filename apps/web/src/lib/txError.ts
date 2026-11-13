type Locale = "zh" | "en";

const TX: Record<
  Locale,
  {
    insufficientGas: string;
    insufficientAllowance: string;
    rejected: string;
    alreadyBound: string;
    self: string;
    notInTree: string;
    zero: string;
    cycle: string;
    unknownRpc: string;
    wrongNetwork: string;
    contractRevert: string;
    bindFailed: string;
  }
> = {
  zh: {
    insufficientGas:
      "钱包 BNB 不足以支付 Gas。请确认已切到 BNB Chain 主网（chainId 56），并充入少量 BNB。",
    insufficientAllowance:
      "代币授权额度不足。请先点「授权」（建议一次授权到最大额度），再确认权重销毁 / 买卖。授权不足时钱包常显示「无法预估 Gas」。",
    rejected: "已取消交易。",
    alreadyBound: "该地址已绑定推荐关系，不可重复绑定。",
    self: "不能绑定自己为邀请人。",
    notInTree: "邀请人尚未入网（非根节点且未绑定），请使用有效邀请链接。",
    zero: "邀请人地址无效。",
    cycle: "绑定会形成环路，请更换邀请人。",
    unknownRpc:
      "交易未能提交（常见：BNB Gas 不足、未授权、余额不足、或合约拒绝）。钱包若提示「无法预估 Gas」，多半是授权不足或 UMplan 余额不够本档销毁。",
    wrongNetwork: "网络不正确，请切换到 BNB Chain 主网（BSC，chainId 56）。",
    contractRevert: "合约拒绝了交易。请检查余额、授权与滑点后重试。",
    bindFailed: "操作失败，请稍后重试。若持续失败，请确认主网 BNB 与授权状态。",
  },
  en: {
    insufficientGas:
      "Not enough BNB for gas. Switch to BNB Chain mainnet (56) and hold a little BNB.",
    insufficientAllowance:
      "Token allowance too low. Tap Approve (max once), then confirm. Wallets often show「cannot estimate gas」when allowance is short.",
    rejected: "Transaction cancelled.",
    alreadyBound: "This address already has a referrer and cannot rebind.",
    self: "You cannot bind yourself as referrer.",
    notInTree: "Referrer is not in the tree yet (not root and unbound). Use a valid invite link.",
    zero: "Invalid referrer address.",
    cycle: "Binding would create a cycle. Choose another referrer.",
    unknownRpc:
      "Transaction could not be submitted (gas, missing approve, low UMplan balance, or contract reject). 「Cannot estimate gas」usually means allowance or balance.",
    wrongNetwork: "Wrong network — switch to BNB Chain mainnet (BSC, chainId 56).",
    contractRevert: "Contract rejected the trade. Check balance, allowance, and slippage.",
    bindFailed: "Action failed. Retry later; confirm mainnet BNB and token approval.",
  },
};

/**
 * Map wagmi/viem wallet/RPC failures to short localized copy for the UI.
 * Mainnet copy — do not mention Chapel/Testnet.
 */
export function formatTxError(err: unknown, locale: Locale = "zh"): string {
  const raw = stringifyError(err);
  const lower = raw.toLowerCase();
  const tx = TX[locale] ?? TX.zh;

  if (
    /insufficient allowance|transfer amount exceeds allowance|erc20:\s*insufficient allowance|无法预估\s*gas|cannot estimate gas|gas estimation failed|estimate gas/.test(
      lower,
    )
  ) {
    // TP/MetaMask often wraps allowance reverts as「无法预估 Gas」.
    if (
      /insufficient allowance|exceeds allowance|erc20:\s*insufficient allowance|无法预估|cannot estimate|estimation failed|estimate gas/.test(
        lower,
      )
    ) {
      // If the payload also screams balance, prefer balance copy below after this check when only balance.
      if (!/transfer amount exceeds balance|erc20:\s*transfer amount exceeds/.test(lower)) {
        return tx.insufficientAllowance;
      }
    }
  }

  if (
    /insufficient funds|insufficient balance|exceeds the balance|gas required exceeds|不够支付|余额不足/.test(
      lower,
    )
  ) {
    // Prefer gas copy when message looks like native gas; ERC20 balance often says "transfer amount exceeds balance"
    if (/transfer amount exceeds balance|erc20:\s*transfer amount exceeds|余额不足/.test(lower)) {
      return locale === "zh"
        ? "UMplan 余额不足本档销毁所需数量。请先 Swap 买入或改选较低档位。"
        : "Not enough UMplan for this burn tier. Buy on Swap or pick a lower tier.";
    }
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

  if (/chain mismatch|wrong network|unrecognized chain|switch.*chain/.test(lower)) {
    return tx.wrongNetwork;
  }

  // Prefer concrete revert reason over generic unknown-RPC / Testnet-era copy.
  const revert = extractRevert(raw);
  if (revert) {
    if (/insufficient allowance/i.test(revert)) return tx.insufficientAllowance;
    if (/no usdt liq|slip|fot|dust|hop/i.test(revert)) {
      return locale === "zh" ? `合约拒绝：${revert}` : `Contract revert: ${revert}`;
    }
    return locale === "zh" ? `合约拒绝：${revert}` : `Contract revert: ${revert}`;
  }

  if (/unknown rpc error|internal json-rpc error|eth_estimategas/.test(lower)) {
    return tx.unknownRpc;
  }

  if (/execution reverted/.test(lower)) {
    return tx.contractRevert;
  }

  const short = pickShort(err);
  if (short && short.length < 180 && !/docs\.wallet|viem@|version=/.test(short)) {
    return short;
  }

  return tx.bindFailed;
}

function extractRevert(raw: string): string | null {
  const m =
    /execution reverted:\s*([^\n|]+)/i.exec(raw) ||
    /reverted with reason string\s+'([^']+)'/i.exec(raw) ||
    /reverted with custom error[^:]*:\s*([^\n|]+)/i.exec(raw);
  if (!m) return null;
  return m[1].trim().replace(/\.$/, "");
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
