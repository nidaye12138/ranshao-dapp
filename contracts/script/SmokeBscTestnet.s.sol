// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Sale} from "../src/Sale.sol";
import {Stake} from "../src/Stake.sol";
import {RanshaoToken} from "../src/RanshaoToken.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @notice Post-deploy smoke: buyWithUSDT then stake min USD amount.
/// Env: PRIVATE_KEY, SALE, STAKE, TOKEN, USDT
contract SmokeBscTestnet is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address buyer = vm.addr(pk);

        Sale sale = Sale(vm.envAddress("SALE"));
        Stake stake_ = Stake(vm.envAddress("STAKE"));
        RanshaoToken token = RanshaoToken(vm.envAddress("TOKEN"));
        MockERC20 usdt = MockERC20(vm.envAddress("USDT"));

        uint256 pay = vm.envOr("SMOKE_USDT", uint256(100e18));
        // $100 at $0.01/token => 10_000 RS minimum stake
        uint256 stakeAmount = vm.envOr("SMOKE_STAKE", uint256(10_000e18));

        console2.log("Smoke buyer", buyer);
        console2.log("USDT bal", usdt.balanceOf(buyer));
        console2.log("RS bal", token.balanceOf(buyer));

        vm.startBroadcast(pk);

        // Ensure buyer has USDT (mint if mock + buyer is owner/minter — MockERC20.mint is open)
        if (usdt.balanceOf(buyer) < pay) {
            usdt.mint(buyer, pay);
        }

        usdt.approve(address(sale), pay);
        sale.buyWithUSDT(pay);
        console2.log("After buy RS", token.balanceOf(buyer));

        require(token.balanceOf(buyer) >= stakeAmount, "smoke: not enough RS to stake");
        token.approve(address(stake_), stakeAmount);
        stake_.stake(stakeAmount);
        console2.log("Staked", stake_.stakedBalance(buyer));

        vm.stopBroadcast();
        console2.log("Smoke OK");
    }
}
