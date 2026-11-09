// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Referral tree supporting direct referrer + walk up to 9 layers.
interface IReferralTree {
    function referrerOf(address user) external view returns (address);
    function walk(address user, uint256 layers) external view returns (address[] memory);
    function directRefCount(address user) external view returns (uint256);
}
