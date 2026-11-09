// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStakeView {
    /// @notice Total project-token amount currently staked by `user`.
    function stakedBalance(address user) external view returns (uint256);
}
