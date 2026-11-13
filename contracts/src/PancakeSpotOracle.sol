// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IUniswapV2Pair} from "./interfaces/IUniswapV2Pair.sol";
import {IPancakeV3Pool} from "./interfaces/IPancakeV3Pool.sol";

/// @title Live UMplan/USD spot from Pancake V2 mid × V3 SPCXB/USDT slot0.
/// @dev Matches homepage `/api/stats` mark: UMplan/SPCXB reserves mid × SPCXB→USDT V3 mid.
///      Used by BurnRouter `quoteBurnUsd` / tier gold-peg (not the stale MockPriceOracle 0.01).
contract PancakeSpotOracle is IPriceOracle, Ownable {
    uint256 private constant Q96 = 2 ** 96;

    address public immutable umplan;
    address public immutable spcxb;
    address public immutable usdt;
    IUniswapV2Pair public immutable umplanSpcxbPair;
    IPancakeV3Pool public immutable spcxbUsdtV3Pool;

    /// @notice Optional BNB/USD (1e18) for modules that still read `bnbUsd` (e.g. SwapFacade BNB path).
    uint256 private _bnbUsd;

    event BnbUsdUpdated(uint256 bnbUsd);

    constructor(
        address admin,
        address umplan_,
        address spcxb_,
        address usdt_,
        address umplanSpcxbPair_,
        address spcxbUsdtV3Pool_,
        uint256 bnbUsd_
    ) Ownable(admin) {
        require(
            umplan_ != address(0) && spcxb_ != address(0) && usdt_ != address(0) && umplanSpcxbPair_ != address(0)
                && spcxbUsdtV3Pool_ != address(0),
            "spot: zero"
        );
        umplan = umplan_;
        spcxb = spcxb_;
        usdt = usdt_;
        umplanSpcxbPair = IUniswapV2Pair(umplanSpcxbPair_);
        spcxbUsdtV3Pool = IPancakeV3Pool(spcxbUsdtV3Pool_);
        require(bnbUsd_ > 0, "spot: bnb");
        _bnbUsd = bnbUsd_;

        address t0 = umplanSpcxbPair.token0();
        address t1 = umplanSpcxbPair.token1();
        require(
            (t0 == umplan_ && t1 == spcxb_) || (t0 == spcxb_ && t1 == umplan_), "spot: bad v2 pair"
        );

        address v0 = spcxbUsdtV3Pool.token0();
        address v1 = spcxbUsdtV3Pool.token1();
        require((v0 == usdt_ && v1 == spcxb_) || (v0 == spcxb_ && v1 == usdt_), "spot: bad v3 pool");
    }

    function setBnbUsd(uint256 bnbUsd_) external onlyOwner {
        require(bnbUsd_ > 0, "spot: bnb");
        _bnbUsd = bnbUsd_;
        emit BnbUsdUpdated(bnbUsd_);
    }

    function bnbUsd() external view returns (uint256) {
        return _bnbUsd;
    }

    /// @notice UMplan USD (1e18). Reverts if pool empty or price zero.
    function tokenUsd() external view returns (uint256) {
        (uint112 r0, uint112 r1,) = umplanSpcxbPair.getReserves();
        require(r0 > 0 && r1 > 0, "spot: empty v2");

        uint256 reserveUmplan;
        uint256 reserveSpcxb;
        if (umplanSpcxbPair.token0() == umplan) {
            reserveUmplan = uint256(r0);
            reserveSpcxb = uint256(r1);
        } else {
            reserveUmplan = uint256(r1);
            reserveSpcxb = uint256(r0);
        }

        uint256 usdtPerSpcxb18 = _usdtPerSpcxb18();
        require(usdtPerSpcxb18 > 0, "spot: bad v3");

        // (reserveSpcxb / reserveUmplan) * usdtPerSpcxb18
        return (reserveSpcxb * usdtPerSpcxb18) / reserveUmplan;
    }

    /// @dev USDT (1e18) per 1 SPCXB from V3 mid (`slot0`), both tokens 18 decimals on BSC.
    function _usdtPerSpcxb18() private view returns (uint256) {
        (uint160 sqrtPriceX96,,,,,,) = spcxbUsdtV3Pool.slot0();
        require(sqrtPriceX96 > 0, "spot: no sqrt");

        // price = (sqrtP / 2^96)^2 = token1/token0
        uint256 ratioX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);

        address t0 = spcxbUsdtV3Pool.token0();
        if (t0 == usdt) {
            // token1/token0 = SPCXB/USDT → USDT per SPCXB = 1 / ratio = Q96^2 / sqrtP^2
            return (Q96 * Q96 * 1e18) / ratioX192;
        }
        // token0 = SPCXB, token1 = USDT → USDT per SPCXB = ratio
        return (ratioX192 * 1e18) / (Q96 * Q96);
    }
}
