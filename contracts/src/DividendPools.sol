// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDividendPools} from "./interfaces/IDividendPools.sol";
import {Constants} from "./Constants.sol";

/// @title Four SPCXB dividend pools — highest tier only, equal per address (Q2/Q3).
/// @dev Pool asset is SPCXB (≠ UMplan). Weights [3333,2500,2500,1667].
contract DividendPools is IDividendPools, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable spcxb;
    address public burnRouter;

    /// @notice tierOf[user] in 0..4 (0 = none)
    mapping(address => uint8) public tierOf;
    mapping(uint8 => address[]) private _members; // tiers 1..4
    mapping(uint8 => mapping(address => uint256)) private _memberIndex; // 1-based
    mapping(address => uint256) public claimable;
    mapping(uint8 => uint256) public undistributed; // when tier has 0 members at inject
    /// @notice Last successful claim timestamp (24h cooldown — UI IA C4).
    mapping(address => uint256) public lastClaimAt;

    event TierUpdated(address indexed user, uint8 oldTier, uint8 newTier);
    event Injected(uint256 amount, uint256[4] perPool);
    event Claimed(address indexed user, uint256 amount, uint256 nextClaimAt);
    event BurnRouterUpdated(address burnRouter);

    modifier onlyBurnRouter() {
        require(msg.sender == burnRouter || msg.sender == owner(), "div: not router");
        _;
    }

    constructor(address admin, address spcxb_) Ownable(admin) {
        require(spcxb_ != address(0), "div: zero");
        spcxb = IERC20(spcxb_);
    }

    function setBurnRouter(address burnRouter_) external onlyOwner {
        burnRouter = burnRouter_;
        emit BurnRouterUpdated(burnRouter_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function tierMemberCount(uint8 tier) public view returns (uint256) {
        require(tier >= 1 && tier <= 4, "div: tier");
        return _members[tier].length;
    }

    function tierMembers(uint8 tier) external view returns (address[] memory) {
        require(tier >= 1 && tier <= 4, "div: tier");
        return _members[tier];
    }

    function isTierMember(uint8 tier, address user) external view returns (bool) {
        return tierOf[user] == tier && tier != 0;
    }

    /// @notice Promo referral unlock: any burn tier ≥ T1 (100U minimum). UI IA C5.
    function isActivated(address user) public view returns (bool) {
        return tierOf[user] >= 1;
    }

    function nextClaimAt(address user) public view returns (uint256) {
        uint256 last = lastClaimAt[user];
        if (last == 0) return 0;
        return last + Constants.CLAIM_COOLDOWN;
    }

    function canClaim(address user) public view returns (bool) {
        if (claimable[user] == 0) return false;
        uint256 next = nextClaimAt(user);
        return next == 0 || block.timestamp >= next;
    }

    /// @notice Map cumulative burn USD → highest single tier (Q2).
    function tierFromUsd(uint256 cumulativeBurnUsd) public pure returns (uint8) {
        if (cumulativeBurnUsd >= Constants.TIER4_USD) return 4;
        if (cumulativeBurnUsd >= Constants.TIER3_USD) return 3;
        if (cumulativeBurnUsd >= Constants.TIER2_USD) return 2;
        if (cumulativeBurnUsd >= Constants.TIER1_USD) return 1;
        return 0;
    }

    /// @inheritdoc IDividendPools
    function updateTier(address user, uint256 cumulativeBurnUsd) external onlyBurnRouter {
        uint8 newTier = tierFromUsd(cumulativeBurnUsd);
        uint8 oldTier = tierOf[user];
        if (newTier == oldTier) return;

        if (oldTier != 0) _removeMember(oldTier, user);
        tierOf[user] = newTier;
        if (newTier != 0) _addMember(newTier, user);

        emit TierUpdated(user, oldTier, newTier);
    }

    /// @notice Inject SPCXB; split by locked weights; equal-per-address within each tier (Q3).
    function inject(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "div: zero");
        spcxb.safeTransferFrom(msg.sender, address(this), amount);

        uint256[4] memory perPool;
        for (uint8 t = 1; t <= 4; t++) {
            uint256 poolAmt = (amount * Constants.poolWeightBps(t)) / Constants.BPS_DENOM;
            // Include any previously undistributed for this tier
            poolAmt += undistributed[t];
            undistributed[t] = 0;
            perPool[t - 1] = poolAmt;

            uint256 n = _members[t].length;
            if (n == 0) {
                undistributed[t] = poolAmt;
                continue;
            }
            uint256 each = poolAmt / n;
            uint256 used = each * n;
            undistributed[t] = poolAmt - used; // dust
            if (each == 0) continue;
            address[] storage list = _members[t];
            for (uint256 i = 0; i < list.length; i++) {
                claimable[list[i]] += each;
            }
        }

        emit Injected(amount, perPool);
    }

    function claim() external nonReentrant whenNotPaused {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "div: zero");
        uint256 next = nextClaimAt(msg.sender);
        require(next == 0 || block.timestamp >= next, "div: cooldown");
        claimable[msg.sender] = 0;
        lastClaimAt[msg.sender] = block.timestamp;
        uint256 unlock = block.timestamp + Constants.CLAIM_COOLDOWN;
        spcxb.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount, unlock);
    }

    function _addMember(uint8 tier, address user) private {
        _members[tier].push(user);
        _memberIndex[tier][user] = _members[tier].length; // 1-based
    }

    function _removeMember(uint8 tier, address user) private {
        uint256 idx = _memberIndex[tier][user];
        require(idx != 0, "div: not member");
        uint256 i = idx - 1;
        address[] storage list = _members[tier];
        address last = list[list.length - 1];
        list[i] = last;
        _memberIndex[tier][last] = i + 1;
        list.pop();
        _memberIndex[tier][user] = 0;
    }
}
