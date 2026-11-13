// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SwapFacade} from "../src/SwapFacade.sol";
import {Treasury} from "../src/Treasury.sol";
import {Constants} from "../src/Constants.sol";

/// @notice Mainnet: deploy DEX SwapFacade with payment=USDT + V3 hop via SPCXB → V2 UMplan.
/// @dev Pauses prior DEX Swap (SPCXB-direct) best-effort. Admin key required.
contract DeploySwapUsdtHopMainnet is Script {
    /// @dev Prior USDT-hop Swap (payment-token rewards). Pause on cutover to UMplan-reward build.
    address constant OLD_DEX_SWAP = 0x7cdB95aF2483B0e264355132dCb2FFcCc65BC27F;
    address constant TREASURY = 0x962DbAF164F39dB4ad80A9b9b47Ed7FDD36Dea47;
    address constant ORACLE = 0x77528f697dbf977D5616146b8FFcF206e0BF346f;
    address constant TREE = 0xa1a08c5d0e7Ba306d98f06F5e98F85FAe900bc6c;
    address constant PANCAKE_V2_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address constant PANCAKE_V3_SWAP_ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
    address constant PANCAKE_V3_QUOTER_V2 = 0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997;
    uint24 constant SPCXB_USDT_V3_FEE = 2500;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(pk);
        require(admin == 0x1e403807bA07c1f45C08e080AF3c53C2385825Db, "deploy: wrong admin");

        address token = vm.envOr("PROJECT_TOKEN", Constants.UMPLAN_MAINNET);
        address usdt = vm.envOr("USDT_ADDRESS", Constants.USDT_MAINNET);
        address spcxb = vm.envOr("SPCXB_ADDRESS", Constants.SPCXB_MAINNET);
        address v2 = vm.envOr("PANCAKE_ROUTER", PANCAKE_V2_ROUTER);
        address v3 = vm.envOr("PANCAKE_V3_ROUTER", PANCAKE_V3_SWAP_ROUTER);
        address quoter = vm.envOr("PANCAKE_V3_QUOTER", PANCAKE_V3_QUOTER_V2);
        uint24 fee = uint24(vm.envOr("HOP_V3_FEE", uint256(SPCXB_USDT_V3_FEE)));
        uint16 maxTax = uint16(vm.envOr("MAX_TRANSFER_TAX_BPS", uint256(300)));

        console2.log("Admin", admin);
        console2.log("UMplan", token);
        console2.log("USDT payment", usdt);
        console2.log("SPCXB hop", spcxb);
        console2.log("V2", v2);
        console2.log("V3", v3);
        console2.log("Quoter", quoter);
        console2.log("Fee", uint256(fee));

        vm.startBroadcast(pk);

        SwapFacade swap = new SwapFacade(
            admin,
            token,
            usdt,
            18,
            ORACLE,
            TREE,
            payable(TREASURY),
            false,
            maxTax,
            v2
        );
        swap.setHopRoute(spcxb, v3, quoter, fee);

        Treasury(payable(TREASURY)).setModule(keccak256("SWAP"), address(swap));

        (bool ok,) = OLD_DEX_SWAP.call(abi.encodeWithSignature("pause()"));
        console2.log("Old DEX swap pause ok", ok);

        vm.stopBroadcast();

        console2.log("=== NEW USDT-hop SwapFacade ===");
        console2.log("SwapFacade", address(swap));
        console2.log("dexMode", swap.dexMode());
        console2.log("hopMode", swap.hopMode());
        console2.log("payment", address(swap.usdt()));
        console2.log("hopToken", address(swap.hopToken()));
        console2.log("Next: set NEXT_PUBLIC_SWAP_ADDRESS and rebuild frontend");
    }
}
