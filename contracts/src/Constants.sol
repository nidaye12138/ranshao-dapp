// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Locked UM-plan parameters + documented MVP defaults for open §9 questions.
/// @dev Authority: docs/dapp-design.md + docs/um-plan-delta.md (Project store).
///
/// MVP defaults for still-open §9 questions (must stay in sync with PR body):
/// - Q2: highest tier only (one tier per user)
/// - Q3: equal per address in tier
/// - Q4: equal among 1500U burners for precipitation 5%
/// - Q5: remaining 95% stays in PrecipitationPool (admin withdraw later)
/// - Q6: admin notifies release amount into EliteStake
/// - Q7b: admin whitelist seats up to 453
/// - Q8: BrokerMarket stub / Phase 2 only
/// - Q10: no-referrer 0.5% → Treasury
/// - Q11: rewards in payment token
/// - Q12: no UUPS for MVP (Ownable + Pausable)
library Constants {
    uint16 internal constant BPS_DENOM = 10_000;

    // Swap instant rewards (payment token) — only retained overlap with initial design.
    uint16 internal constant INSTANT_REWARD_BPS = 50; // 0.5%

    // Burn split of B
    uint16 internal constant BURN_BPS = 7000; // 70% → burn address
    uint16 internal constant LAYER_BPS = 2000; // 20% → 9-layer
    uint16 internal constant SHAREHOLDER_BPS = 1000; // 10% → shareholders

    // 9-layer of B (sum = 2000 bps): L1 400, L2–L9 200 each
    // Indexed 0..8 for layers 1..9
    function layerBps(uint256 index) internal pure returns (uint16) {
        if (index == 0) return 400;
        return 200;
    }

    uint8 internal constant LAYER_COUNT = 9;
    uint8 internal constant TIER_COUNT = 4;

    // Burn tier thresholds in USD (1e18)
    uint256 internal constant TIER1_USD = 100e18;
    uint256 internal constant TIER2_USD = 500e18;
    uint256 internal constant TIER3_USD = 800e18;
    uint256 internal constant TIER4_USD = 1500e18;

    // Pool weights bps [3333, 2500, 2500, 1667] = 10000
    function poolWeightBps(uint8 tier) internal pure returns (uint16) {
        if (tier == 1) return 3333;
        if (tier == 2) return 2500;
        if (tier == 3) return 2500;
        if (tier == 4) return 1667;
        return 0;
    }

    uint16 internal constant MAX_SHAREHOLDER_SEATS = 453;

    // Precipitation: 5% of lifetime deposits allocatable to 1500U burners (Q4/Q5)
    uint16 internal constant PRECIP_1500_BPS = 500;

    // EliteStake: 5% of notified release distributed to stakers
    uint16 internal constant ELITE_RELEASE_BPS = 500;

    // Mainnet addresses (documentation + deploy defaults)
    address internal constant UMPLAN_MAINNET = 0xad09D287327C383283820CfCEe7AC0e6C7De7777;
    address internal constant SPCXB_MAINNET = 0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
}
