// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDividendPools {
    /// @notice Update user tier from cumulative burn U (highest-tier-only MVP).
    function updateTier(address user, uint256 cumulativeBurnUsd) external;

    function tierOf(address user) external view returns (uint8);

    function isTierMember(uint8 tier, address user) external view returns (bool);

    function tierMemberCount(uint8 tier) external view returns (uint256);
}
