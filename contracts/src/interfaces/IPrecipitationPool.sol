// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPrecipitationPool {
    /// @notice Called by LayerRewards when a layer has no valid ancestor.
    function receiveMissingLayer(uint256 amount) external;

    /// @notice Called by BurnRouter for the 5% 变异沉淀池 burn leg (UMplan).
    function receiveBurnSedimentation(uint256 amount) external;
}
