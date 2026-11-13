// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PancakeSpotOracle} from "../src/PancakeSpotOracle.sol";
import {IUniswapV2Pair} from "../src/interfaces/IUniswapV2Pair.sol";
import {IPancakeV3Pool} from "../src/interfaces/IPancakeV3Pool.sol";

contract MockV2Pair is IUniswapV2Pair {
    address public token0;
    address public token1;
    uint112 public r0;
    uint112 public r1;

    constructor(address t0, address t1, uint112 a, uint112 b) {
        token0 = t0;
        token1 = t1;
        r0 = a;
        r1 = b;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (r0, r1, 0);
    }
}

contract MockV3Pool is IPancakeV3Pool {
    address public token0;
    address public token1;
    uint160 public sqrtP;

    constructor(address t0, address t1, uint160 sqrtPriceX96) {
        token0 = t0;
        token1 = t1;
        sqrtP = sqrtPriceX96;
    }

    function fee() external pure returns (uint24) {
        return 2500;
    }

    function slot0()
        external
        view
        returns (uint160, int24, uint16, uint16, uint16, uint32, bool)
    {
        return (sqrtP, 0, 0, 0, 0, 0, true);
    }
}

contract PancakeSpotOracleTest is Test {
    address constant UMPLAN = address(0xA11);
    address constant SPCXB = address(0xB22);
    address constant USDT = address(0xC33);

    function test_tokenUsd_matchesMidTimesV3() public {
        // Reserves: 1000 UMplan / 0.0127 SPCXB → mid ≈ 0.0000127 SPCXB per UMplan
        MockV2Pair pair = new MockV2Pair(UMPLAN, SPCXB, 1000e18, 0.0127e18);
        // sqrtP such that USDT per SPCXB ≈ 140 (token0=USDT, token1=SPCXB)
        // From mainnet-shaped: sqrtP ≈ 6.689e27 → ~140 USDT/SPCXB
        uint160 sqrtP = 6689008523582440101284920840;
        MockV3Pool pool = new MockV3Pool(USDT, SPCXB, sqrtP);

        PancakeSpotOracle oracle =
            new PancakeSpotOracle(address(this), UMPLAN, SPCXB, USDT, address(pair), address(pool), 600e18);

        uint256 px = oracle.tokenUsd();
        // 0.0127/1000 * ~140.29 ≈ 0.001781
        assertGt(px, 0.0017e18);
        assertLt(px, 0.0019e18);
        // 100U / px ≈ 5.5e4..6e4 tokens
        uint256 tokensFor100 = (100e18 * 1e18) / px;
        assertGt(tokensFor100, 50_000e18);
        assertLt(tokensFor100, 60_000e18);
    }
}
