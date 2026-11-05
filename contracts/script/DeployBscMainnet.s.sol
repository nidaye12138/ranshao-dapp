// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReferralRegistry} from "../src/ReferralRegistry.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {MilestoneRewards} from "../src/MilestoneRewards.sol";
import {Sale} from "../src/Sale.sol";
import {Stake} from "../src/Stake.sol";
import {Shareholder} from "../src/Shareholder.sol";

/// @notice BSC Mainnet deploy using **external** project token (UMplan) — does NOT deploy/mint a new token.
/// Env:
///   PRIVATE_KEY (required)
///   PROJECT_TOKEN — default 0xad09D287327C383283820CfCEe7AC0e6C7De7777 (UMplan)
///   USDT_ADDRESS — default BSC USDT 0x55d398326f99059fF775485246999027B3197955
///   USDT_DECIMALS — default 18
///   BNB_USD / TOKEN_USD — mock oracle prices (replace oracle later with Chainlink adapter)
///   MAX_TRANSFER_TAX_BPS — default 300 (3% sell/transfer tax tolerance on inventory delivery)
contract DeployBscMainnet is Script {
    address constant DEFAULT_UMPLAN = 0xad09D287327C383283820CfCEe7AC0e6C7De7777;
    address constant DEFAULT_USDT = 0x55d398326f99059fF775485246999027B3197955;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(pk);

        address projectToken = vm.envOr("PROJECT_TOKEN", DEFAULT_UMPLAN);
        address usdtAddr = vm.envOr("USDT_ADDRESS", DEFAULT_USDT);
        uint8 usdtDecimals = uint8(vm.envOr("USDT_DECIMALS", uint256(18)));
        uint256 bnbUsd = vm.envOr("BNB_USD", uint256(600e18));
        uint256 tokenUsd = vm.envOr("TOKEN_USD", uint256(1e16));
        uint16 maxTaxBps = uint16(vm.envOr("MAX_TRANSFER_TAX_BPS", uint256(300)));

        console2.log("Deployer / admin", admin);
        console2.log("Chain id", block.chainid);
        console2.log("External project token (UMplan)", projectToken);
        console2.log("USDT", usdtAddr);

        vm.startBroadcast(pk);

        ReferralRegistry registry = new ReferralRegistry(admin);
        Treasury treasury = new Treasury(admin);
        MockPriceOracle oracle = new MockPriceOracle(bnbUsd, tokenUsd);
        MilestoneRewards milestones = new MilestoneRewards(admin, usdtAddr);

        Sale sale = new Sale(
            admin,
            projectToken,
            usdtAddr,
            usdtDecimals,
            address(oracle),
            address(registry),
            address(milestones),
            payable(address(treasury)),
            false, // inventory mode — no mint
            maxTaxBps
        );
        Stake stake_ = new Stake(admin, projectToken, address(oracle), address(registry), address(milestones));
        Shareholder shareholder = new Shareholder(admin, projectToken, address(registry), address(stake_));

        registry.setRecorder(address(sale), true);
        milestones.setReporter(address(sale), true);
        milestones.setReporter(address(stake_), true);

        treasury.setModule(keccak256("SALE"), address(sale));
        treasury.setModule(keccak256("STAKE"), address(stake_));
        treasury.setModule(keccak256("MILESTONE"), address(milestones));
        treasury.setModule(keccak256("SHAREHOLDER"), address(shareholder));

        vm.stopBroadcast();

        console2.log("=== BSC MAINNET DEPLOYMENT (external token) ===");
        console2.log("UMplan / projectToken", projectToken);
        console2.log("USDT", usdtAddr);
        console2.log("ReferralRegistry", address(registry));
        console2.log("Treasury", address(treasury));
        console2.log("MockPriceOracle", address(oracle));
        console2.log("MilestoneRewards", address(milestones));
        console2.log("Sale", address(sale));
        console2.log("Stake", address(stake_));
        console2.log("Shareholder", address(shareholder));
        console2.log("Next: fund Sale via sale.depositInventory; fund Stake.fundRewards; fund Milestone USDT");

        string memory json = "deploy";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeString(json, "network", "bsc-mainnet");
        vm.serializeString(json, "tokenMode", "external-umplan");
        vm.serializeAddress(json, "deployer", admin);
        vm.serializeAddress(json, "UMplan", projectToken);
        vm.serializeAddress(json, "USDT", usdtAddr);
        vm.serializeAddress(json, "ReferralRegistry", address(registry));
        vm.serializeAddress(json, "Treasury", address(treasury));
        vm.serializeAddress(json, "MockPriceOracle", address(oracle));
        vm.serializeAddress(json, "MilestoneRewards", address(milestones));
        vm.serializeAddress(json, "Sale", address(sale));
        vm.serializeAddress(json, "Stake", address(stake_));
        string memory out = vm.serializeAddress(json, "Shareholder", address(shareholder));
        string memory outPath = vm.envOr("DEPLOYMENTS_OUT", string("../deployments/bsc-mainnet.json"));
        vm.writeJson(out, outPath);
        console2.log("Wrote", outPath);
    }
}
