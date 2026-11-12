// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RanshaoToken} from "../src/RanshaoToken.sol";
import {ReferralTree} from "../src/ReferralTree.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPancakeRouter} from "../src/mocks/MockPancakeRouter.sol";
import {SwapFacade} from "../src/SwapFacade.sol";

contract SwapFacadeDexTest is Test {
    address admin = makeAddr("admin");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    RanshaoToken token;
    MockERC20 spcxb;
    ReferralTree tree;
    Treasury treasury;
    MockPriceOracle oracle;
    MockPancakeRouter router;
    SwapFacade swap;

    function setUp() public {
        vm.startPrank(admin);
        token = new RanshaoToken(admin);
        spcxb = new MockERC20("SPCXB", "SPCXB", 18);
        tree = new ReferralTree(admin);
        treasury = new Treasury(admin);
        oracle = new MockPriceOracle(600e18, 1e16);
        router = new MockPancakeRouter();

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

        // Seed router inventory for 1:1 swaps out
        token.mint(address(router), 10_000_000e18);
        spcxb.mint(address(router), 10_000_000e18);

        spcxb.mint(alice, 1_000_000e18);
        token.mint(alice, 1_000_000e18);
        token.mint(bob, 1_000_000e18);
        vm.stopPrank();
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

        // 0.5% self + 0.5% ref; 99% swapped 1:1 → tokens
        assertEq(spcxb.balanceOf(alice), alicePayBefore - pay + 5e18);
        assertEq(spcxb.balanceOf(admin), adminPayBefore + 5e18);
        assertEq(token.balanceOf(alice), aliceTokBefore + 990e18);
        assertEq(spcxb.balanceOf(address(swap)), 0);
    }

    function test_sellViaPancake_withReferrer() public {
        vm.prank(alice);
        tree.bindReferrer(admin);

        uint256 sellAmt = 1_000e18;
        uint256 alicePayBefore = spcxb.balanceOf(alice);
        uint256 adminPayBefore = spcxb.balanceOf(admin);

        vm.startPrank(alice);
        token.approve(address(swap), sellAmt);
        swap.sellForUSDT(sellAmt);
        vm.stopPrank();

        // 1:1 swap → 1000 payment; seller 995, ref 5
        assertEq(spcxb.balanceOf(alice), alicePayBefore + 995e18);
        assertEq(spcxb.balanceOf(admin), adminPayBefore + 5e18);
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
