// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RanshaoToken} from "../src/RanshaoToken.sol";
import {ReferralRegistry} from "../src/ReferralRegistry.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MilestoneRewards} from "../src/MilestoneRewards.sol";
import {Sale} from "../src/Sale.sol";
import {Stake} from "../src/Stake.sol";
import {Shareholder} from "../src/Shareholder.sol";

/// @notice BSC Testnet (Chapel, chainId 97) deploy with mock USDT + fixed oracle + reward pools.
/// Env: PRIVATE_KEY (required). Optional: BNB_USD, TOKEN_USD, MILESTONE_FUND, STAKE_REWARD_FUND.
contract DeployBscTestnet is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(pk);

        uint256 bnbUsd = vm.envOr("BNB_USD", uint256(600e18));
        uint256 tokenUsd = vm.envOr("TOKEN_USD", uint256(1e16)); // $0.01
        uint256 milestoneFund = vm.envOr("MILESTONE_FUND", uint256(100_000e18));
        uint256 stakeRewardFund = vm.envOr("STAKE_REWARD_FUND", uint256(1_000_000e18));
        uint256 faucetUsdt = vm.envOr("FAUCET_USDT", uint256(50_000e18));

        console2.log("Deployer / admin", admin);
        console2.log("Chain id", block.chainid);

        vm.startBroadcast(pk);

        RanshaoToken token = new RanshaoToken(admin);
        MockERC20 usdt = new MockERC20("Tether USD (mock)", "USDT", 18);
        ReferralRegistry registry = new ReferralRegistry(admin);
        Treasury treasury = new Treasury(admin);
        MockPriceOracle oracle = new MockPriceOracle(bnbUsd, tokenUsd);

        MilestoneRewards milestones = new MilestoneRewards(admin, address(usdt));
        Sale sale = new Sale(
            admin,
            address(token),
            address(usdt),
            18,
            address(oracle),
            address(registry),
            address(milestones),
            payable(address(treasury))
        );
        Stake stake_ = new Stake(admin, address(token), address(oracle), address(registry), address(milestones));
        Shareholder shareholder = new Shareholder(admin, address(token), address(registry), address(stake_));

        token.setMinter(address(sale), true);
        token.setMinter(admin, true);
        registry.setRecorder(address(sale), true);
        milestones.setReporter(address(sale), true);
        milestones.setReporter(address(stake_), true);

        treasury.setModule(keccak256("SALE"), address(sale));
        treasury.setModule(keccak256("STAKE"), address(stake_));
        treasury.setModule(keccak256("MILESTONE"), address(milestones));
        treasury.setModule(keccak256("SHAREHOLDER"), address(shareholder));

        // Seed reward pools for smoke tests
        usdt.mint(admin, milestoneFund + faucetUsdt);
        usdt.transfer(address(milestones), milestoneFund);

        token.mint(admin, stakeRewardFund + 10_000_000e18);
        token.approve(address(stake_), stakeRewardFund);
        stake_.fundRewards(stakeRewardFund);

        // Keep some mock USDT on admin for buy smoke tests
        // (faucetUsdt remains on admin after milestone transfer)

        vm.stopBroadcast();

        // Structured logs for shell parsers + human operators
        console2.log("=== BSC TESTNET DEPLOYMENT ===");
        console2.log("chainId", block.chainid);
        console2.log("deployer", admin);
        console2.log("RanshaoToken", address(token));
        console2.log("USDT", address(usdt));
        console2.log("ReferralRegistry", address(registry));
        console2.log("Treasury", address(treasury));
        console2.log("MockPriceOracle", address(oracle));
        console2.log("MilestoneRewards", address(milestones));
        console2.log("Sale", address(sale));
        console2.log("Stake", address(stake_));
        console2.log("Shareholder", address(shareholder));
        console2.log("oracleBnbUsd", bnbUsd);
        console2.log("oracleTokenUsd", tokenUsd);
        console2.log("milestoneFundUsdt", milestoneFund);
        console2.log("stakeRewardFundRs", stakeRewardFund);

        // Write deployments JSON when running with --broadcast (path relative to contracts/)
        string memory json = "deploy";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeString(json, "network", "bsc-testnet");
        vm.serializeAddress(json, "deployer", admin);
        vm.serializeAddress(json, "RanshaoToken", address(token));
        vm.serializeAddress(json, "USDT", address(usdt));
        vm.serializeAddress(json, "ReferralRegistry", address(registry));
        vm.serializeAddress(json, "Treasury", address(treasury));
        vm.serializeAddress(json, "MockPriceOracle", address(oracle));
        vm.serializeAddress(json, "MilestoneRewards", address(milestones));
        vm.serializeAddress(json, "Sale", address(sale));
        vm.serializeAddress(json, "Stake", address(stake_));
        string memory out = vm.serializeAddress(json, "Shareholder", address(shareholder));
        // Default path for Chapel broadcast; override with DEPLOYMENTS_OUT for local dry-runs.
        string memory outPath = vm.envOr("DEPLOYMENTS_OUT", string("../deployments/bsc-testnet.json"));
        vm.writeJson(out, outPath);
        console2.log("Wrote", outPath);
    }
}
