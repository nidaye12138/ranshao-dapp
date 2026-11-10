// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RanshaoToken} from "../src/RanshaoToken.sol";
import {ReferralTree} from "../src/ReferralTree.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {SwapFacade} from "../src/SwapFacade.sol";
import {BurnRouter} from "../src/BurnRouter.sol";
import {LayerRewards} from "../src/LayerRewards.sol";
import {PrecipitationPool} from "../src/PrecipitationPool.sol";
import {DividendPools} from "../src/DividendPools.sol";
import {ShareholderPool} from "../src/ShareholderPool.sol";
import {EliteStake} from "../src/EliteStake.sol";
import {BrokerMarket} from "../src/BrokerMarket.sol";
import {Constants} from "../src/Constants.sol";

/// @title Multi-actor UM-plan product scenario (CI-safe local Foundry).
/// @dev Flow: bind → buy → sell → burn activate → layer rewards → SPCXB dividend claim/cooldown.
///      Asserts locked product rules: 4 tiers, ≥100U activate, swap 0.5%+0.5% only, 24h claim, 9 layers.
contract FullScenarioTest is Test {
    address admin = makeAddr("admin");
    // Referral chain: admin ← root ← L1 ← L2 ← … ← L8 (burner at leaf)
    address root = makeAddr("root");
    address l1 = makeAddr("l1");
    address l2 = makeAddr("l2");
    address l3 = makeAddr("l3");
    address l4 = makeAddr("l4");
    address l5 = makeAddr("l5");
    address l6 = makeAddr("l6");
    address l7 = makeAddr("l7");
    address l8 = makeAddr("l8"); // leaf burner / trader

    RanshaoToken token;
    MockERC20 usdt;
    MockERC20 spcxb;
    ReferralTree tree;
    Treasury treasury;
    MockPriceOracle oracle;
    SwapFacade swap;
    DividendPools dividends;
    PrecipitationPool precip;
    LayerRewards layers;
    ShareholderPool shareholders;
    BurnRouter burnRouter;

    uint256 constant BNB_USD = 600e18;
    uint256 constant TOKEN_USD = 1e18; // $1 / token
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function setUp() public {
        vm.startPrank(admin);
        token = new RanshaoToken(admin);
        usdt = new MockERC20("USDT", "USDT", 18);
        spcxb = new MockERC20("SPCXB", "SPCXB", 18);
        tree = new ReferralTree(admin);
        treasury = new Treasury(admin);
        oracle = new MockPriceOracle(BNB_USD, TOKEN_USD);

        dividends = new DividendPools(admin, address(spcxb));
        precip = new PrecipitationPool(admin, address(token), address(dividends));
        layers = new LayerRewards(admin, address(token), address(tree), address(precip));
        shareholders = new ShareholderPool(admin, address(token));

        burnRouter = new BurnRouter(
            admin,
            address(token),
            address(oracle),
            address(layers),
            address(shareholders),
            address(dividends),
            DEAD,
            0
        );

        layers.setConfig(address(tree), address(precip), address(burnRouter));
        precip.setConfig(address(dividends), address(layers));
        shareholders.setBurnRouter(address(burnRouter));
        dividends.setBurnRouter(address(burnRouter));

        swap = new SwapFacade(
            admin,
            address(token),
            address(usdt),
            18,
            address(oracle),
            address(tree),
            payable(address(treasury)),
            true,
            0
        );
        token.setMinter(address(swap), true);

        // Seed balances for scenario actors
        usdt.mint(admin, 50_000_000e18);
        spcxb.mint(admin, 50_000_000e18);
        token.mint(admin, 50_000_000e18);

        address[9] memory actors = [root, l1, l2, l3, l4, l5, l6, l7, l8];
        for (uint256 i = 0; i < actors.length; i++) {
            usdt.mint(actors[i], 1_000_000e18);
            token.mint(actors[i], 1_000_000e18);
            vm.deal(actors[i], 50 ether);
        }
        vm.stopPrank();
    }

    function _bindDeepTree() internal {
        // admin is in-tree by construction (root of ReferralTree ownership / seed).
        // Bind: admin ← root ← l1 ← … ← l8
        address[9] memory chain = [root, l1, l2, l3, l4, l5, l6, l7, l8];
        address prev = admin;
        for (uint256 i = 0; i < chain.length; i++) {
            vm.prank(chain[i]);
            tree.bindReferrer(prev);
            prev = chain[i];
        }
        // Walk from leaf: L1=l7 … L9=admin
        address[] memory w = tree.walk(l8, 9);
        assertEq(w[0], l7);
        assertEq(w[1], l6);
        assertEq(w[2], l5);
        assertEq(w[3], l4);
        assertEq(w[4], l3);
        assertEq(w[5], l2);
        assertEq(w[6], l1);
        assertEq(w[7], root);
        assertEq(w[8], admin);
    }

    /// @notice End-to-end product scenario across multiple actors.
    function test_fullScenario_bindBuySellBurnDividendLayers() public {
        _bindDeepTree();

        // --- Pre-activate: leaf not activated, no promo unlock ---
        assertFalse(dividends.isActivated(l8));
        assertEq(dividends.tierOf(l8), 0);

        // --- Buy: leaf pays 1000 USDT; instant 0.5% self + 0.5% direct (l7) ---
        uint256 buyPay = 1_000e18;
        uint256 l8UsdtBefore = usdt.balanceOf(l8);
        uint256 l7UsdtBefore = usdt.balanceOf(l7);
        uint256 treasuryBefore = usdt.balanceOf(address(treasury));

        vm.startPrank(l8);
        usdt.approve(address(swap), buyPay);
        swap.buyWithUSDT(buyPay);
        vm.stopPrank();

        assertEq(token.balanceOf(l8), 1_000_000e18 + 1_000e18);
        assertEq(usdt.balanceOf(l8), l8UsdtBefore - buyPay + 5e18); // self 0.5%
        assertEq(usdt.balanceOf(l7), l7UsdtBefore + 5e18); // direct 0.5%
        assertEq(usdt.balanceOf(address(treasury)), treasuryBefore + 990e18);

        // --- Sell: fund liquidity, leaf sells 500 tokens → 0.5%+0.5% in USDT ---
        vm.startPrank(admin);
        usdt.approve(address(swap), 100_000e18);
        swap.depositUsdtLiquidity(100_000e18);
        vm.stopPrank();

        uint256 sellAmt = 500e18;
        l8UsdtBefore = usdt.balanceOf(l8);
        l7UsdtBefore = usdt.balanceOf(l7);

        vm.startPrank(l8);
        token.approve(address(swap), sellAmt);
        swap.sellForUSDT(sellAmt);
        vm.stopPrank();

        // seller receives 99.5%; direct referrer 0.5%
        assertEq(usdt.balanceOf(l8), l8UsdtBefore + 497.5e18);
        assertEq(usdt.balanceOf(l7), l7UsdtBefore + 2.5e18);

        // --- Burn activate at minimum tier (≥100U, not required exactly 100) ---
        // Burn 120 tokens @ $1 → T1, activated
        uint256 burnAmt = 120e18;
        uint256[9] memory layerBefore;
        address[9] memory ups = [l7, l6, l5, l4, l3, l2, l1, root, admin];
        for (uint256 i = 0; i < 9; i++) {
            layerBefore[i] = token.balanceOf(ups[i]);
        }

        vm.startPrank(l8);
        token.approve(address(burnRouter), burnAmt);
        burnRouter.burn(burnAmt);
        vm.stopPrank();

        assertTrue(dividends.isActivated(l8));
        assertEq(dividends.tierOf(l8), 1);
        assertEq(burnRouter.burnedUsd(l8), 120e18);
        assertEq(token.balanceOf(DEAD), (burnAmt * 7000) / 10_000);

        // Layer rewards: L1 400bps, L2–L9 200bps each of B
        assertEq(token.balanceOf(ups[0]), layerBefore[0] + (burnAmt * 400) / 10_000); // 直推 L1
        assertEq(token.balanceOf(ups[1]), layerBefore[1] + (burnAmt * 200) / 10_000); // 间推 L2
        for (uint256 i = 2; i < 9; i++) {
            // 市场3…市场9
            assertEq(token.balanceOf(ups[i]), layerBefore[i] + (burnAmt * 200) / 10_000);
        }
        assertEq(token.balanceOf(address(precip)), 0); // full 9-layer chain present

        // --- Climb tiers through cumulative burns (100/500/800/1500) ---
        // Already 120 → T1. Add 380 → 500 → T2
        vm.startPrank(l8);
        token.approve(address(burnRouter), 380e18);
        burnRouter.burn(380e18);
        vm.stopPrank();
        assertEq(dividends.tierOf(l8), 2);

        vm.startPrank(l8);
        token.approve(address(burnRouter), 300e18);
        burnRouter.burn(300e18);
        vm.stopPrank();
        assertEq(dividends.tierOf(l8), 3); // 800

        vm.startPrank(l8);
        token.approve(address(burnRouter), 700e18);
        burnRouter.burn(700e18);
        vm.stopPrank();
        assertEq(dividends.tierOf(l8), 4); // 1500
        assertEq(dividends.tierMemberCount(4), 1);
        // No fifth tier
        assertEq(Constants.TIER_COUNT, 4);

        // --- SPCXB dividend inject + 24h claim cooldown ---
        uint256 injectAmt = 10_000e18;
        vm.startPrank(admin);
        spcxb.approve(address(dividends), injectAmt);
        dividends.inject(injectAmt);
        vm.stopPrank();

        uint256 claimable = dividends.claimable(l8);
        assertGt(claimable, 0);
        // T4 weight 1667/10000 of inject (sole member)
        uint256 expectedT4 = (injectAmt * 1667) / 10_000;
        assertEq(claimable, expectedT4);

        assertTrue(dividends.canClaim(l8));
        uint256 spBefore = spcxb.balanceOf(l8);
        vm.prank(l8);
        dividends.claim();
        assertEq(spcxb.balanceOf(l8), spBefore + expectedT4);
        assertFalse(dividends.canClaim(l8));

        // Accrue more while cooling down — claim must revert
        vm.startPrank(admin);
        spcxb.approve(address(dividends), injectAmt);
        dividends.inject(injectAmt);
        vm.stopPrank();
        assertGt(dividends.claimable(l8), 0);
        assertFalse(dividends.canClaim(l8));
        vm.prank(l8);
        vm.expectRevert("div: cooldown");
        dividends.claim();

        vm.warp(block.timestamp + Constants.CLAIM_COOLDOWN);
        assertTrue(dividends.canClaim(l8));
        vm.prank(l8);
        dividends.claim();

        // Product locks still hold after full flow
        assertEq(Constants.INSTANT_REWARD_BPS, 50);
        assertEq(Constants.CLAIM_COOLDOWN, 24 hours);
        assertEq(Constants.TIER1_USD, 100e18);
        assertEq(Constants.TIER2_USD, 500e18);
        assertEq(Constants.TIER3_USD, 800e18);
        assertEq(Constants.TIER4_USD, 1500e18);
        assertEq(uint160(Constants.SPCXB_MAINNET), uint160(0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1));
    }

    /// @notice Below 100U burn does not activate promo unlock.
    function test_fullScenario_sub100U_notActivated() public {
        vm.prank(root);
        tree.bindReferrer(admin);

        vm.startPrank(root);
        token.approve(address(burnRouter), 99e18);
        burnRouter.burn(99e18);
        vm.stopPrank();

        assertEq(dividends.tierOf(root), 0);
        assertFalse(dividends.isActivated(root));

        vm.startPrank(root);
        token.approve(address(burnRouter), 1e18);
        burnRouter.burn(1e18);
        vm.stopPrank();
        assertEq(dividends.tierOf(root), 1);
        assertTrue(dividends.isActivated(root));
    }

    /// @notice Layer deeper than 9 pays nothing (walk capped).
    function test_fullScenario_layer10_unpaid() public {
        // Build 10 hops below admin; leaf's walk only returns 9 ancestors.
        address[10] memory deep;
        deep[0] = makeAddr("d0");
        for (uint256 i = 1; i < 10; i++) {
            deep[i] = makeAddr(string(abi.encodePacked("d", vm.toString(i))));
        }
        address prev = admin;
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(admin);
            token.mint(deep[i], 100_000e18);
            vm.prank(deep[i]);
            tree.bindReferrer(prev);
            prev = deep[i];
        }

        address leaf = deep[9];
        address[] memory w = tree.walk(leaf, 9);
        assertEq(w.length, 9);
        // Ancestors: deep[8]…deep[0] — admin is hop 10 and not in walk
        assertEq(w[8], deep[0]);
        for (uint256 i = 0; i < 9; i++) {
            assertTrue(w[i] != admin);
        }

        uint256 adminBefore = token.balanceOf(admin);
        vm.startPrank(leaf);
        token.approve(address(burnRouter), 1_000e18);
        burnRouter.burn(1_000e18);
        vm.stopPrank();
        // Admin (10th up) receives no layer share from this burn
        assertEq(token.balanceOf(admin), adminBefore);
    }
}
