// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IShareholderPool {
    /// @notice Receive 10% of burn amount for equal-per-seat claims.
    function receiveBurnShare(uint256 amount) external;
    function isShareholder(address user) external view returns (bool);
    function seatCount() external view returns (uint256);
}
