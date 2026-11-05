// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMilestoneRewards {
    function addBuyVolume(address referrer, uint256 usdAmount) external;
    function addStakeVolume(address referrer, uint256 usdAmount) external;
}
