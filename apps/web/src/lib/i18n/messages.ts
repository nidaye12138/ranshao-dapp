import type { Locale } from "./types";

/** Nested string dictionary; arrays held under dedicated sections. */
export type MessageTree = {
  common: {
    loading: string;
    connectWalletFirst: string;
    confirming: string;
    approve: string;
    max: string;
    all: string;
    connecting: string;
    bindWallet: string;
    contractsUnconfigured: string;
    rewardTokenFallback: string;
  };
  header: {
    homeAria: string;
    switchChapel: string;
    switchBsc: string;
    switchNetwork: string;
    localeZh: string;
    localeEn: string;
    localeAria: string;
  };
  nav: {
    aria: string;
    home: string;
    swap: string;
    weight: string;
    mine: string;
  };
  gate: {
    featureBuy: string;
    featureWeight: string;
    featureEarnings: string;
    softBanner: string;
    completeBind: string;
  };
  onboarding: {
    title: string;
    sub: string;
    stepRef: string;
    stepWallet: string;
    inviteImported: string;
    pendingConfirm: string;
    inviterAddr: string;
    useThisAddr: string;
    inviter: string;
    unspecified: string;
    enterViaInvite: string;
    refNote: string;
    editRef: string;
    connected: string;
    notConnected: string;
    needWallet: string;
    connectWallet: string;
    legal: string;
    hintConnect: string;
    hintConfirmRef: string;
    hintOnce: string;
    primaryConnect: string;
    primaryEnter: string;
    primaryBindEnter: string;
    skip: string;
    footerNote: string;
    errInvalidRef: string;
    errUnconfigured: string;
    errSelf: string;
    errZeroGas: string;
    simulating: string;
    waitingWallet: string;
    confirmingOnChain: string;
    errTimeout: string;
    viewTx: string;
    retry: string;
  };
  coach: {
    kicker: string;
    title: string;
    body: string;
    zeroBal: string;
    goSwap: string;
    goWeight: string;
    later: string;
    foot: string;
  };
  home: {
    viewRules: string;
    noticeTag: string;
    loadingAnn: string;
    priceLabel: string;
    priceExtra: string;
    burnedLabel: string;
    burnedExtra: string;
    boardTitle: string;
    boardSub: string;
    boardByDirects: string;
    boardUnconfigured: string;
    boardLoading: string;
    noData: string;
    directsCount: string;
    myInviter: string;
    connectToBind: string;
    inviterPrefix: string;
    referrerAddr: string;
    bindReferrer: string;
    bindOk: string;
    tokenInfo: string;
    tokenInfoAria: string;
    supply: string;
    circulating: string;
    chain: string;
    feeDefault: string;
    feeLabel: string;
    rulesTitle: string;
    slides: { id: string; title: string; subtitle: string; tone: string }[];
    announcements: { id: string; text: string }[];
    rules: string[];
  };
  swap: {
    buySellAria: string;
    buy: string;
    sell: string;
    payUsdt: string;
    sellUmplan: string;
    receive: string;
    feeRow: string;
    slip: string;
    buyInstant: string;
    sellInstant: string;
    feeNote: string;
    bindBeforeTrade: string;
    confirmBuy: string;
    confirmSell: string;
    usdEquiv: string;
    selfRebate: string;
    buyOk: string;
    sellOk: string;
    approveOk: string;
    buyOkDetail: string;
    sellOkDetail: string;
    sellOkReceived: string;
    sellProceeds: string;
    sellSpotHint: string;
    checkingAllowance: string;
    quotePending: string;
    waitWalletApprove: string;
    waitWalletBuy: string;
    waitWalletSell: string;
    waitingWallet: string;
    confirmingOnChain: string;
    viewTx: string;
    historyTitle: string;
    historyNote: string;
    historyEmpty: string;
    insufficientBal: string;
    needApproveFirst: string;
    enterAmount: string;
    instantTitle: string;
    instantOnly: string;
    noMilestone: string;
    slipNote: string;
  };
  stake: {
    title: string;
    subtitle: string;
    ruleFormula: string;
    ruleExample: string;
    ruleAsset: string;
    ruleRedeem: string;
    rulePool: string;
    eliteMissing: string;
    locked: string;
    unlocked: string;
    amountLabel: string;
    shareLabel: string;
    estimateLabel: string;
    estimateOnChain: string;
    estimateNote: string;
    totalStaked: string;
    confirmStake: string;
    myStake: string;
    redeemable: string;
    locking: string;
    principal: string;
    countdown: string;
    matured: string;
    pendingDiv: string;
    redeemBoth: string;
    claimOnly: string;
    success: string;
    quotaAria: string;
  };
  promo: {
    burnTitle: string;
    burnSub: string;
    tier1: string;
    tier2: string;
    tier3: string;
    tier4: string;
    amountLabel: string;
    tipManual: string;
    usdEquiv: string;
    myTier: string;
    buttonTier: string;
    splitTitle: string;
    contractTag: string;
    splitBurn: string;
    splitBurnPct: string;
    splitMarket: string;
    splitMarketPct: string;
    splitShare: string;
    splitSharePct: string;
    splitPrecip: string;
    splitPrecipPct: string;
    agree: string;
    bindBeforeBurn: string;
    needAgree: string;
    quoteFailed: string;
    needApproveFirst: string;
    confirmWeight: string;
    dataTitle: string;
    globalBurned: string;
    myWeight: string;
    noteSplit: string;
    noteFee: string;
    notePublic: string;
    earningsTitle: string;
    directReward: string;
    indirectReward: string;
    marketReward: string;
    earnAsset: string;
    earnDirect: string;
    earnIndirect: string;
    earnMarket: string;
    earnActivate: string;
    poolsTitle: string;
    poolsSub: string;
    poolOpen: string;
    poolLocked: string;
    poolCaption: string;
    poolCol: string;
    membersCol: string;
    pctCol: string;
    poolActive: string;
    poolTierSmall: string;
    myClaimable: string;
    cooldown: string;
    claimableNow: string;
    hoursLater: string;
    rule: string;
    perDay: string;
    poolPctDoc: string;
    poolShareDoc: string;
    poolFairDoc: string;
    poolClaimDoc: string;
    claimDiv: string;
    success: string;
    pool1: string;
    pool2: string;
    pool3: string;
    pool4: string;
  };
  mine: {
    walletTitle: string;
    totalVal: string;
    valNote: string;
    teamTitle: string;
    teamGraph: string;
    teamUnconfigured: string;
    teamLoading: string;
    teamConnect: string;
    directs: string;
    indirects: string;
    buyVolume: string;
    marketVolume: string;
    qualTitle: string;
    qualOn: string;
    copied: string;
    copy: string;
    copyLink: string;
    myQr: string;
    qrStub: string;
    qualOff: string;
    incomeTitle: string;
    incomeSub: string;
    bindBeforeIncome: string;
    incomeGraph: string;
    incomeUnconfigured: string;
    incomeChain: string;
    tabSwap: string;
    tabLayer: string;
    tabDiv: string;
    totalWithUnit: string;
    layerBreakdownHint: string;
    layerLine: string;
    noDetail: string;
  };
  layers: {
    direct: string;
    indirect: string;
    market: string;
    marketN: string;
  };
  tx: {
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
  };
};

