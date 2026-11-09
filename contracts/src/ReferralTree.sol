// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReferralTree} from "./interfaces/IReferralTree.sol";
import {Constants} from "./Constants.sol";

/// @title Referral tree — bind once, walk up to 9 layers (UM plan).
/// @dev Promoter ≥50 USDT threshold from initial design is deprecated.
contract ReferralTree is IReferralTree, Ownable {
    mapping(address => address) public referrerOf;
    mapping(address => address[]) private _directRefs;
    /// @notice Addresses allowed as first-bind targets (genesis / bootstrap).
    mapping(address => bool) public isRoot;

    event ReferrerBound(address indexed user, address indexed referrer);
    event RootUpdated(address indexed account, bool allowed);

    constructor(address admin) Ownable(admin) {
        isRoot[admin] = true;
        emit RootUpdated(admin, true);
    }

    function setRoot(address account, bool allowed) external onlyOwner {
        isRoot[account] = allowed;
        emit RootUpdated(account, allowed);
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

    /// @notice One-time bind. Referrer must be a root or already have a referrer (in-tree).
    function bindReferrer(address referrer) external {
        address user = msg.sender;
        require(referrer != address(0), "tree: zero");
        require(referrer != user, "tree: self");
        require(referrerOf[user] == address(0), "tree: already bound");
        require(isRoot[referrer] || referrerOf[referrer] != address(0), "tree: referrer not in tree");
        require(!_createsCycle(user, referrer), "tree: cycle");

        referrerOf[user] = referrer;
        _directRefs[referrer].push(user);
        emit ReferrerBound(user, referrer);
    }

    /// @inheritdoc IReferralTree
    function walk(address user, uint256 layers) external view returns (address[] memory out) {
        if (layers > Constants.LAYER_COUNT) layers = Constants.LAYER_COUNT;
        out = new address[](layers);
        address cur = user;
        for (uint256 i = 0; i < layers; i++) {
            cur = referrerOf[cur];
            out[i] = cur;
            if (cur == address(0)) {
                // remaining slots stay address(0)
                break;
            }
        }
    }

    function _createsCycle(address user, address referrer) private view returns (bool) {
        address cur = referrer;
        for (uint256 i = 0; i < 64; i++) {
            if (cur == address(0)) return false;
            if (cur == user) return true;
            cur = referrerOf[cur];
        }
        return true;
    }
}
