// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPrecipitationPool {
    /// @notice Called by LayerRewards when a layer has no valid ancestor.
    function receiveMissingLayer(uint256 amount) external;
}
