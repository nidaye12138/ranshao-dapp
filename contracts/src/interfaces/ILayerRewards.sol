// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILayerRewards {
    /// @notice Distribute `budget` (50% market bucket of burn B) across 9 layers; missing → precip.
    function distribute(address burner, uint256 budget) external;
}
