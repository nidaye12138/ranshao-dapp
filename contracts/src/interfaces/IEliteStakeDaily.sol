// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEliteStakeDaily {
    /// @notice Called by PrecipitationPool after transferring `amount` UMplan for daily push.
    function pushDailyRelease(uint256 amount) external;
}
