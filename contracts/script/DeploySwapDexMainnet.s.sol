// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SwapFacade} from "../src/SwapFacade.sol";
import {Treasury} from "../src/Treasury.sol";
import {Constants} from "../src/Constants.sol";

/// @notice Mainnet: deploy DEX SwapFacade only (payment=SPCXB, Pancake V2), wire Treasury, pause old inventory Swap.
/// @dev Does NOT redeploy ReferralTree / Burn / etc. Requires owner key = admin.
contract DeploySwapDexMainnet is Script {
    address constant OLD_SWAP = 0x188cD8D1f2dD395f0779FFAb1f9e7833Fc17f58D;
    address constant TREASURY = 0x962DbAF164F39dB4ad80A9b9b47Ed7FDD36Dea47;
    address constant ORACLE = 0x77528f697dbf977D5616146b8FFcF206e0BF346f;
    address constant TREE = 0xa1a08c5d0e7Ba306d98f06F5e98F85FAe900bc6c;
    address constant PANCAKE_V2_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address admin = vm.addr(pk);
        require(admin == 0x1e403807bA07c1f45C08e080AF3c53C2385825Db, "deploy: wrong admin");

        address token = vm.envOr("PROJECT_TOKEN", Constants.UMPLAN_MAINNET);
        address spcxb = vm.envOr("SPCXB_ADDRESS", Constants.SPCXB_MAINNET);
        address router = vm.envOr("PANCAKE_ROUTER", PANCAKE_V2_ROUTER);
        uint16 maxTax = uint16(vm.envOr("MAX_TRANSFER_TAX_BPS", uint256(300)));

        console2.log("Admin", admin);
        console2.log("UMplan", token);
        console2.log("SPCXB payment", spcxb);
        console2.log("Router", router);
        console2.log("Old Swap", OLD_SWAP);

        vm.startBroadcast(pk);

        SwapFacade swap = new SwapFacade(
            admin,
            token,
            spcxb,
            18,
            ORACLE,
            TREE,
            payable(TREASURY),
            false,
            maxTax,
            router
        );

        Treasury(payable(TREASURY)).setModule(keccak256("SWAP"), address(swap));

        // Best-effort pause old inventory facade (same admin).
        (bool ok,) = OLD_SWAP.call(abi.encodeWithSignature("pause()"));
        console2.log("Old swap pause ok", ok);

        vm.stopBroadcast();

        console2.log("=== NEW DEX SwapFacade ===");
        console2.log("SwapFacade", address(swap));
        console2.log("dexMode", swap.dexMode());
        console2.log("payment(usdt slot)", address(swap.usdt()));
        console2.log("pancakeRouter", address(swap.pancakeRouter()));
        console2.log("Next: set NEXT_PUBLIC_SWAP_ADDRESS and rebuild frontend");
    }
}
