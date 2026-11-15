// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {EliteStake} from "../src/EliteStake.sol";
import {PrecipitationPool} from "../src/PrecipitationPool.sol";
import {BurnRouter} from "../src/BurnRouter.sol";
import {LayerRewards} from "../src/LayerRewards.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Deploy new Precip+Elite (daily push), rewire Burn/Layer, migrate ~95% old precip balance.
 * @dev Env: PRIVATE_KEY (admin 0x1e40…), optional overrides for addresses.
 *      Old precip adminWithdraw reserves 5%-of-lifetime room — cannot move 100% in one call.
 */
contract CutoverEliteDailyPushMainnet is Script {
    function run() external {
        address admin = vm.envOr("ADMIN", address(0x1e403807bA07c1f45C08e080AF3c53C2385825Db));
        address umplan = vm.envOr("UMPLAN", address(0xad09D287327C383283820CfCEe7AC0e6C7De7777));
        address dividends = vm.envOr("DIVIDENDS", address(0xC9Dc470F2f9CDBcdfC56316516E66459D4a73265));
        address burn = vm.envOr("BURN", address(0xA4C75FC51B0f3B60053ca0dae55bC922C0454aFc));
        address layers = vm.envOr("LAYER_REWARDS", address(0x53B854cE25E6dAa3BaCD8F3dced82FC6E6c7b79b));
        address oldPrecip = vm.envOr("OLD_PRECIP", address(0xC9e2111677a4d565743aA98f535819937054dB3A));

        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        PrecipitationPool precip = new PrecipitationPool(admin, umplan, dividends);
        EliteStake elite = new EliteStake(admin, umplan, umplan, dividends);
        elite.setPrecip(address(precip));
        precip.setEliteStake(address(elite));
        // Allow BurnRouter + LayerRewards to deposit into the new pool.
        precip.setConfig(dividends, layers, burn);

        // Point burn + layer rewards at new precip (keep other modules).
        BurnRouter(burn).setConfig(address(0), address(0), address(0), address(0), address(precip), address(0));
        LayerRewards(layers).setConfig(address(0), address(precip), address(0));

        // Migrate as much as adminWithdraw allows (reserves 5% of totalDeposited room).
        PrecipitationPool old = PrecipitationPool(oldPrecip);
        IERC20 token = IERC20(umplan);
        uint256 bal = token.balanceOf(oldPrecip);
        uint256 td = old.totalDeposited();
        uint256 allocated = old.allocatedTo1500();
        uint256 cap1500 = (td * 500) / 10_000;
        uint256 stillFor1500 = cap1500 > allocated ? cap1500 - allocated : 0;
        uint256 reserved = allocated; // same heuristic as contract
        uint256 movable = bal > (reserved + stillFor1500) ? bal - reserved - stillFor1500 : 0;
        if (movable > 0) {
            old.adminWithdraw(address(precip), movable);
        }

        // Sync totalDeposited on new pool for accounting (optional: leave 0; preview uses balanceOf).
        // New deposits via burn/layer will increment totalDeposited on new precip.

        vm.stopBroadcast();

        console2.log("NEW_PRECIP", address(precip));
        console2.log("NEW_ELITE", address(elite));
        console2.log("MIGRATED", movable);
        console2.log("OLD_PRECIP_LEFT", token.balanceOf(oldPrecip));
        console2.log("NEW_PRECIP_BAL", token.balanceOf(address(precip)));
    }
}
