// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PancakeSpotOracle} from "../src/PancakeSpotOracle.sol";
import {BurnRouter} from "../src/BurnRouter.sol";
import {SwapFacade} from "../src/SwapFacade.sol";
import {Constants} from "../src/Constants.sol";

/// @notice Deploy PancakeSpotOracle and point BurnRouter (+ live SwapFacade) at it.
contract DeployPancakeSpotOracleMainnet is Script {
    address constant ADMIN = 0x1e403807bA07c1f45C08e080AF3c53C2385825Db;
    address constant BURN = 0x2b2439Bd7894C134b6Db3CbFEB9AE92278419E28;
    address constant SWAP = 0x7A853364F4aDdB839FDaDDFdf080a939b1275fBF;
    address constant UMPLAN_SPCXB_PAIR = 0xC3118CCC0be00E7FA39aC8041694e09F52178d6F;
    address constant SPCXB_USDT_V3_POOL = 0x977DaFFC095b33872E2741c19568925015C35b4d;
    uint256 constant BNB_USD = 600e18; // unused by burn; kept for IPriceOracle.bnbUsd

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(pk);
        require(admin == ADMIN, "deploy: wrong admin");

        address umplan = vm.envOr("PROJECT_TOKEN", Constants.UMPLAN_MAINNET);
        address spcxb = vm.envOr("SPCXB_ADDRESS", Constants.SPCXB_MAINNET);
        address usdt = vm.envOr("USDT_ADDRESS", Constants.USDT_MAINNET);

        vm.startBroadcast(pk);

        PancakeSpotOracle oracle = new PancakeSpotOracle(
            admin, umplan, spcxb, usdt, UMPLAN_SPCXB_PAIR, SPCXB_USDT_V3_POOL, BNB_USD
        );

        uint256 spot = oracle.tokenUsd();
        require(spot > 0 && spot < 1e18, "deploy: spot sanity");

        BurnRouter(BURN).setConfig(address(oracle), address(0), address(0), address(0), address(0), address(0));
        SwapFacade(SWAP).setConfig(address(oracle), address(0), payable(address(0)));

        vm.stopBroadcast();

        console2.log("=== PancakeSpotOracle ===");
        console2.log("Oracle", address(oracle));
        console2.log("tokenUsd 1e18", spot);
        console2.log("tokens for 100U", (100e18 * 1e18) / spot);
        console2.log("BurnRouter oracle", address(BurnRouter(BURN).oracle()));
        console2.log("SwapFacade oracle", address(SwapFacade(SWAP).oracle()));
    }
}
