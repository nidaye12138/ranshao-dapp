// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReferralRegistry {
    function referrerOf(address user) external view returns (address);
    function isPromoter(address user) external view returns (bool);
    function personalBuyUsd(address user) external view returns (uint256);
    function directRefCount(address user) external view returns (uint256);
    function directRefAt(address user, uint256 index) external view returns (address);
    function getDirectRefs(address user) external view returns (address[] memory);

    function bindReferrer(address referrer) external;
    function recordPurchase(address buyer, uint256 usdAmount) external;
}
