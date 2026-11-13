// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RanshaoToken} from "../src/RanshaoToken.sol";
import {ReferralTree} from "../src/ReferralTree.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPancakeRouter} from "../src/mocks/MockPancakeRouter.sol";
import {MockPancakeV3Router} from "../src/mocks/MockPancakeV3Router.sol";
import {SwapFacade} from "../src/SwapFacade.sol";

contract SwapFacadeDexTest is Test {
    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    RanshaoToken token;
    MockERC20 spcxb;
    MockERC20 usdt;
    ReferralTree tree;
    Treasury treasury;
    MockPriceOracle oracle;
    MockPancakeRouter router;
    MockPancakeV3Router v3;
    SwapFacade swap;
    SwapFacade hopSwap;

    function setUp() public {
        vm.startPrank(admin);
        token = new RanshaoToken(admin);
        spcxb = new MockERC20("SPCXB", "SPCXB", 18);
        tree = new ReferralTree(admin);
        treasury = new Treasury(admin);
        oracle = new MockPriceOracle(600e18, 1e16);
        router = new MockPancakeRouter();

        usdt = new MockERC20("USDT", "USDT", 18);
        v3 = new MockPancakeV3Router();

        swap = new SwapFacade(
            admin,
            address(token),
            address(spcxb),
            18,
            address(oracle),
            address(tree),
            payable(address(treasury)),
            false,
            300,
            address(router)
        );

        hopSwap = new SwapFacade(
            admin,
            address(token),
            address(usdt),
            18,
            address(oracle),
            address(tree),
            payable(address(treasury)),
            false,
            300,
            address(router)
        );
        hopSwap.setHopRoute(address(spcxb), address(v3), address(v3), 2500);

        // Seed router inventory for 1:1 swaps out
        token.mint(address(router), 10_000_000e18);
        spcxb.mint(address(router), 10_000_000e18);
        spcxb.mint(address(v3), 10_000_000e18);
        usdt.mint(address(v3), 10_000_000e18);

        spcxb.mint(alice, 1_000_000e18);
        usdt.mint(alice, 1_000_000e18);
        token.mint(alice, 1_000_000e18);
        token.mint(bob, 1_000_000e18);
        vm.stopPrank();
    }

    function test_hopMode_buySell_usdt() public {
        assertTrue(hopSwap.hopMode());
        assertEq(address(hopSwap.usdt()), address(usdt));
        assertEq(address(hopSwap.hopToken()), address(spcxb));

        vm.prank(alice);
        tree.bindReferrer(admin);

        uint256 pay = 1_000e18;
        uint256 aliceTokBefore = token.balanceOf(alice);
        uint256 aliceUsdtBefore = usdt.balanceOf(alice);

        vm.startPrank(alice);
        usdt.approve(address(hopSwap), pay);
        hopSwap.buyWithUSDT(pay);
        vm.stopPrank();

        // Full USDT swapped 1:1 → tokens; 0.5% UMplan to ref, buyer keeps 99.5%
        assertEq(usdt.balanceOf(alice), aliceUsdtBefore - pay);
        assertEq(token.balanceOf(alice), aliceTokBefore + 995e18);
        assertEq(token.balanceOf(admin), 5e18);

        uint256 sellAmt = 500e18;
        uint256 usdtBeforeSell = usdt.balanceOf(alice);
        uint256 tokBeforeSell = token.balanceOf(alice);
        uint256 adminTokBefore = token.balanceOf(admin);
        vm.startPrank(alice);
        token.approve(address(hopSwap), sellAmt);
        hopSwap.sellForUSDT(sellAmt);
        vm.stopPrank();
        // Swap 99% tokens → USDT; self 0.5% UMplan back + ref 0.5% UMplan
        assertEq(usdt.balanceOf(alice), usdtBeforeSell + 495e18);
        assertEq(token.balanceOf(alice), tokBeforeSell - sellAmt + 2.5e18);
        assertEq(token.balanceOf(admin), adminTokBefore + 2.5e18);
    }

    function test_dexMode_true() public view {
        assertTrue(swap.dexMode());
        assertEq(address(swap.pancakeRouter()), address(router));
        assertEq(address(swap.usdt()), address(spcxb));
    }

    function test_buyViaPancake_withReferrer() public {
        vm.prank(alice);
        tree.bindReferrer(admin);

        uint256 pay = 1_000e18;
        uint256 aliceTokBefore = token.balanceOf(alice);
        uint256 alicePayBefore = spcxb.balanceOf(alice);
        uint256 adminPayBefore = spcxb.balanceOf(admin);

        vm.startPrank(alice);
        spcxb.approve(address(swap), pay);
        swap.buyWithUSDT(pay);
        vm.stopPrank();

        // Full payment swapped 1:1 → tokens; ref 0.5% UMplan, buyer 99.5%
        assertEq(spcxb.balanceOf(alice), alicePayBefore - pay);
        assertEq(spcxb.balanceOf(admin), adminPayBefore);
        assertEq(token.balanceOf(alice), aliceTokBefore + 995e18);
        assertEq(token.balanceOf(admin), 5e18);
        assertEq(spcxb.balanceOf(address(swap)), 0);
    }

    function test_sellViaPancake_withReferrer() public {
        vm.prank(alice);
        tree.bindReferrer(admin);

        uint256 sellAmt = 1_000e18;
        uint256 alicePayBefore = spcxb.balanceOf(alice);
        uint256 aliceTokBefore = token.balanceOf(alice);
        uint256 adminTokBefore = token.balanceOf(admin);

        vm.startPrank(alice);
        token.approve(address(swap), sellAmt);
        swap.sellForUSDT(sellAmt);
        vm.stopPrank();

        // Swap 99% → payment; self/ref each 0.5% UMplan
        assertEq(spcxb.balanceOf(alice), alicePayBefore + 990e18);
        assertEq(token.balanceOf(alice), aliceTokBefore - sellAmt + 5e18);
        assertEq(token.balanceOf(admin), adminTokBefore + 5e18);
    }

    function test_inventoryDeposit_blockedInDex() public {
        vm.startPrank(admin);
        token.mint(admin, 100e18);
        token.approve(address(swap), 100e18);
        vm.expectRevert("swap: dex mode");
        swap.depositInventory(100e18);
        vm.stopPrank();
    }

    function test_quoteUsesRouter() public view {
        (uint256 tokenOut,) = swap.quoteUsdt(100e18);
        assertEq(tokenOut, 100e18);
        (uint256 payOut,) = swap.quoteSellUsdt(50e18);
        assertEq(payOut, 50e18);
    }
}
