// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReferralRegistry} from "./interfaces/IReferralRegistry.sol";

/// @title Direct-referral registry (one layer only)
contract ReferralRegistry is IReferralRegistry, Ownable {
    uint256 public constant PROMOTE_THRESHOLD_USD = 50e18;

    mapping(address => address) public referrerOf;
    mapping(address => address[]) private _directRefs;
    mapping(address => bool) public isPromoter;
    mapping(address => uint256) public personalBuyUsd;

    mapping(address => bool) public recorders;

    event ReferrerBound(address indexed user, address indexed referrer);
    event PromoterUnlocked(address indexed user, uint256 personalBuyUsd);
    event PurchaseRecorded(address indexed buyer, uint256 usdAmount, uint256 cumulative);
    event RecorderUpdated(address indexed account, bool allowed);

    modifier onlyRecorder() {
        require(recorders[msg.sender] || msg.sender == owner(), "registry: not recorder");
        _;
    }

    constructor(address admin) Ownable(admin) {
        // Genesis promoter so first invitees can bind during bootstrap.
        isPromoter[admin] = true;
        emit PromoterUnlocked(admin, 0);
    }

    function setRecorder(address account, bool allowed) external onlyOwner {
        recorders[account] = allowed;
        emit RecorderUpdated(account, allowed);
    }

    function setPromoter(address account, bool allowed) external onlyOwner {
        isPromoter[account] = allowed;
        if (allowed) emit PromoterUnlocked(account, personalBuyUsd[account]);
    }

    function directRefCount(address user) external view returns (uint256) {
        return _directRefs[user].length;
    }

    function directRefAt(address user, uint256 index) external view returns (address) {
        return _directRefs[user][index];
    }

    function getDirectRefs(address user) external view returns (address[] memory) {
        return _directRefs[user];
    }

    /// @notice Bind a promoter as one-time direct referrer. No cycles.
    function bindReferrer(address referrer) external {
        address user = msg.sender;
        require(referrer != address(0), "registry: zero");
        require(referrer != user, "registry: self");
        require(referrerOf[user] == address(0), "registry: already bound");
        require(isPromoter[referrer], "registry: not promoter");
        require(!_createsCycle(user, referrer), "registry: cycle");

        referrerOf[user] = referrer;
        _directRefs[referrer].push(user);
        emit ReferrerBound(user, referrer);
    }

    /// @notice Called by Sale after a purchase settles.
    function recordPurchase(address buyer, uint256 usdAmount) external onlyRecorder {
        require(buyer != address(0) && usdAmount > 0, "registry: bad args");
        uint256 cumulative = personalBuyUsd[buyer] + usdAmount;
        personalBuyUsd[buyer] = cumulative;
        emit PurchaseRecorded(buyer, usdAmount, cumulative);

        if (!isPromoter[buyer] && cumulative >= PROMOTE_THRESHOLD_USD) {
            isPromoter[buyer] = true;
            emit PromoterUnlocked(buyer, cumulative);
        }
    }

    function _createsCycle(address user, address referrer) private view returns (bool) {
        // Walk up from referrer; if we hit `user`, binding would cycle.
        address cur = referrer;
        // Cap walk depth for gas safety (direct-only product; walk still needed for anti-cycle).
        for (uint256 i = 0; i < 64; i++) {
            if (cur == address(0)) return false;
            if (cur == user) return true;
            cur = referrerOf[cur];
        }
        return true;
    }
}
