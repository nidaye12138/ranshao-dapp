// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BurnRouter} from "../src/BurnRouter.sol";
import {LayerRewards} from "../src/LayerRewards.sol";
import {ShareholderPool} from "../src/ShareholderPool.sol";
import {DividendPools} from "../src/DividendPools.sol";
import {PrecipitationPool} from "../src/PrecipitationPool.sol";
import {Treasury} from "../src/Treasury.sol";
import {Constants} from "../src/Constants.sol";

/// @notice Deploy BurnRouter with burnTier (once-per-tier upgrade) and cut over modules.
contract DeployBurnTierRouterMainnet is Script {
    address constant ADMIN = 0x1e403807bA07c1f45C08e080AF3c53C2385825Db;
    address constant OLD_BURN = 0x2b2439Bd7894C134b6Db3CbFEB9AE92278419E28;
    address constant ORACLE = 0xf38cA055CBD7a6278948F86bB19A298EC90D2101;
    address constant LAYERS = 0x53B854cE25E6dAa3BaCD8F3dced82FC6E6c7b79b;
    address constant SHAREHOLDERS = 0xF0206e493213CDC1288bAE8D12eEF3ff7654B1fE;
    address constant DIVIDENDS = 0x0F502BFf1D1e4E24dc3B73A62062B1d74f3161bb;
    address constant PRECIP = 0xC9e2111677a4d565743aA98f535819937054dB3A;
    address constant TREASURY = 0x962DbAF164F39dB4ad80A9b9b47Ed7FDD36Dea47;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(pk);
        require(admin == ADMIN, "deploy: wrong admin");

        address umplan = vm.envOr("PROJECT_TOKEN", Constants.UMPLAN_MAINNET);

        vm.startBroadcast(pk);

        BurnRouter burn = new BurnRouter(
            admin,
            umplan,
            ORACLE,
            LAYERS,
            SHAREHOLDERS,
            DIVIDENDS,
            Constants.DEAD,
            0
        );
        burn.setConfig(address(0), address(0), address(0), address(0), PRECIP, address(0));

        LayerRewards(LAYERS).setConfig(address(0), address(0), address(burn));
        ShareholderPool(SHAREHOLDERS).setBurnRouter(address(burn));
        DividendPools(DIVIDENDS).setBurnRouter(address(burn));
        PrecipitationPool(PRECIP).setConfig(address(0), address(0), address(burn));
        Treasury(payable(TREASURY)).setModule(keccak256("BURN"), address(burn));

        // Stop free cumulative burns on the prior router from granting anything new via UI path.
        BurnRouter(OLD_BURN).pause();

        vm.stopBroadcast();

        console2.log("=== BurnRouter burnTier cutover ===");
        console2.log("New BurnRouter", address(burn));
        console2.log("Old BurnRouter paused", OLD_BURN);
        console2.log("oracle", address(burn.oracle()));
        console2.log("precip", address(burn.precipPool()));
        console2.log("quote 100U tokens", burn.quoteTokensForTier(1));
    }
}
