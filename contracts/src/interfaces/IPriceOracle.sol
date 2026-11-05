// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice USD prices with 1e18 precision (e.g. $600 BNB => 600e18).
interface IPriceOracle {
    function bnbUsd() external view returns (uint256);
    function tokenUsd() external view returns (uint256);
}