export const messages: Record<Locale, MessageTree> = {
  zh: {
    common: {
      loading: "加载中…",
      connectWalletFirst: "请先连接钱包",
      confirming: "确认中…",
      approve: "授权",
      max: "最大",
      all: "全部",
      connecting: "连接中…",
      bindWallet: "绑定钱包",
      contractsUnconfigured: "合约地址未配置",
      rewardTokenFallback: "奖励币",
    },
    header: {
      homeAria: "Umidor 首页",
      switchChapel: "切换 Chapel",
      switchBsc: "切换 BSC",
      switchNetwork: "切换网络",
      localeZh: "中文",
      localeEn: "EN",
      localeAria: "语言切换",
    },
    nav: {
      aria: "主导航",
      home: "首页",
      swap: "Swap",
      weight: "权重",
      mine: "我的",
    },
    gate: {
      featureBuy: "买入",
      featureWeight: "权重",
      featureEarnings: "收益",
      softBanner: "请先连接钱包并绑定邀请人后，才能使用{feature}功能。",
      completeBind: "完成绑定",
    },
    onboarding: {
      title: "欢迎进入",
      sub: "完成钱包连接与推荐关系绑定后即可进入",
      stepRef: "推荐关系",
      stepWallet: "绑定钱包",
      inviteImported: "邀请链接已带入",
      pendingConfirm: "待确认",
      inviterAddr: "邀请人地址 / 推荐码",
      useThisAddr: "使用此地址",
      inviter: "邀请人",
      unspecified: "未指定",
      enterViaInvite: "请通过邀请链接进入或手动填写",
      refNote: "推荐关系仅可绑定一次，绑定后不可更换。你的直推业绩将计入该邀请人名下。",
      editRef: "修改推荐码",
      connected: "已连接",
      notConnected: "未连接",
      needWallet: "需连接钱包后才能进入 DApp",
      connectWallet: "连接钱包",
      legal: "连接即表示同意《用户协议》与《隐私政策》。本应用仅读取公开地址，不会托管私钥。",
      hintConnect: "请先连接钱包，再确认绑定推荐关系。",
      hintConfirmRef: "请确认邀请人地址后再绑定（仅可绑定一次）。",
      hintOnce: "推荐关系仅可绑定一次，确认后不可更换。",
      primaryConnect: "请先连接钱包",
      primaryEnter: "进入 Umidor",
      primaryBindEnter: "确认绑定并进入",
      skip: "跳过将无法使用买入、权重与收益功能",
      footerNote: "如有问题请重新打开邀请人下发的邀请链接",
      errInvalidRef: "请填写有效的邀请人地址",
      errUnconfigured: "合约未配置，无法绑定",
      errSelf: "不能绑定自己为邀请人",
      errZeroGas: "钱包 BNB 余额为 0，无法支付 Gas。请确认 BNB Chain 主网并充入少量 BNB 后再绑定。",
      simulating: "检查中…",
      waitingWallet: "等待钱包确认…",
      confirmingOnChain: "已提交，正在等待链上确认…",
      errTimeout: "等待超时。若钱包已确认，请刷新页面；绑定成功后会自动进入。也可点「重试」。",
      viewTx: "在 BscScan 查看交易",
      retry: "重试",
    },
    coach: {
      kicker: "下一步 · 激活推广",
      title: "选择 100U 权重档并销毁",
      body: "激活推广 = 在「权重」页用档位按钮完成至少 100U 的权重销毁（burnTier）。这不是质押；质押台仅在完成 1500U 档位销毁后解锁。",
      zeroBal: "当前钱包 UMplan 余额为 0，请先在 Swap 买入后再回来激活。",
      goSwap: "去 Swap 买入",
      goWeight: "去权重 · 选 100U 档",
      later: "稍后再说",
      foot: "激活后即可在「我的」生成邀请链接，发展直推成员。",
    },
    home: {
      viewRules: "查看规则",
      noticeTag: "公告",
      loadingAnn: "加载公告…",
      priceLabel: "实时币价",
      priceExtra: "Pancake 现货价",
      burnedLabel: "权重销毁总量",
      burnedExtra: "UMplan 已永久销毁",
      boardTitle: "全网龙虎榜 TOP10",
      boardSub: "按直推人数排行（销毁不上榜）",
      boardByDirects: "按直推人数（链上/索引）",
      boardUnconfigured: "暂无法读取排行数据，请稍后刷新",
      boardLoading: "加载中…",
      noData: "暂无数据",
      directsCount: "{n} 人直推",
      myInviter: "我的邀请人",
      connectToBind: "连接钱包后查看 / 绑定",
      inviterPrefix: "邀请人",
      referrerAddr: "推荐人地址",
      bindReferrer: "绑定推荐人",
      bindOk: "绑定成功",
      tokenInfo: "代币信息",
      tokenInfoAria: "代币信息四宫格",
      supply: "发行总量 UMplan",
      circulating: "当前流通量",
      chain: "所属公链",
      feeDefault: "3.5% 默认",
      feeLabel: "买卖手续费（≥3%）",
      rulesTitle: "DApp 玩法规则",
      slides: [
        {
          id: "s1",
          title: "四档分红 · 每日可领",
          subtitle: "持有对应权重档位后进入 SPCXB 分红池，24 小时可领一次",
          tone: "b1",
        },
        {
          id: "s2",
          title: "推广奖励即时到账",
          subtitle: "买卖皆享交易方与直推各 0.5%，立刻到账钱包",
          tone: "b2",
        },
        {
          id: "s3",
          title: "通缩模型 · 权重销毁",
          subtitle: "权重订单 30% 销毁 / 50% 市场奖励桶 / 15% 股东 / 5% 变异沉淀池",
          tone: "b3",
        },
      ],
      announcements: [
        {
          id: "1",
          text: "Umidor · UMplan：买入/卖出即时 0.5%+0.5%；权重四档按钮入池。",
        },
        {
          id: "2",
          text: "交易手续费产品承诺 3.5%（协议最低 3%）；成交以合约参数为准。",
        },
        {
          id: "3",
          text: "推广资格：在「权重」点选任意档位按钮燃烧（最低 100U）后解锁邀请链接——非累计买入。",
        },
        {
          id: "4",
          text: "1500U 档位按钮解锁质押台；最短 24h；分红以 UMplan 发放。",
        },
      ],
      rules: [
        "手续费：买入 / 卖出交易收取手续费，协议约定最低 3%，系统参数当前默认 3.5%。",
        "权重分配：权重订单资金按合约固定比例自动执行：30% 打入销毁地址、50% 市场奖励桶、15% 股东、5% 变异沉淀池。",
        "质押分红：达成第四档 1500U 解锁质押权益，质押 UMplan 获得分红配额，分红以 UMplan 币量发放。公式：百 5 总释放量 ÷ 全网总质押 = 每币分红。",
        "币种口径：推广类代币奖励、质押分红均以 UMplan 发放；完成权重销毁后，按所达档位享受对应档次的 SPCXB 分红。",
        "推广奖励：达到 100U 门槛解锁推广资格后，享受直推、间推与市场奖励（直推、间推以外的团队成员统称市场；市场按每层 10% 口径），买入另享 0.5% 即时到账。",
      ],
    },
    swap: {
      buySellAria: "买卖切换",
      buy: "买入",
      sell: "卖出",
      payUsdt: "支付 USDT",
      sellUmplan: "卖出 UMplan",
      receive: "可得 {token}",
      feeRow: "交易手续费 {fee}%（最低 {floor}%）",
      slip: "滑点",
      buyInstant: "买入瞬间，你与你的邀请人各获得买入金额 0.5% 的奖励（USDT），立刻到账钱包。",
      sellInstant: "卖出瞬间，你与你的邀请人各获得卖出金额 0.5% 的奖励（USDT），立刻到账钱包。",
      feeNote:
        "买入 / 卖出：USDT 经 Pancake V3↔SPCXB 再进 UMplan/SPCXB 池；手续费按协议最低 {floor}%、系统默认 {fee}% 口径展示，不参与权重销毁分配。",
      bindBeforeTrade: "请先完成邀请人绑定后再买入 / 卖出",
      confirmBuy: "确认买入",
      confirmSell: "确认卖出",
      usdEquiv: "支付量（USDT）",
      selfRebate: "自返 0.5%",
      buyOk: "买入成功（经 Pancake 多跳），0.5% 奖励即时到账你与邀请人",
      sellOk: "卖出已提交（经 Pancake 多跳），等待链上确认",
      approveOk: "授权成功（一次即可，之后买卖一般不用再授权）。请再点「确认买入/卖出」完成交易。",
      buyOkDetail: "买入成功！自返 0.5% 已到钱包：{reward} {token}（邀请人同步到账）。可在下方「成交记录」查看。",
      sellOkDetail: "卖出成功！自返 0.5% 已到钱包：{reward} {token}。可在下方「成交记录」查看。",
      sellOkReceived: "卖出成功！到账约 {received} {token}（含自返 ≈ {reward}）。按 Pancake 现货结算，不是预言机 0.01。见下方成交记录。",
      sellProceeds: "预计到账（USDT）",
      sellSpotHint: "按 Pancake 现货估算到账约 {amount} {token}（卖出数量是 UMplan 个数，不是 USDT）。授权完成后请点「确认卖出」。",
      checkingAllowance: "正在检查授权额度…",
      quotePending: "现货报价加载中或暂不可用，请稍候再点确认；勿反复点授权。",
      waitWalletApprove: "请在钱包弹窗中确认「授权」（Approve）。未弹窗请检查钱包 App / 浏览器插件。",
      waitWalletBuy: "请在钱包弹窗中确认「买入」交易。未弹窗请检查钱包，勿重复狂点。",
      waitWalletSell: "请在钱包弹窗中确认「卖出」交易。未弹窗请检查钱包，勿重复狂点。",
      waitingWallet: "等待钱包确认…",
      confirmingOnChain: "已提交，正在等待链上确认…",
      viewTx: "在 BscScan 查看交易 →",
      historyTitle: "成交记录（链上）",
      historyNote: "直接读取 Swap 合约事件，不依赖索引。自返 0.5% USDT 已打入钱包余额。",
      historyEmpty: "暂无成交。买入成功后会出现在这里。",
      insufficientBal: "余额不足：买入需钱包持有足够 USDT；当前余额不够支付金额",
      needApproveFirst:
        "首次需授权：允许 Swap 合约扣 USDT/UMplan（链上 ERC-20 规则，无法省略）。请先点下方红色「授权」，钱包确认后再点确认买卖。",
      enterAmount: "请先输入大于 0 的数量",
      instantTitle: "即时奖励说明",
      instantOnly: "仅即时奖：买/卖 → 交易方 0.5% + 直推邀请人 0.5%（USDT）到钱包。",
      noMilestone: "不做累计买入业绩、级别或里程碑奖励。",
      slipNote:
        "成交：V3 USDT/SPCXB + V2 UMplan/SPCXB；滑点展示预设（当前 {slip}%）。产品手续费口径 {fee}%（最低 {floor}%）。",
    },
    stake: {
      title: "质押分红权益",
      subtitle: "1500U 档按钮解锁 · 最短 24h",
      ruleFormula:
        "分红公式：百 5 的总释放量 ÷ 全网总质押量 = 每个质押币的分红（合约 notifyRelease × 5% / totalStaked）。",
      ruleExample:
        "计算示例：本期百 5 释放 500,000 UMplan，全网总质押 25,000,000 UMplan → 每币分红 = 0.02 UMplan；质押 100,000 UMplan 即得 2,000 UMplan。",
      ruleAsset: "币种说明：质押分红以 UMplan 币量发放（本金与分红均为 UMplan）。",
      ruleRedeem:
        "赎回规则：质押最短期限 24 小时，到期后本金与分红可随时取回；可「本金 + 分红」一起领，也可仅领分红继续质押；忘记领取则自动顺延 24 小时并持续计息，想起来时只要历史上已满 24 小时即可随时领取。",
      rulePool:
        "分红池来源：池内 UMplan 来自市场进单——每笔进单只按直推、间推、市场三档发放奖励；邀请链路中超出这三档范围、无对应奖励档次的应付部分，统一注入本池，按质押配额分配。",
      eliteMissing: "EliteStake 地址未配置（NEXT_PUBLIC_ELITE_ADDRESS）。UI 已就绪，待部署后接线。",
      locked:
        "质押权益仅对完成 1500U 档位权重销毁的用户开放；当前未达成，下方质押按钮为灰色不可用，达成后自动点亮。手输金额不计入档位。",
      unlocked: "1500U 档位已达成，质押权益已解锁，可自由选择质押数量。",
      amountLabel: "质押数量（UMplan · 可自由选择）",
      shareLabel: "我的分红配额（占总质押）",
      estimateLabel: "预估每期分红（UMplan）",
      estimateOnChain: "预估每期分红（UMplan · 链上 {token}）",
      estimateNote:
        "预估取自链上已累计未领；新一期数值随 notifyRelease × 5% × 配额更新。分红以 UMplan 计。",
      totalStaked: "全网总质押",
      confirmStake: "确认质押",
      myStake: "我的质押 · 赎回",
      redeemable: "可赎回 · 随时领取",
      locking: "质押期中",
      principal: "质押本金",
      countdown: "本期到期倒计时（最短 24h）",
      matured: "00:00:00 · 已到期",
      pendingDiv: "累计未领分红",
      redeemBoth: "领本金 + 分红",
      claimOnly: "仅领分红 · 顺延",
      success: "质押操作已确认",
      quotaAria: "分红配额与预估",
    },
    promo: {
      burnTitle: "权重销毁 · 档位直扣",
      burnSub: "选择档位燃烧 UMplan（金本位 U），按合约约定比例自动销毁与分配。仅档位按钮计入档位权益。",
      tier1: "档位一",
      tier2: "档位二",
      tier3: "档位三",
      tier4: "解锁质押",
      amountLabel: "燃烧数量（UMplan · 由档位按钮锁定）",
      tipManual: "数量由所选档位 × 合约预言机价自动折算；须点选档位、勾选协议后授权并确认。",
      usdEquiv: "折合 U",
      myTier: "我的档位",
      buttonTier: "按钮T{n}",
      splitTitle: "扣除后资金分配预览",
      contractTag: "比例以合约参数为准",
      splitBurn: "权重销毁",
      splitBurnPct: "30% · 打入销毁地址，永久移出流通",
      splitMarket: "市场奖励",
      splitMarketPct: "50% · 桶内再分直推 / 间推 / 市场",
      splitShare: "股东分红",
      splitSharePct: "15% · 股东池（与 SPCXB 四档分红分属不同模块）",
      splitPrecip: "变异沉淀池",
      splitPrecipPct: "5% · UMplan 沉淀 / 分红储备",
      agree:
        "我已阅读并同意《权重销毁协议》，确认后从钱包扣除所选档位等值 UMplan 并调用合约，需在钱包中授权签名。资金按合约约定比例销毁与分配，不可撤回。",
      bindBeforeBurn: "请先完成邀请人绑定后再进行权重销毁",
      needAgree: "请先勾选协议，再点击授权或确认权重。",
      quoteFailed: "无法按预言机折算档位代币数量，请稍后重试或检查网络。",
      needApproveFirst: "需先授权 UMplan 给销毁合约，再点「确认权重」。",
      confirmWeight: "确认权重",
      dataTitle: "权重数据",
      globalBurned: "全网累计已销毁",
      myWeight: "我的累计权重",
      noteSplit: "权重订单资金按 30% 销毁 / 50% 市场奖励桶 / 15% 股东 / 5% 变异沉淀池自动执行。",
      noteFee: "买卖手续费（最低 3%、默认 3.5%）属交易费用，不计入权重销毁。",
      notePublic: "销毁地址链上公开可查。",
      earningsTitle: "推广收益",
      directReward: "直推奖励",
      indirectReward: "间推奖励",
      marketReward: "市场奖励",
      earnAsset: "币种：推广类奖励均以 UMplan 代币发放，即时到账钱包（汇总来自索引；未配置时显示 0）。",
      earnDirect: "直推：直推成员每笔买入 / 权重进单时，从市场奖励桶（占订单 50%）中按桶内 20%（=订单 10%）即时奖励给你。",
      earnIndirect: "间推：间推成员（即直推成员的直推）进单时，从市场奖励桶中按桶内 10%（=订单 5%）奖励给你。",
      earnMarket: "市场：直推、间推以外的团队成员统称市场；市场业绩按市场每层桶内 10%（=订单 5%）管理奖励口径。",
      earnActivate: "任意档位按钮燃烧（≥100U）即激活，解锁邀请链接（见「我的」）— 非累计买入。",
      poolsTitle: "SPCXB 档位分红",
      poolsSub: "成为对应池的分红股东 · 24h 冷却",
      poolOpen: "已达成档位 T{n}，成为对应池分红股东（最高档，不叠加）。",
      poolLocked:
        "完成权重销毁后，即成为对应分红池的分红股东，按该池占比与同池人数分配 SPCXB；当前尚未达成任何档位。",
      poolCaption: "四池合计 100% · 人数来自链上；人均待释放量索引后填入",
      poolCol: "分红池",
      membersCol: "人数",
      pctCol: "占比",
      poolActive: " · 生效中",
      poolTierSmall: "{tier} 档 · 人均 —",
      myClaimable: "我的 SPCXB 可领",
      cooldown: "冷却",
      claimableNow: "可领取",
      hoursLater: "{h}h 后",
      rule: "规则",
      perDay: "24h / 次",
      poolPctDoc:
        "池占比：四个分红池合计分配总释放的 100% —— 100U 档池占 33.33%，500U 档池与 800U 档池各占 25%，1500U 档池占 16.67%。",
      poolShareDoc:
        "个人实得：你所在池的占比额度 ÷ 同池股东人数。达成哪档权重销毁，就成为哪档池的分红股东，仅计入最高已达档位，不叠加。",
      poolFairDoc:
        "公平性体现：能分多少不只看你在哪个池，更看和你同池的人有多少。青铜池占比最高（33.33%），但门槛最低、可能有几百甚至几千人一起平分，人均反而少；钻石池占比最低（16.67%），但门槛高、同池可能只有几个人，人均反而拿得更多。门槛与人数天然对冲，各档实际收益趋于均衡。",
      poolClaimDoc: "24 小时可领取一次 SPCXB，不领取自动叠加计入下期；同池人数每日随达成情况变动，人均随之实时重算。",
      claimDiv: "领取分红",
      success: "权重成功：已按合约比例销毁与分配",
      pool1: "分红池一 · 青铜池",
      pool2: "分红池二 · 白银池",
      pool3: "分红池三 · 黄金池",
      pool4: "分红池四 · 钻石池",
    },
    mine: {
      walletTitle: "我的钱包",
      totalVal: "总资产估值（USDT）",
      valNote: "含 UMplan×实时价 + USDT；SPCXB / BNB 暂未折算",
      teamTitle: "我的团队",
      teamGraph: "索引聚合",
      teamUnconfigured: "索引未配置（GRAPH_URL）；直推可走链上",
      teamLoading: "加载中…",
      teamConnect: "连接钱包后查看",
      directs: "直推人数",
      indirects: "间推人数",
      buyVolume: "购买总量",
      marketVolume: "市场总业绩",
      qualTitle: "推广资格",
      qualOn: "已激活，可生成专属推广链接（权重档位按钮 · ≥100U）",
      copied: "已复制",
      copy: "复制",
      copyLink: "复制链接",
      myQr: "我的二维码",
      qrStub: "二维码占位 · 专属推广链接二维码即将接入",
      qualOff:
        "需在「权重」完成任意档燃烧（最低 ≥100U，点选档位按钮）才可解锁推广资格并生成专属推广链接——不是累计买入。",
      incomeTitle: "我的收益",
      incomeSub: "质押分红=UMplan · 档位分红=SPCXB",
      bindBeforeIncome: "请先完成邀请人绑定后查看收益明细",
      incomeGraph: "账本来自索引",
      incomeUnconfigured: "索引未配置 — 层奖励/分红明细暂空；Swap 自返可走链上成交",
      incomeChain: "Swap 自返来自链上成交（即时 0.5% USDT 已进钱包）",
      tabSwap: "Swap 推广奖励",
      tabLayer: "层奖励",
      tabDiv: "分红",
      totalWithUnit: "总量（{unit}{layerHint}）",
      layerBreakdownHint: " · 直推/间推/市场",
      layerLine: "直推 {d} / 间推 {i} / 市场 {m}（明细须标市场3…市场9）",
      noDetail: "暂无明细",
    },
    layers: {
      direct: "直推",
      indirect: "间推",
      market: "市场",
      marketN: "市场{n}",
    },
    tx: {
      insufficientGas:
        "钱包 BNB 不足以支付 Gas。请确认已切到 BNB Chain 主网（chainId 56），并充入少量 BNB。",
      rejected: "已取消交易。",
      alreadyBound: "该地址已绑定推荐关系，不可重复绑定。",
      self: "不能绑定自己为邀请人。",
      notInTree: "邀请人尚未入网（非根节点且未绑定），请使用有效邀请链接。",
      zero: "邀请人地址无效。",
      cycle: "绑定会形成环路，请更换邀请人。",
      unknownRpc:
        "交易未能提交（常见：BNB Gas 不足、未授权、或合约拒绝）。请确认 BNB Chain 主网，并查看是否需先授权。",
      wrongNetwork: "网络不正确，请切换到 BNB Chain 主网（BSC，chainId 56）。",
      bindFailed: "操作失败，请稍后重试。若持续失败，请确认主网 BNB 与授权状态。",
    },
  },
  en: {
    common: {
      loading: "Loading…",
      connectWalletFirst: "Connect your wallet first",
      confirming: "Confirming…",
      approve: "Approve",
      max: "Max",
      all: "All",
      connecting: "Connecting…",
      bindWallet: "Connect wallet",
      contractsUnconfigured: "Contracts not configured",
      rewardTokenFallback: "Reward",
    },
    header: {
      homeAria: "Umidor home",
      switchChapel: "Switch to Chapel",
      switchBsc: "Switch to BSC",
      switchNetwork: "Switch network",
      localeZh: "中文",
      localeEn: "EN",
      localeAria: "Language",
    },
    nav: {
      aria: "Main navigation",
      home: "Home",
      swap: "Swap",
      weight: "Weight",
      mine: "Mine",
    },
    gate: {
      featureBuy: "Buy",
      featureWeight: "Weight",
      featureEarnings: "Earnings",
      softBanner: "Connect your wallet and bind a referrer before using {feature}.",
      completeBind: "Finish binding",
    },
    onboarding: {
      title: "Welcome to",
      sub: "Connect your wallet and bind a referrer to enter",
      stepRef: "Referral",
      stepWallet: "Wallet",
      inviteImported: "Invite link applied",
      pendingConfirm: "Pending",
      inviterAddr: "Referrer address / code",
      useThisAddr: "Use this address",
      inviter: "Referrer",
      unspecified: "Not set",
      enterViaInvite: "Open via invite link or enter manually",
      refNote: "Referral can be bound only once and cannot be changed. Your direct volume counts under this referrer.",
      editRef: "Edit referrer code",
      connected: "Connected",
      notConnected: "Not connected",
      needWallet: "Connect a wallet to enter the DApp",
      connectWallet: "Connect wallet",
      legal: "By connecting you agree to the Terms and Privacy Policy. This app only reads public addresses and never holds private keys.",
      hintConnect: "Connect your wallet, then confirm the referral binding.",
      hintConfirmRef: "Confirm the referrer address before binding (once only).",
      hintOnce: "Referral can be bound only once and cannot be changed afterward.",
      primaryConnect: "Connect wallet first",
      primaryEnter: "Enter Umidor",
      primaryBindEnter: "Bind & enter",
      skip: "Skipping locks Buy, Weight, and Earnings",
      footerNote: "If something looks wrong, reopen the invite link from your referrer",
      errInvalidRef: "Enter a valid referrer address",
      errUnconfigured: "Contracts are not configured; binding is unavailable",
      errSelf: "You cannot bind yourself as referrer",
      errZeroGas: "Wallet BNB balance is 0 — cannot pay gas. Use BNB Chain mainnet and hold a little BNB, then bind.",
      simulating: "Checking…",
      waitingWallet: "Waiting for wallet…",
      confirmingOnChain: "Submitted — waiting for on-chain confirmation…",
      errTimeout: "Timed out. If you already confirmed in the wallet, refresh — a successful bind opens the app. Or tap Retry.",
      viewTx: "View on BscScan",
      retry: "Retry",
    },
    coach: {
      kicker: "Next · Activate promo",
      title: "Burn the 100U weight tier",
      body: "Activate promo by completing at least a 100U weight burn with a tier button on Weight (burnTier). This is not staking; the stake desk unlocks only after the 1500U tier burn.",
      zeroBal: "Your UMplan balance is 0. Buy on Swap first, then come back to activate.",
      goSwap: "Go to Swap",
      goWeight: "Go to Weight · 100U",
      later: "Later",
      foot: "After activation you can create an invite link in Mine and grow directs.",
    },
    home: {
      viewRules: "View rules",
      noticeTag: "News",
      loadingAnn: "Loading announcements…",
      priceLabel: "Live price",
      priceExtra: "Pancake spot",
      burnedLabel: "Weight burned total",
      burnedExtra: "UMplan permanently burned",
      boardTitle: "Leaderboard TOP10",
      boardSub: "Ranked by directs (burns do not rank)",
      boardByDirects: "By directs (chain / indexer)",
      boardUnconfigured: "Leaderboard unavailable — refresh shortly",
      boardLoading: "Loading…",
      noData: "No data yet",
      directsCount: "{n} directs",
      myInviter: "My referrer",
      connectToBind: "Connect wallet to view / bind",
      inviterPrefix: "Referrer",
      referrerAddr: "Referrer address",
      bindReferrer: "Bind referrer",
      bindOk: "Bound",
      tokenInfo: "Token info",
      tokenInfoAria: "Token info grid",
      supply: "Total supply UMplan",
      circulating: "Circulating",
      chain: "Chain",
      feeDefault: "3.5% default",
      feeLabel: "Trade fee (≥3%)",
      rulesTitle: "DApp rules",
      slides: [
        {
          id: "s1",
          title: "Four dividend tiers · daily claim",
          subtitle: "Hold a matching weight tier to join the SPCXB pools; claim once every 24h",
          tone: "b1",
        },
        {
          id: "s2",
          title: "Instant promo rewards",
          subtitle: "Buy and sell: trader + direct each get 0.5%, paid to wallet instantly",
          tone: "b2",
        },
        {
          id: "s3",
          title: "Deflation · weight burn",
          subtitle: "Weight orders: 30% burn · 50% market bucket · 15% shareholders · 5% precip pool",
          tone: "b3",
        },
      ],
      announcements: [
        {
          id: "1",
          text: "Umidor · UMplan: buy/sell instant 0.5%+0.5%; four weight-tier buttons enter pools.",
        },
        {
          id: "2",
          text: "Trade fee product promise 3.5% (protocol floor 3%); on-chain params prevail.",
        },
        {
          id: "3",
          text: "Promo unlock: burn any Weight tier button (min 100U) — not cumulative buys.",
        },
        {
          id: "4",
          text: "1500U tier button unlocks staking; min 24h; dividends paid in UMplan.",
        },
      ],
      rules: [
        "Fees: buy/sell trades charge a fee — protocol floor 3%, current product default 3.5%.",
        "Weight split: each weight order runs fixed on-chain shares — 30% burn sink, 50% market-reward bucket, 15% shareholders, 5% precip pool.",
        "Stake dividends: completing the 1500U tier unlocks staking. Stake UMplan for a share of the pool; dividends are paid in UMplan. Formula: 「百5」 total release ÷ network stake = per-token dividend.",
        "Assets: promo token rewards and stake dividends are UMplan; after a weight burn you earn SPCXB dividends for your highest reached tier pool.",
        "Promo: after the 100U threshold unlocks invite links, you earn Direct, Indirect, and Market rewards (team beyond Direct/Indirect is Market — marketed as market 10% per layer). Buys also pay 0.5% instantly.",
      ],
    },
    swap: {
      buySellAria: "Buy / sell",
      buy: "Buy",
      sell: "Sell",
      payUsdt: "Pay USDT",
      sellUmplan: "Sell UMplan",
      receive: "You receive {token}",
      feeRow: "Trade fee {fee}% (floor {floor}%)",
      slip: "Slippage",
      buyInstant: "On buy, you and your referrer each receive 0.5% of the buy amount in USDT instantly.",
      sellInstant: "On sell, you and your referrer each receive 0.5% of the sell amount in USDT instantly.",
      feeNote:
        "Buy/sell: USDT via Pancake V3↔SPCXB then UMplan/SPCXB pool. Fee copy uses floor {floor}% / default {fee}% — not part of weight-burn split.",
      bindBeforeTrade: "Bind a referrer before buying or selling",
      confirmBuy: "Confirm buy",
      confirmSell: "Confirm sell",
      usdEquiv: "Payment (USDT)",
      selfRebate: "Self rebate 0.5%",
      buyOk: "Buy submitted via Pancake multi-hop; 0.5% rewards go to you and your referrer",
      sellOk: "Sell submitted via Pancake multi-hop; awaiting confirmation",
      approveOk: "Approved (usually once). Tap Confirm buy/sell to finish the trade.",
      buyOkDetail: "Buy succeeded! 0.5% self rebate in wallet: {reward} {token} (referrer paid too). See Trade history below.",
      sellOkDetail: "Sell succeeded! 0.5% self rebate in wallet: {reward} {token}. See Trade history below.",
      sellOkReceived: "Sell succeeded! You received ~{received} {token} (incl. rebate ≈ {reward}). Settled at Pancake spot, not the 0.01 oracle. See history below.",
      sellProceeds: "Est. proceeds (USDT)",
      sellSpotHint: "Pancake spot estimate ~{amount} {token} (amount is UMplan count, not USDT). After approve, tap Confirm sell.",
      checkingAllowance: "Checking allowance…",
      quotePending: "Spot quote still loading — wait, then Confirm. Don’t keep tapping Approve.",
      waitWalletApprove: "Confirm Approve in your wallet popup. If none appears, check the wallet app/extension.",
      waitWalletBuy: "Confirm the buy in your wallet. If no popup, check the wallet — don’t spam-tap.",
      waitWalletSell: "Confirm the sell in your wallet. If no popup, check the wallet — don’t spam-tap.",
      waitingWallet: "Waiting for wallet…",
      confirmingOnChain: "Submitted — waiting for on-chain confirmation…",
      viewTx: "View on BscScan →",
      historyTitle: "Trade history (on-chain)",
      historyNote: "Read from Swap events (no indexer). 0.5% USDT rebate is already in your wallet balance.",
      historyEmpty: "No trades yet. Successful buys appear here.",
      insufficientBal: "Insufficient balance: buy needs enough USDT in your wallet",
      needApproveFirst:
        "First-time approve lets Swap move USDT/UMplan (ERC-20). Tap Approve below, confirm in wallet, then Confirm trade.",
      enterAmount: "Enter an amount greater than 0",
      instantTitle: "Instant rewards",
      instantOnly: "Instant only: buy/sell → trader 0.5% + direct referrer 0.5% (USDT) to wallets.",
      noMilestone: "No cumulative buy volume, level, or milestone rewards.",
      slipNote:
        "Fills: V3 USDT/SPCXB + V2 UMplan/SPCXB. Slippage presets (current {slip}%). Fee promise {fee}% (floor {floor}%).",
    },
    stake: {
      title: "Stake dividend rights",
      subtitle: "Unlocks after 1500U tier button · min 24h",
      ruleFormula:
        "Dividend formula: 「百5」 total release ÷ network total stake = dividend per staked token (contract notifyRelease × 5% / totalStaked).",
      ruleExample:
        "Example: period 「百5」 release 500,000 UMplan, network stake 25,000,000 UMplan → 0.02 UMplan per token; staking 100,000 UMplan earns 2,000 UMplan.",
      ruleAsset: "Assets: stake dividends are paid in UMplan (principal and dividends).",
      ruleRedeem:
        "Redeem: minimum stake 24h. After unlock you may withdraw principal + dividends together, or claim dividends only and keep staking. If you forget to claim, the lock extends 24h while interest continues; once 24h has elapsed historically you can claim anytime.",
      rulePool:
        "Pool source: UMplan in this pool comes from inbound market orders — each order pays Direct, Indirect, and Market only in public copy. Amounts with no matching reward slot along the invite chain are deposited here and shared by stake quota.",
      eliteMissing: "EliteStake address missing (NEXT_PUBLIC_ELITE_ADDRESS). UI is ready for post-deploy wiring.",
      locked:
        "Staking opens only after a 1500U weight-tier burn. Until then the stake button stays disabled. Free-typed amounts do not count toward the tier.",
      unlocked: "1500U tier reached — staking unlocked. Choose any stake amount.",
      amountLabel: "Stake amount (UMplan · free amount)",
      shareLabel: "My dividend share (of total stake)",
      estimateLabel: "Est. period dividend (UMplan)",
      estimateOnChain: "Est. period dividend (UMplan · on-chain {token})",
      estimateNote:
        "Estimate uses on-chain accrued unclaimed rewards; each period updates with notifyRelease × 5% × your share. Counted in UMplan.",
      totalStaked: "Network total stake",
      confirmStake: "Confirm stake",
      myStake: "My stake · redeem",
      redeemable: "Redeemable · claim anytime",
      locking: "In lock period",
      principal: "Principal",
      countdown: "Unlock countdown (min 24h)",
      matured: "00:00:00 · unlocked",
      pendingDiv: "Unclaimed dividends",
      redeemBoth: "Redeem principal + dividends",
      claimOnly: "Claim dividends · extend",
      success: "Stake action confirmed",
      quotaAria: "Dividend share and estimate",
    },
    promo: {
      burnTitle: "Weight burn · tier buttons",
      burnSub:
        "Burn UMplan at a USD-pegged tier; the contract auto-splits sink / market / shareholders. Only tier buttons grant tier rights.",
      tier1: "Tier 1",
      tier2: "Tier 2",
      tier3: "Tier 3",
      tier4: "Unlock stake",
      amountLabel: "Burn amount (UMplan · locked by tier button)",
      tipManual: "Amount = selected tier × on-chain oracle price. Pick a tier, agree, approve, then confirm.",
      usdEquiv: "USD equiv.",
      myTier: "My tier",
      buttonTier: "Button T{n}",
      splitTitle: "Post-deduction allocation preview",
      contractTag: "Shares follow contract params",
      splitBurn: "Weight burn",
      splitBurnPct: "30% · sent to burn sink, permanently out of circulation",
      splitMarket: "Market rewards",
      splitMarketPct: "50% · bucket then Direct / Indirect / Market",
      splitShare: "Shareholders",
      splitSharePct: "15% · shareholder pool (separate from SPCXB four-tier dividends)",
      splitPrecip: "Precip pool",
      splitPrecipPct: "5% · UMplan sedimentation / dividend reserve",
      agree:
        "I have read the Weight Burn Agreement. Confirming deducts tier-equivalent UMplan and calls the contract (wallet signature required). Funds follow contract shares and cannot be reversed.",
      bindBeforeBurn: "Bind a referrer before weight burn",
      needAgree: "Check the agreement before approve or confirm.",
      quoteFailed: "Could not price this tier from the oracle — retry or check RPC.",
      needApproveFirst: "Approve UMplan for the burn contract, then tap Confirm weight.",
      confirmWeight: "Confirm weight",
      dataTitle: "Weight data",
      globalBurned: "Network burned total",
      myWeight: "My cumulative weight",
      noteSplit: "Weight orders auto-run 30% burn / 50% market bucket / 15% shareholders / 5% precip pool.",
      noteFee: "Trade fees (floor 3%, default 3.5%) are trading costs — not part of weight burn.",
      notePublic: "Burn sink address is public on-chain.",
      earningsTitle: "Promo earnings",
      directReward: "Direct",
      indirectReward: "Indirect",
      marketReward: "Market",
      earnAsset: "Asset: promo rewards are paid in UMplan to your wallet (totals from indexer; 0 if unconfigured).",
      earnDirect:
        "Direct: when a direct member buys / enters a weight order, you receive 20% of the market-reward bucket (the bucket is 50% of the order = 10% of order).",
      earnIndirect:
        "Indirect: when an indirect member (direct of your direct) enters an order, you receive 10% of the market-reward bucket (= 5% of order).",
      earnMarket:
        "Market: team beyond Direct/Indirect is Market; marketed as market 10% of the bucket per layer (= 5% of order).",
      earnActivate: "Any tier-button burn (≥100U) activates and unlocks invite links in Mine — not cumulative buys.",
      poolsTitle: "SPCXB tier dividends",
      poolsSub: "Become a pool shareholder · 24h cooldown",
      poolOpen: "Reached tier T{n} — you are a shareholder of that pool (highest tier only, no stacking).",
      poolLocked:
        "After a weight burn you join the matching SPCXB pool and share by pool weight ÷ members. No tier yet.",
      poolCaption: "Four pools sum to 100% · member counts on-chain; per-capita TBD from indexer",
      poolCol: "Pool",
      membersCol: "Members",
      pctCol: "Share",
      poolActive: " · active",
      poolTierSmall: "{tier} tier · per capita —",
      myClaimable: "My claimable SPCXB",
      cooldown: "Cooldown",
      claimableNow: "Claimable",
      hoursLater: "in {h}h",
      rule: "Rule",
      perDay: "24h / claim",
      poolPctDoc:
        "Pool weights sum to 100% of release — 100U pool 33.33%, 500U and 800U pools 25% each, 1500U pool 16.67%.",
      poolShareDoc:
        "Your payout = your pool’s share ÷ members in that pool. Highest reached weight tier only — no stacking.",
      poolFairDoc:
        "Fairness: payout depends on both pool weight and how many people share it. Bronze has the largest weight (33.33%) but the lowest bar and many members; Diamond has the smallest weight (16.67%) but fewer members, so per-capita can be higher. Threshold and headcount offset each other.",
      poolClaimDoc:
        "Claim SPCXB once every 24h; unclaimed amounts roll forward. Member counts change daily, so per-capita recalculates live.",
      claimDiv: "Claim dividends",
      success: "Weight burn succeeded — sink and allocation ran per contract",
      pool1: "Pool 1 · Bronze",
      pool2: "Pool 2 · Silver",
      pool3: "Pool 3 · Gold",
      pool4: "Pool 4 · Diamond",
    },
    mine: {
      walletTitle: "My wallet",
      totalVal: "Total valuation (USDT)",
      valNote: "UMplan×live price + USDT; SPCXB / BNB not converted yet",
      teamTitle: "My team",
      teamGraph: "From indexer",
      teamUnconfigured: "Indexer not configured (GRAPH_URL); directs may use chain",
      teamLoading: "Loading…",
      teamConnect: "Connect wallet to view",
      directs: "Directs",
      indirects: "Indirects",
      buyVolume: "Buy volume",
      marketVolume: "Market volume",
      qualTitle: "Promo eligibility",
      qualOn: "Activated — you can create an invite link (weight tier button · ≥100U)",
      copied: "Copied",
      copy: "Copy",
      copyLink: "Copy link",
      myQr: "My QR",
      qrStub: "QR placeholder · invite QR coming soon",
      qualOff:
        "Complete any Weight tier burn (min ≥100U via tier button) to unlock promo and generate your invite link — not cumulative buys.",
      incomeTitle: "My earnings",
      incomeSub: "Stake dividends = UMplan · tier dividends = SPCXB",
      bindBeforeIncome: "Bind a referrer before viewing earnings detail",
      incomeGraph: "Ledger from indexer",
      incomeUnconfigured: "Indexer not configured — layer/dividend detail empty; Swap rebate can use on-chain trades",
      incomeChain: "Swap rebate from on-chain trades (0.5% USDT already in wallet)",
      tabSwap: "Swap promo",
      tabLayer: "Layer rewards",
      tabDiv: "Dividends",
      totalWithUnit: "Total ({unit}{layerHint})",
      layerBreakdownHint: " · Direct/Indirect/Market",
      layerLine: "Direct {d} / Indirect {i} / Market {m} (detail uses Market3…Market9)",
      noDetail: "No detail yet",
    },
    layers: {
      direct: "Direct",
      indirect: "Indirect",
      market: "Market",
      marketN: "Market{n}",
    },
    tx: {
      insufficientGas:
        "Not enough BNB for gas. Switch to BNB Chain mainnet (56) and hold a little BNB.",
      rejected: "Transaction cancelled.",
      alreadyBound: "This address already has a referrer and cannot rebind.",
      self: "You cannot bind yourself as referrer.",
      notInTree: "Referrer is not in the tree yet (not root and unbound). Use a valid invite link.",
      zero: "Invalid referrer address.",
      cycle: "Binding would create a cycle. Choose another referrer.",
      unknownRpc:
        "Transaction could not be submitted (gas, missing approve, or contract reject). Confirm BNB Chain mainnet.",
      wrongNetwork: "Wrong network — switch to BNB Chain mainnet (BSC, chainId 56).",
      bindFailed: "Action failed. Retry later; confirm mainnet BNB and token approval.",
    },
  },
};

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`,
  );
}
