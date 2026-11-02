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

/// @notice Local / testnet deploy outline. Set env PRIVATE_KEY and optional USE_MOCK_USDT=1.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(pk);

        // Default mock prices: BNB=$600, token=$0.01
        uint256 bnbUsd = vm.envOr("BNB_USD", uint256(600e18));
        uint256 tokenUsd = vm.envOr("TOKEN_USD", uint256(1e16)); // $0.01

        vm.startBroadcast(pk);

        RanshaoToken token = new RanshaoToken(admin);
        ReferralRegistry registry = new ReferralRegistry(admin);
        Treasury treasury = new Treasury(admin);
        MockPriceOracle oracle = new MockPriceOracle(bnbUsd, tokenUsd);

        // For local/testnet use MockERC20 as USDT; on mainnet pass real USDT via USE_MOCK_USDT=0 + USDT_ADDRESS.
        address usdtAddr;
        uint8 usdtDecimals = 18;
        if (vm.envOr("USE_MOCK_USDT", true)) {
            MockERC20 usdt = new MockERC20("Tether USD", "USDT", 18);
            usdtAddr = address(usdt);
        } else {
            usdtAddr = vm.envAddress("USDT_ADDRESS");
            usdtDecimals = uint8(vm.envOr("USDT_DECIMALS", uint256(18)));
        }

        MilestoneRewards milestones = new MilestoneRewards(admin, usdtAddr);
        Sale sale = new Sale(
            admin,
            address(token),
            usdtAddr,
            usdtDecimals,
            address(oracle),
            address(registry),
            address(milestones),
            payable(address(treasury))
        );
        Stake stake_ = new Stake(admin, address(token), address(oracle), address(registry), address(milestones));
        Shareholder shareholder =
            new Shareholder(admin, address(token), address(registry), address(stake_));

        // Wire permissions
        token.setMinter(address(sale), true);
        registry.setRecorder(address(sale), true);
        milestones.setReporter(address(sale), true);
        milestones.setReporter(address(stake_), true);

        treasury.setModule(keccak256("SALE"), address(sale));
        treasury.setModule(keccak256("STAKE"), address(stake_));
        treasury.setModule(keccak256("MILESTONE"), address(milestones));
        treasury.setModule(keccak256("SHAREHOLDER"), address(shareholder));

        vm.stopBroadcast();

        console2.log("RanshaoToken", address(token));
        console2.log("USDT", usdtAddr);
        console2.log("ReferralRegistry", address(registry));
        console2.log("Treasury", address(treasury));
        console2.log("Oracle", address(oracle));
        console2.log("MilestoneRewards", address(milestones));
        console2.log("Sale", address(sale));
        console2.log("Stake", address(stake_));
        console2.log("Shareholder", address(shareholder));
    }
}
