// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BurnRouter} from "../src/BurnRouter.sol";
import {DividendPools} from "../src/DividendPools.sol";
import {LayerRewards} from "../src/LayerRewards.sol";
import {ShareholderPool} from "../src/ShareholderPool.sol";
import {PrecipitationPool} from "../src/PrecipitationPool.sol";
import {EliteStake} from "../src/EliteStake.sol";
import {Treasury} from "../src/Treasury.sol";
import {Constants} from "../src/Constants.sol";

/// @notice Redeploy DividendPools + BurnRouter with test tiers 1/5/8/15 U and cut over modules.
contract DeployTestTiersMainnet is Script {
    address constant ADMIN = 0x1e403807bA07c1f45C08e080AF3c53C2385825Db;
    address constant OLD_BURN = 0xBED03529ecFf7406a9721a900de77d170d83C270;
    address constant OLD_DIVIDENDS = 0x0F502BFf1D1e4E24dc3B73A62062B1d74f3161bb;
    address constant ORACLE = 0xf38cA055CBD7a6278948F86bB19A298EC90D2101;
    address constant LAYERS = 0x53B854cE25E6dAa3BaCD8F3dced82FC6E6c7b79b;
    address constant SHAREHOLDERS = 0xF0206e493213CDC1288bAE8D12eEF3ff7654B1fE;
    address constant PRECIP = 0xC9e2111677a4d565743aA98f535819937054dB3A;
    address constant ELITE = 0xdD5aA4E93719897528cDB4802B19A87026094dCE;
    address constant TREASURY = 0x962DbAF164F39dB4ad80A9b9b47Ed7FDD36Dea47;
    address constant SPCXB = 0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(pk);
        require(admin == ADMIN, "deploy: wrong admin");

        address umplan = vm.envOr("PROJECT_TOKEN", Constants.UMPLAN_MAINNET);

        // Sanity: new Constants are test tiers
        require(Constants.TIER1_USD == 1e18, "deploy: tier1");
        require(Constants.TIER4_USD == 15e18, "deploy: tier4");

        vm.startBroadcast(pk);

        DividendPools dividends = new DividendPools(admin, SPCXB);
        BurnRouter burn = new BurnRouter(
            admin,
            umplan,
            ORACLE,
            LAYERS,
            SHAREHOLDERS,
            address(dividends),
            Constants.DEAD,
            0
        );
        burn.setConfig(address(0), address(0), address(0), address(0), PRECIP, address(0));
        dividends.setBurnRouter(address(burn));

        LayerRewards(LAYERS).setConfig(address(0), address(0), address(burn));
        ShareholderPool(SHAREHOLDERS).setBurnRouter(address(burn));
        PrecipitationPool(PRECIP).setConfig(address(dividends), address(0), address(burn));
        EliteStake(ELITE).setDividends(address(dividends));
        Treasury(payable(TREASURY)).setModule(keccak256("BURN"), address(burn));
        Treasury(payable(TREASURY)).setModule(keccak256("DIVIDENDS"), address(dividends));

        BurnRouter(OLD_BURN).pause();
        // Old dividend pool no longer receives burn updates; leave claimable history intact.

        vm.stopBroadcast();

        console2.log("=== Test tiers 1/5/8/15U cutover ===");
        console2.log("New DividendPools", address(dividends));
        console2.log("New BurnRouter", address(burn));
        console2.log("tier1 usd", burn.tierUsd(1));
        console2.log("tier4 usd", burn.tierUsd(4));
        console2.log("quote 1U tokens", burn.quoteTokensForTier(1));
        console2.log("Old BurnRouter paused", OLD_BURN);
        console2.log("Old DividendPools", OLD_DIVIDENDS);
    }
}
