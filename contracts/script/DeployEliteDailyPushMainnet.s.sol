// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {EliteStake} from "../src/EliteStake.sol";
import {PrecipitationPool} from "../src/PrecipitationPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Mainnet cutover: new PrecipitationPool (daily release) + EliteStake (UMplan push).
 * @dev Env:
 *   PRIVATE_KEY / deployer is Ownable admin for new modules
 *   UMPLAN, DIVIDENDS, LAYER_REWARDS, BURN_ROUTER, OLD_PRECIP, OLD_ELITE
 *
 * After broadcast, ops must:
 *   1) burnRouter.setConfig(..., newPrecip, ...)
 *   2) layerRewards.setConfig(..., newPrecip, burnRouter)
 *   3) Move UMplan from OLD_PRECIP → newPrecip (adminWithdraw or owner transfer)
 *   4) Users re-stake on new Elite (or ops-assisted migrate)
 *   5) Cron: cast send newPrecip "releaseDailyToStake()" — once / 24h
 *   6) Update NEXT_PUBLIC_ELITE_ADDRESS / NEXT_PUBLIC_PRECIP_ADDRESS
 */
contract DeployEliteDailyPushMainnet is Script {
    function run() external {
        address umplan = vm.envAddress("UMPLAN");
        address dividends = vm.envAddress("DIVIDENDS");
        address admin = vm.envAddress("ADMIN");

        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        PrecipitationPool precip = new PrecipitationPool(admin, umplan, dividends);
        EliteStake elite = new EliteStake(admin, umplan, umplan, dividends);
        elite.setPrecip(address(precip));
        precip.setEliteStake(address(elite));

        vm.stopBroadcast();

        console2.log("PrecipitationPool", address(precip));
        console2.log("EliteStake", address(elite));
        console2.log("wire: burn.setConfig precip + layers.setConfig precip");
        console2.log("cron: precip.releaseDailyToStake() every 24h as owner");
    }
}
