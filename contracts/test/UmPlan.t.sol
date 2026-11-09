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

contract UmPlanTest is Test {
    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave = makeAddr("dave");

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
    EliteStake elite;
    BrokerMarket broker;

    uint256 constant BNB_USD = 600e18;
    uint256 constant TOKEN_USD = 1e18; // $1 per token → easy U math

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

        elite = new EliteStake(admin, address(token), address(spcxb), address(dividends));
        broker = new BrokerMarket(admin, address(treasury));

        // Seed
        usdt.mint(admin, 10_000_000e18);
        spcxb.mint(admin, 10_000_000e18);
        token.mint(admin, 10_000_000e18);
        usdt.mint(alice, 1_000_000e18);
        usdt.mint(bob, 1_000_000e18);
        token.mint(alice, 1_000_000e18);
        token.mint(bob, 1_000_000e18);
        token.mint(carol, 1_000_000e18);
        token.mint(dave, 1_000_000e18);
        vm.stopPrank();

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // ---------- ReferralTree ----------

    function test_bindReferrer() public {
        vm.prank(alice);
        tree.bindReferrer(admin);
        assertEq(tree.referrerOf(alice), admin);

        vm.prank(bob);
        tree.bindReferrer(alice);
        assertEq(tree.referrerOf(bob), alice);

        address[] memory w = tree.walk(bob, 9);
        assertEq(w[0], alice);
        assertEq(w[1], admin);
        assertEq(w[2], address(0));
    }

    function test_bindReferrer_requiresInTree() public {
        vm.prank(alice);
        vm.expectRevert("tree: referrer not in tree");
        tree.bindReferrer(bob);
    }

    function test_bindReferrer_onceOnly() public {
        vm.prank(alice);
        tree.bindReferrer(admin);
        vm.prank(alice);
        vm.expectRevert("tree: already bound");
        tree.bindReferrer(admin);
    }

    // ---------- Swap 0.5% / 0.5% ----------

    function test_buyUSDT_withReferrer_instantRewards() public {
        vm.prank(alice);
        tree.bindReferrer(admin);

        uint256 pay = 1_000e18;
        uint256 aliceBefore = usdt.balanceOf(alice);
        uint256 adminBefore = usdt.balanceOf(admin);
        uint256 treasuryBefore = usdt.balanceOf(address(treasury));

        vm.startPrank(alice);
        usdt.approve(address(swap), pay);
        swap.buyWithUSDT(pay);
        vm.stopPrank();

        // $1000 / $1 = 1000 tokens
        assertEq(token.balanceOf(alice), 1_000_000e18 + 1_000e18);
        assertEq(usdt.balanceOf(alice), aliceBefore - pay + 5e18);
        assertEq(usdt.balanceOf(admin), adminBefore + 5e18);
        assertEq(usdt.balanceOf(address(treasury)), treasuryBefore + 990e18);
    }

    function test_buyUSDT_noReferrer_rewardToTreasury() public {
        uint256 pay = 1_000e18;
        uint256 treasuryBefore = usdt.balanceOf(address(treasury));

        vm.startPrank(bob);
        usdt.approve(address(swap), pay);
        swap.buyWithUSDT(pay);
        vm.stopPrank();

        // buyer 5 + no-ref 5 + remainder 990 = 995 to treasury path; buyer keeps 5
        assertEq(usdt.balanceOf(address(treasury)), treasuryBefore + 995e18);
    }

    function test_buyBNB_withReferrer() public {
        vm.prank(alice);
        tree.bindReferrer(admin);

        uint256 adminBefore = admin.balance;
        vm.prank(alice);
        swap.buyWithBNB{value: 1 ether}();

        // 600 tokens at $1
        assertEq(token.balanceOf(alice), 1_000_000e18 + 600e18);
        assertEq(admin.balance, adminBefore + 0.005 ether);
    }

    // ---------- Burn 70/20/10 + layers + tiers ----------

    function _bindChain() internal {
        // admin <- alice <- bob <- carol (3 layers above carol for bob's burn from carol...)
        vm.prank(alice);
        tree.bindReferrer(admin);
        vm.prank(bob);
        tree.bindReferrer(alice);
        vm.prank(carol);
        tree.bindReferrer(bob);
        vm.prank(dave);
        tree.bindReferrer(carol);
    }

    function test_burn_split_and_layers() public {
        _bindChain();
        // Whitelist a shareholder so 10% is claimable
        vm.prank(admin);
        shareholders.addShareholder(admin);

        uint256 amount = 10_000e18; // $10,000 at $1
        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);
        uint256 adminTokBefore = token.balanceOf(admin);

        vm.startPrank(dave);
        token.approve(address(burnRouter), amount);
        burnRouter.burn(amount);
        vm.stopPrank();

        // 70% dead
        assertEq(token.balanceOf(DEAD), 7_000e18);
        // L1 (carol) 400 bps of B = 400
        assertEq(token.balanceOf(carol), 1_000_000e18 + 400e18);
        // L2 (bob) 200
        assertEq(token.balanceOf(bob), bobBefore + 200e18);
        // L3 (alice) 200
        assertEq(token.balanceOf(alice), aliceBefore + 200e18);
        // L4 (admin) 200
        assertEq(token.balanceOf(admin), adminTokBefore + 200e18);
        // L5-L9 missing → precip (5 * 200 = 1000)
        assertEq(token.balanceOf(address(precip)), 1_000e18);
        assertEq(precip.totalDeposited(), 1_000e18);

        // 10% shareholders → admin claimable
        assertEq(shareholders.claimable(admin), 1_000e18);

        // Dave burned $10k → tier 4
        assertEq(dividends.tierOf(dave), 4);
        assertEq(burnRouter.burnedUsd(dave), 10_000e18);
    }

    function test_burn_tier_thresholds_highest_only() public {
        vm.prank(alice);
        tree.bindReferrer(admin);

        // 100 U → T1
        vm.startPrank(alice);
        token.approve(address(burnRouter), 100e18);
        burnRouter.burn(100e18);
        vm.stopPrank();
        assertEq(dividends.tierOf(alice), 1);
        assertEq(dividends.tierMemberCount(1), 1);

        // +400 → 500 U → T2 (leaves T1)
        vm.startPrank(alice);
        token.approve(address(burnRouter), 400e18);
        burnRouter.burn(400e18);
        vm.stopPrank();
        assertEq(dividends.tierOf(alice), 2);
        assertEq(dividends.tierMemberCount(1), 0);
        assertEq(dividends.tierMemberCount(2), 1);

        // +300 → 800 → T3
        vm.startPrank(alice);
        token.approve(address(burnRouter), 300e18);
        burnRouter.burn(300e18);
        vm.stopPrank();
        assertEq(dividends.tierOf(alice), 3);

        // +700 → 1500 → T4
        vm.startPrank(alice);
        token.approve(address(burnRouter), 700e18);
        burnRouter.burn(700e18);
        vm.stopPrank();
        assertEq(dividends.tierOf(alice), 4);
        assertEq(dividends.tierMemberCount(3), 0);
        assertEq(dividends.tierMemberCount(4), 1);
    }

    function test_dividend_inject_equal_per_address() public {
        // Two T1 users
        vm.prank(alice);
        tree.bindReferrer(admin);
        vm.prank(bob);
        tree.bindReferrer(admin);

        vm.startPrank(alice);
        token.approve(address(burnRouter), 100e18);
        burnRouter.burn(100e18);
        vm.stopPrank();
        vm.startPrank(bob);
        token.approve(address(burnRouter), 100e18);
        burnRouter.burn(100e18);
        vm.stopPrank();

        uint256 injectAmt = 10_000e18;
        vm.startPrank(admin);
        spcxb.approve(address(dividends), injectAmt);
        dividends.inject(injectAmt);
        vm.stopPrank();

        // T1 weight 3333/10000 of 10000 = 3333; /2 members = 1666 each (floor)
        uint256 t1Pool = (injectAmt * 3333) / 10_000;
        uint256 each = t1Pool / 2;
        assertEq(dividends.claimable(alice), each);
        assertEq(dividends.claimable(bob), each);

        uint256 aliceSpBefore = spcxb.balanceOf(alice);
        vm.prank(alice);
        dividends.claim();
        assertEq(spcxb.balanceOf(alice), aliceSpBefore + each);
    }

    function test_shareholder_claim() public {
        vm.prank(admin);
        shareholders.addShareholder(alice);
        vm.prank(admin);
        shareholders.addShareholder(bob);

        vm.prank(carol);
        tree.bindReferrer(admin);

        vm.startPrank(carol);
        token.approve(address(burnRouter), 1_000e18);
        burnRouter.burn(1_000e18);
        vm.stopPrank();

        // 10% = 100 split to 2 seats → 50 each
        assertEq(shareholders.claimable(alice), 50e18);
        assertEq(shareholders.claimable(bob), 50e18);

        vm.prank(alice);
        shareholders.claim();
        assertEq(token.balanceOf(alice), 1_000_000e18 + 50e18);
    }

    function test_shareholder_cap_453() public {
        // Add 453 seats via admin; 454th reverts
        for (uint256 i = 1; i <= 453; i++) {
            address seat = address(uint160(i + 1000));
            vm.prank(admin);
            shareholders.addShareholder(seat);
        }
        assertEq(shareholders.seatCount(), 453);
        vm.prank(admin);
        vm.expectRevert("sh: full");
        shareholders.addShareholder(makeAddr("overflow"));
    }

    function test_precip_1500_allocate_and_claim() public {
        _bindChain();
        // dave burns enough for T4 with missing layers filling precip
        // Build a short chain so many layers miss: only bind alice→admin, burn from alice
        // Reset: use bob with only admin as L1 → L2-9 precip
        address eve = makeAddr("eve");
        vm.prank(admin);
        token.mint(eve, 2_000e18);
        vm.prank(eve);
        tree.bindReferrer(admin);

        vm.startPrank(eve);
        token.approve(address(burnRouter), 1_500e18);
        burnRouter.burn(1_500e18);
        vm.stopPrank();
        assertEq(dividends.tierOf(eve), 4);

        // L2-L9 missing = 8 * 200 bps of 1500 = 8 * 30 = 240
        uint256 expectedPrecip = (1_500e18 * 200 * 8) / 10_000;
        assertEq(precip.totalDeposited(), expectedPrecip);

        uint256 cap5 = (expectedPrecip * 500) / 10_000;
        vm.prank(admin);
        precip.allocate1500Share();
        assertEq(precip.claimable(eve), cap5);

        vm.prank(eve);
        precip.claim();
        // eve had 2000-1500=500 left + L1 reward to admin not eve + claim
        // eve received no layer reward (she's burner). Balance = 500 + cap5
        assertEq(token.balanceOf(eve), 500e18 + cap5);
    }

    function test_elite_stake_notify_release() public {
        vm.prank(alice);
        tree.bindReferrer(admin);
        vm.startPrank(alice);
        token.approve(address(burnRouter), 1_500e18);
        burnRouter.burn(1_500e18);
        vm.stopPrank();
        assertEq(dividends.tierOf(alice), 4);

        uint256 stakeAmt = 100e18;
        vm.startPrank(alice);
        token.approve(address(elite), stakeAmt);
        elite.stake(stakeAmt);
        vm.stopPrank();

        // notify release of 10_000 SPCXB → 5% = 500 to stakers
        vm.startPrank(admin);
        spcxb.approve(address(elite), 500e18);
        elite.notifyRelease(10_000e18);
        vm.stopPrank();

        assertEq(elite.pendingRewards(alice), 500e18);
        vm.prank(alice);
        elite.claim();
        assertEq(spcxb.balanceOf(alice), 500e18);
    }

    function test_broker_stub_receiveFee() public {
        vm.startPrank(admin);
        usdt.approve(address(broker), 10e18);
        broker.receiveFee(address(usdt), 10e18);
        vm.stopPrank();
        assertEq(broker.totalFeesReceived(), 10e18);
        assertEq(usdt.balanceOf(address(treasury)), 10e18);
    }

    function test_constants_locked() public {
        assertEq(Constants.BURN_BPS, 7000);
        assertEq(Constants.LAYER_BPS, 2000);
        assertEq(Constants.SHAREHOLDER_BPS, 1000);
        assertEq(Constants.layerBps(0), 400);
        assertEq(Constants.layerBps(1), 200);
        assertEq(Constants.poolWeightBps(1), 3333);
        assertEq(Constants.poolWeightBps(2), 2500);
        assertEq(Constants.poolWeightBps(3), 2500);
        assertEq(Constants.poolWeightBps(4), 1667);
        assertEq(Constants.MAX_SHAREHOLDER_SEATS, 453);
        assertEq(uint160(Constants.UMPLAN_MAINNET), uint160(0xad09D287327C383283820CfCEe7AC0e6C7De7777));
        assertEq(uint160(Constants.SPCXB_MAINNET), uint160(0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1));
    }
}
