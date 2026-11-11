// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILayerRewards {
    /// @notice Distribute `budget` (LAYER_BPS of burn B; 40% under owner 20/10/10) across 9 layers; missing → precip.
    function distribute(address burner, uint256 budget) external;
}
