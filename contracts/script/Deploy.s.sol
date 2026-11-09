// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {Constants} from "../src/Constants.sol";
import {UmPlanDeployer} from "./UmPlanDeployer.sol";

/// @notice Local / Anvil deploy for UM-plan modules.
contract Deploy is Script, UmPlanDeployer {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(pk);

        vm.startBroadcast(pk);

        address usdt = vm.envOr("USE_MOCK_USDT", true)
            ? address(new MockERC20("Tether USD", "USDT", 18))
            : vm.envAddress("USDT_ADDRESS");
        address spcxb = vm.envOr("USE_MOCK_SPCXB", true)
            ? address(new MockERC20("SPCXB", "SPCXB", 18))
            : vm.envAddress("SPCXB_ADDRESS");

        Addresses memory a = _deployUmPlan(
            Params({
                admin: admin,
                token: address(0),
                usdt: usdt,
                spcxb: spcxb,
                usdtDecimals: uint8(vm.envOr("USDT_DECIMALS", uint256(18))),
                bnbUsd: vm.envOr("BNB_USD", uint256(600e18)),
                tokenUsd: vm.envOr("TOKEN_USD", uint256(1e16)),
                mintMode: true,
                maxTaxBps: 0,
                burnSink: Constants.DEAD
            })
        );

        vm.stopBroadcast();
        console2.log("RanshaoToken", a.token);
        console2.log("USDT", a.usdt);
        console2.log("SPCXB", a.spcxb);
        console2.log("ReferralTree", a.tree);
        console2.log("Treasury", a.treasury);
        console2.log("Oracle", a.oracle);
        console2.log("SwapFacade", a.swap);
        console2.log("BurnRouter", a.burnRouter);
        console2.log("LayerRewards", a.layers);
        console2.log("PrecipitationPool", a.precip);
        console2.log("DividendPools", a.dividends);
        console2.log("ShareholderPool", a.shareholders);
        console2.log("EliteStake", a.elite);
        console2.log("BrokerMarket", a.broker);
    }
}
