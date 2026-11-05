// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {RanshaoToken} from "../src/RanshaoToken.sol";
import {ReferralRegistry} from "../src/ReferralRegistry.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MilestoneRewards} from "../src/MilestoneRewards.sol";
import {Sale} from "../src/Sale.sol";
import {Stake} from "../src/Stake.sol";
import {Shareholder} from "../src/Shareholder.sol";

contract RanshaoTest is Test {
    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    RanshaoToken token;
    MockERC20 usdt;
    ReferralRegistry registry;
    Treasury treasury;
    MockPriceOracle oracle;
    MilestoneRewards milestones;
    Sale sale;
    Stake stake_;
    Shareholder shareholder;

    uint256 constant BNB_USD = 600e18;
    uint256 constant TOKEN_USD = 1e16; // $0.01

    function setUp() public {
        vm.startPrank(admin);
        token = new RanshaoToken(admin);
        usdt = new MockERC20("USDT", "USDT", 18);
        registry = new ReferralRegistry(admin);
        treasury = new Treasury(admin);
        oracle = new MockPriceOracle(BNB_USD, TOKEN_USD);
        milestones = new MilestoneRewards(admin, address(usdt));
        sale = new Sale(
            admin,
            address(token),
            address(usdt),
            18,
            address(oracle),
            address(registry),
            address(milestones),
            payable(address(treasury)),
            true, // mintMode — local RanshaoToken
            0
        );
        stake_ = new Stake(admin, address(token), address(oracle), address(registry), address(milestones));
        shareholder = new Shareholder(admin, address(token), address(registry), address(stake_));

        token.setMinter(address(sale), true);
        registry.setRecorder(address(sale), true);
        milestones.setReporter(address(sale), true);
        milestones.setReporter(address(stake_), true);

        // Fund reward pools
        usdt.mint(admin, 10_000_000e18);
        usdt.transfer(address(milestones), 1_000_000e18);

        token.mint(admin, 10_000_000e18);
        token.approve(address(stake_), type(uint256).max);
        stake_.fundRewards(1_000_000e18);
        vm.stopPrank();

        // Seed buyers with USDT / BNB
        usdt.mint(alice, 1_000_000e18);
        usdt.mint(bob, 1_000_000e18);
        usdt.mint(carol, 10_000_000e18);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    // ---------- Referral ----------

    function test_bindReferrer() public {
        // admin is genesis promoter
        vm.prank(alice);
        registry.bindReferrer(admin);
        assertEq(registry.referrerOf(alice), admin);
        assertEq(registry.directRefCount(admin), 1);
        assertEq(registry.directRefAt(admin, 0), alice);
    }

    function test_bindReferrer_requiresPromoter() public {
        vm.prank(alice);
        vm.expectRevert("registry: not promoter");
        registry.bindReferrer(bob);
    }

    function test_bindReferrer_onceOnly() public {
        vm.prank(alice);
        registry.bindReferrer(admin);
        vm.prank(alice);
        vm.expectRevert("registry: already bound");
        registry.bindReferrer(admin);
    }

    function test_promoteThreshold() public {
        vm.prank(alice);
        registry.bindReferrer(admin);

        // Buy $50 USDT worth → unlock promoter
        uint256 pay = 50e18;
        vm.startPrank(alice);
        usdt.approve(address(sale), pay);
        sale.buyWithUSDT(pay);
        vm.stopPrank();

        assertTrue(registry.isPromoter(alice));
        assertEq(registry.personalBuyUsd(alice), 50e18);

        // Bob can now bind alice
        vm.prank(bob);
        registry.bindReferrer(alice);
        assertEq(registry.referrerOf(bob), alice);
    }

    // ---------- Sale + instant rewards ----------

    function test_buyUSDT_withReferrer_instantRewards() public {
        vm.prank(alice);
        registry.bindReferrer(admin);

        uint256 pay = 1_000e18; // $1000
        uint256 aliceUsdtBefore = usdt.balanceOf(alice);
        uint256 adminUsdtBefore = usdt.balanceOf(admin);
        uint256 treasuryBefore = usdt.balanceOf(address(treasury));

        vm.startPrank(alice);
        usdt.approve(address(sale), pay);
        sale.buyWithUSDT(pay);
        vm.stopPrank();

        // Tokens: $1000 / $0.01 = 100_000 tokens
        assertEq(token.balanceOf(alice), 100_000e18);

        // Alice paid 1000, got 0.5% = 5 back → net -995 USDT
        assertEq(usdt.balanceOf(alice), aliceUsdtBefore - pay + 5e18);
        // Referrer (admin) got 0.5%
        assertEq(usdt.balanceOf(admin), adminUsdtBefore + 5e18);
        // Treasury got remainder 990
        assertEq(usdt.balanceOf(address(treasury)), treasuryBefore + 990e18);

        // Milestone volume for admin
        assertEq(milestones.buyVolumeUsd(admin), 1_000e18);
    }

    function test_buyUSDT_noReferrer_rewardToTreasury() public {
        uint256 pay = 1_000e18;
        uint256 treasuryBefore = usdt.balanceOf(address(treasury));

        vm.startPrank(bob);
        usdt.approve(address(sale), pay);
        sale.buyWithUSDT(pay);
        vm.stopPrank();

        // Buyer reward 5 + referrer share 5 both effectively leave sale;
        // no referrer → 5 to treasury, remainder 990 → treasury = 995
        assertEq(usdt.balanceOf(address(treasury)), treasuryBefore + 995e18);
        assertEq(milestones.buyVolumeUsd(address(0)), 0);
    }

    function test_buyBNB_withReferrer() public {
        vm.prank(alice);
        registry.bindReferrer(admin);

        uint256 pay = 1 ether; // $600
        uint256 adminBefore = admin.balance;

        vm.prank(alice);
        sale.buyWithBNB{value: pay}();

        // tokens = 600 / 0.01 = 60_000
        assertEq(token.balanceOf(alice), 60_000e18);
        // referrer 0.5% of 1 BNB
        assertEq(admin.balance, adminBefore + 0.005 ether);
        assertEq(milestones.buyVolumeUsd(admin), 600e18);
    }

    // ---------- Milestone snapshot claim ----------

    function test_milestone_snapshot_and_claim() public {
        // Make alice promoter via $50 buy, then carol binds alice and buys enough for alice volume
        vm.startPrank(alice);
        registry.bindReferrer(admin);
        usdt.approve(address(sale), 50e18);
        sale.buyWithUSDT(50e18);
        vm.stopPrank();

        vm.prank(carol);
        registry.bindReferrer(alice);

        // Need $5,000 direct buy volume for tier 0
        uint256 pay = 5_000e18;
        vm.startPrank(carol);
        usdt.approve(address(sale), pay);
        sale.buyWithUSDT(pay);
        vm.stopPrank();

        assertEq(milestones.buyVolumeUsd(alice), 5_000e18);
        // Snapshot at unlock: 0.3% of 5000 = 15 USDT
        assertEq(milestones.buySnapshot(alice, 0), 15e18);

        uint256 before = usdt.balanceOf(alice);
        vm.prank(alice);
        milestones.claimBuyTier(0);
        assertEq(usdt.balanceOf(alice), before + 15e18);

        vm.prank(alice);
        vm.expectRevert("ms: claimed");
        milestones.claimBuyTier(0);
    }

    function test_milestone_snapshot_frozen_when_volume_grows() public {
        vm.startPrank(alice);
        registry.bindReferrer(admin);
        usdt.approve(address(sale), 50e18);
        sale.buyWithUSDT(50e18);
        vm.stopPrank();

        vm.prank(carol);
        registry.bindReferrer(alice);

        vm.startPrank(carol);
        usdt.approve(address(sale), 5_000e18);
        sale.buyWithUSDT(5_000e18);
        // volume grows further
        usdt.approve(address(sale), 5_000e18);
        sale.buyWithUSDT(5_000e18);
        vm.stopPrank();

        // Tier0 snapshot stays at first unlock volume (5000), not 10000
        assertEq(milestones.buySnapshot(alice, 0), 15e18);
        assertEq(milestones.buyVolumeUsd(alice), 10_000e18);
        // Tier1 (20k) not yet
        assertEq(milestones.buySnapshot(alice, 1), 0);
    }

    // ---------- Stake yields ----------

    function test_stake_minUsd() public {
        // $0.01 token → need 10_000 tokens for $100
        uint256 amount = 10_000e18 - 1;
        vm.prank(admin);
        token.mint(alice, amount);
        vm.startPrank(alice);
        token.approve(address(stake_), amount);
        vm.expectRevert("stake: min 100 USD");
        stake_.stake(amount);
        vm.stopPrank();
    }

    function test_stake_earlyWithdraw_noYield() public {
        uint256 amount = 10_000e18; // $100
        vm.prank(admin);
        token.mint(alice, amount);
        vm.startPrank(alice);
        token.approve(address(stake_), amount);
        stake_.stake(amount);
        // advance 14 days
        vm.warp(block.timestamp + 14 days);
        uint256 before = token.balanceOf(alice);
        stake_.withdraw(0);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), before + amount);
        assertEq(stake_.stakedBalance(alice), 0);
    }

    function test_stake_15d_yield() public {
        uint256 amount = 10_000e18;
        vm.prank(admin);
        token.mint(alice, amount);
        vm.startPrank(alice);
        token.approve(address(stake_), amount);
        stake_.stake(amount);
        vm.warp(block.timestamp + 15 days);
        uint256 before = token.balanceOf(alice);
        stake_.withdraw(0);
        vm.stopPrank();
        // 2% of 10000 = 200
        assertEq(token.balanceOf(alice), before + amount + 200e18);
    }

    function test_stake_30d_yield() public {
        uint256 amount = 10_000e18;
        vm.prank(admin);
        token.mint(alice, amount);
        vm.startPrank(alice);
        token.approve(address(stake_), amount);
        stake_.stake(amount);
        vm.warp(block.timestamp + 30 days);
        uint256 before = token.balanceOf(alice);
        stake_.withdraw(0);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), before + amount + 500e18);
    }

    function test_stake_autoRenew_principalOnly() public {
        uint256 amount = 10_000e18;
        vm.prank(admin);
        token.mint(alice, amount);
        vm.startPrank(alice);
        token.approve(address(stake_), amount);
        stake_.stake(amount);
        vm.warp(block.timestamp + 30 days);
        uint256 before = token.balanceOf(alice);
        stake_.autoRenew(0);
        vm.stopPrank();

        // Interest paid out; principal remains staked
        assertEq(token.balanceOf(alice), before + 500e18);
        assertEq(stake_.stakedBalance(alice), amount);
        (uint128 amt,,, bool active) = stake_.getPosition(alice, 0);
        assertEq(amt, amount);
        assertTrue(active);

        // After renew, need another 30d for full yield again
        vm.warp(block.timestamp + 30 days);
        uint256 before2 = token.balanceOf(alice);
        vm.prank(alice);
        stake_.withdraw(0);
        assertEq(token.balanceOf(alice), before2 + amount + 500e18);
    }

    // ---------- Shareholder ----------

    function test_shareholder_qualify_and_register() public {
        // Alice needs 500k self + directs totaling 5M
        // Mint alice 500k, mint bob (direct) 5M, bind bob→alice after alice is promoter
        vm.startPrank(alice);
        registry.bindReferrer(admin);
        usdt.approve(address(sale), 50e18);
        sale.buyWithUSDT(50e18);
        vm.stopPrank();

        vm.prank(admin);
        token.mint(alice, 500_000e18);

        vm.prank(bob);
        registry.bindReferrer(alice);
        vm.prank(admin);
        token.mint(bob, 5_000_000e18);

        // holdings include stake: stake some of bob's and still count
        assertTrue(shareholder.qualifies(alice));
        assertEq(shareholder.holdingsOf(alice), 500_000e18 + token.balanceOf(alice) - 500_000e18); // alice also has buy tokens
        // personal buy gave alice 5000 tokens ($50 / $0.01)
        assertEq(shareholder.holdingsOf(alice), 500_000e18 + 5_000e18);

        vm.prank(alice);
        shareholder.register();
        assertTrue(shareholder.isShareholder(alice));
        assertEq(shareholder.seatCount(), 1);
    }

    function test_shareholder_counts_staked() public {
        vm.startPrank(alice);
        registry.bindReferrer(admin);
        usdt.approve(address(sale), 50e18);
        sale.buyWithUSDT(50e18);
        vm.stopPrank();

        // Alice wallet alone below 500k; stake makes up the difference
        vm.prank(admin);
        token.mint(alice, 400_000e18);
        // alice already has 5_000 from buy → 405_000 wallet; stake 100_000 more after mint
        vm.prank(admin);
        token.mint(alice, 100_000e18);

        vm.startPrank(alice);
        token.approve(address(stake_), 100_000e18);
        stake_.stake(100_000e18); // $1000 worth
        vm.stopPrank();

        // holdings = wallet + staked
        uint256 wallet = token.balanceOf(alice);
        uint256 staked = stake_.stakedBalance(alice);
        assertEq(shareholder.holdingsOf(alice), wallet + staked);
        assertGe(shareholder.holdingsOf(alice), 500_000e18);

        vm.prank(bob);
        registry.bindReferrer(alice);
        vm.prank(admin);
        token.mint(bob, 5_000_000e18);

        assertTrue(shareholder.qualifies(alice));
        vm.prank(alice);
        shareholder.register();
        assertTrue(shareholder.isShareholder(alice));
    }

    function test_shareholder_rejects_unqualified() public {
        vm.prank(alice);
        vm.expectRevert("sh: not qualified");
        shareholder.register();
    }
}
