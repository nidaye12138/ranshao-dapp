// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Constants} from "../src/Constants.sol";
import {UmPlanDeployer} from "./UmPlanDeployer.sol";

/// @notice BSC Mainnet — external UMplan + SPCXB; inventory SwapFacade (no mint).
contract DeployBscMainnet is Script, UmPlanDeployer {
    address constant DEFAULT_USDT = 0x55d398326f99059fF775485246999027B3197955;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(pk);

        address projectToken = vm.envOr("PROJECT_TOKEN", Constants.UMPLAN_MAINNET);
        address spcxbAddr = vm.envOr("SPCXB_ADDRESS", Constants.SPCXB_MAINNET);
        address usdtAddr = vm.envOr("USDT_ADDRESS", DEFAULT_USDT);

        console2.log("Deployer / admin", admin);
        console2.log("UMplan", projectToken);
        console2.log("SPCXB", spcxbAddr);

        vm.startBroadcast(pk);

        Addresses memory a = _deployUmPlan(
            Params({
                admin: admin,
                token: projectToken,
                usdt: usdtAddr,
                spcxb: spcxbAddr,
                usdtDecimals: uint8(vm.envOr("USDT_DECIMALS", uint256(18))),
                bnbUsd: vm.envOr("BNB_USD", uint256(600e18)),
                tokenUsd: vm.envOr("TOKEN_USD", uint256(1e16)),
                mintMode: false,
                maxTaxBps: uint16(vm.envOr("MAX_TRANSFER_TAX_BPS", uint256(300))),
                burnSink: Constants.DEAD
            })
        );

        vm.stopBroadcast();

        console2.log("=== BSC MAINNET UM-PLAN (external UMplan + SPCXB) ===");
        console2.log("Next: SwapFacade.depositInventory(UMplan); DividendPools.inject(SPCXB); whitelist seats");
        console2.log("ReferralTree", a.tree);
        console2.log("Treasury", a.treasury);
        console2.log("MockPriceOracle", a.oracle);
        console2.log("SwapFacade", a.swap);
        console2.log("BurnRouter", a.burnRouter);
        console2.log("LayerRewards", a.layers);
        console2.log("PrecipitationPool", a.precip);
        console2.log("DividendPools", a.dividends);
        console2.log("ShareholderPool", a.shareholders);
        console2.log("EliteStake", a.elite);
        console2.log("BrokerMarket", a.broker);

        string memory json = "deploy";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeString(json, "network", "bsc-mainnet");
        vm.serializeString(json, "tokenMode", "external-umplan");
        vm.serializeAddress(json, "deployer", admin);
        vm.serializeAddress(json, "UMplan", projectToken);
        vm.serializeAddress(json, "SPCXB", spcxbAddr);
        vm.serializeAddress(json, "USDT", usdtAddr);
        vm.serializeAddress(json, "ReferralTree", a.tree);
        vm.serializeAddress(json, "Treasury", a.treasury);
        vm.serializeAddress(json, "MockPriceOracle", a.oracle);
        vm.serializeAddress(json, "SwapFacade", a.swap);
        vm.serializeAddress(json, "BurnRouter", a.burnRouter);
        vm.serializeAddress(json, "LayerRewards", a.layers);
        vm.serializeAddress(json, "PrecipitationPool", a.precip);
        vm.serializeAddress(json, "DividendPools", a.dividends);
        vm.serializeAddress(json, "ShareholderPool", a.shareholders);
        vm.serializeAddress(json, "EliteStake", a.elite);
        string memory out = vm.serializeAddress(json, "BrokerMarket", a.broker);
        string memory outPath = vm.envOr("DEPLOYMENTS_OUT", string("../deployments/bsc-mainnet.json"));
        vm.writeJson(out, outPath);
        console2.log("Wrote", outPath);
    }
}
