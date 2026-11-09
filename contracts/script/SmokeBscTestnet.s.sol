// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SwapFacade} from "../src/SwapFacade.sol";
import {BurnRouter} from "../src/BurnRouter.sol";
import {RanshaoToken} from "../src/RanshaoToken.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @notice Post-deploy smoke: buyWithUSDT then burn into tier path.
/// Env: PRIVATE_KEY, SWAP, BURN, TOKEN, USDT
contract SmokeBscTestnet is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address buyer = vm.addr(pk);

        SwapFacade swap = SwapFacade(vm.envAddress("SWAP"));
        BurnRouter burnRouter = BurnRouter(vm.envAddress("BURN"));
        RanshaoToken token = RanshaoToken(vm.envAddress("TOKEN"));
        MockERC20 usdt = MockERC20(vm.envAddress("USDT"));

        uint256 pay = vm.envOr("SMOKE_USDT", uint256(100e18));
        uint256 burnAmount = vm.envOr("SMOKE_BURN", uint256(100e18));

        console2.log("Smoke buyer", buyer);
        console2.log("USDT bal", usdt.balanceOf(buyer));
        console2.log("token bal", token.balanceOf(buyer));

        vm.startBroadcast(pk);

        if (usdt.balanceOf(buyer) < pay) {
            usdt.mint(buyer, pay);
        }

        usdt.approve(address(swap), pay);
        swap.buyWithUSDT(pay);
        console2.log("After buy token", token.balanceOf(buyer));

        require(token.balanceOf(buyer) >= burnAmount, "smoke: not enough to burn");
        token.approve(address(burnRouter), burnAmount);
        burnRouter.burn(burnAmount);
        console2.log("Burned USD", burnRouter.burnedUsd(buyer));

        vm.stopBroadcast();
        console2.log("Smoke OK");
    }
}
