// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {RanshaoToken} from "../src/RanshaoToken.sol";
import {Constants} from "../src/Constants.sol";
import {UmPlanDeployer} from "./UmPlanDeployer.sol";

/// @notice BSC Testnet (Chapel) — UM-plan modules with mock USDT/SPCXB.
contract DeployBscTestnet is Script, UmPlanDeployer {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(pk);
        uint256 faucetUsdt = vm.envOr("FAUCET_USDT", uint256(50_000e18));
        uint256 spcxbFund = vm.envOr("SPCXB_FUND", uint256(100_000e18));

        console2.log("Deployer / admin", admin);
        console2.log("Chain id", block.chainid);

        vm.startBroadcast(pk);

        MockERC20 usdt = new MockERC20("Tether USD (mock)", "USDT", 18);
        MockERC20 spcxb = new MockERC20("SPCXB (mock)", "SPCXB", 18);

        Addresses memory a = _deployUmPlan(
            Params({
                admin: admin,
                token: address(0),
                usdt: address(usdt),
                spcxb: address(spcxb),
                usdtDecimals: 18,
                bnbUsd: vm.envOr("BNB_USD", uint256(600e18)),
                tokenUsd: vm.envOr("TOKEN_USD", uint256(1e16)),
                mintMode: true,
                maxTaxBps: 0,
                burnSink: Constants.DEAD,
                pancakeRouter: address(0),
                swapPaymentIsSpcxb: false
            })
        );

        usdt.mint(admin, faucetUsdt);
        spcxb.mint(admin, spcxbFund);
        RanshaoToken(a.token).mint(admin, 10_000_000e18);

        vm.stopBroadcast();

        console2.log("=== BSC TESTNET UM-PLAN DEPLOYMENT ===");
        console2.log("RanshaoToken", a.token);
        console2.log("USDT", a.usdt);
        console2.log("SPCXB", a.spcxb);
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
        vm.serializeString(json, "network", "bsc-testnet");
        vm.serializeAddress(json, "deployer", admin);
        vm.serializeAddress(json, "RanshaoToken", a.token);
        vm.serializeAddress(json, "USDT", a.usdt);
        vm.serializeAddress(json, "SPCXB", a.spcxb);
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
        string memory outPath = vm.envOr("DEPLOYMENTS_OUT", string("../deployments/bsc-testnet.json"));
        vm.writeJson(out, outPath);
        console2.log("Wrote", outPath);
    }
}
