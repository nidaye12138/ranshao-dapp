// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMilestoneRewards} from "./interfaces/IMilestoneRewards.sol";

/// @title Buy-side (MVP) + stake-side (stub) milestone rewards with threshold snapshots
contract MilestoneRewards is IMilestoneRewards, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Tier {
        uint128 thresholdUsd; // 1e18 USD
        uint16 bps; // reward = snapshotVolume * bps / 10_000
    }

    IERC20 public immutable rewardToken; // USDT
    Tier[] public tiers;

    mapping(address => uint256) public buyVolumeUsd;
    mapping(address => uint256) public stakeVolumeUsd;
    mapping(address => mapping(uint8 => bool)) public buyClaimed;
    mapping(address => mapping(uint8 => bool)) public stakeClaimed;
    /// @notice Snapshot payout amount in rewardToken units (USDT 1e18 ≈ USD 1e18).
    mapping(address => mapping(uint8 => uint256)) public buySnapshot;
    mapping(address => mapping(uint8 => uint256)) public stakeSnapshot;

    mapping(address => bool) public reporters;

    event ReporterUpdated(address indexed account, bool allowed);
    event BuyVolumeAdded(address indexed referrer, uint256 usdAmount, uint256 cumulative);
    event StakeVolumeAdded(address indexed referrer, uint256 usdAmount, uint256 cumulative);
    event BuySnapshotTaken(address indexed user, uint8 tierId, uint256 volumeUsd, uint256 payout);
    event StakeSnapshotTaken(address indexed user, uint8 tierId, uint256 volumeUsd, uint256 payout);
    event BuyTierClaimed(address indexed user, uint8 tierId, uint256 amount);
    event StakeTierClaimed(address indexed user, uint8 tierId, uint256 amount);

    modifier onlyReporter() {
        require(reporters[msg.sender] || msg.sender == owner(), "ms: not reporter");
        _;
    }

    constructor(address admin, address rewardToken_) Ownable(admin) {
        require(rewardToken_ != address(0), "ms: zero token");
        rewardToken = IERC20(rewardToken_);
        // 5k/20k/50k/100k/200k → 0.3/0.3/0.5/1/2%
        tiers.push(Tier({thresholdUsd: 5_000e18, bps: 30}));
        tiers.push(Tier({thresholdUsd: 20_000e18, bps: 30}));
        tiers.push(Tier({thresholdUsd: 50_000e18, bps: 50}));
        tiers.push(Tier({thresholdUsd: 100_000e18, bps: 100}));
        tiers.push(Tier({thresholdUsd: 200_000e18, bps: 200}));
    }

    function tierCount() external view returns (uint256) {
        return tiers.length;
    }

    function setReporter(address account, bool allowed) external onlyOwner {
        reporters[account] = allowed;
        emit ReporterUpdated(account, allowed);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function addBuyVolume(address referrer, uint256 usdAmount) external onlyReporter {
        if (referrer == address(0) || usdAmount == 0) return;
        uint256 cumulative = buyVolumeUsd[referrer] + usdAmount;
        buyVolumeUsd[referrer] = cumulative;
        emit BuyVolumeAdded(referrer, usdAmount, cumulative);
        _maybeSnapshotBuy(referrer, cumulative);
    }

    /// @dev Phase 2 full product; wired for future Stake reporter.
    function addStakeVolume(address referrer, uint256 usdAmount) external onlyReporter {
        if (referrer == address(0) || usdAmount == 0) return;
        uint256 cumulative = stakeVolumeUsd[referrer] + usdAmount;
        stakeVolumeUsd[referrer] = cumulative;
        emit StakeVolumeAdded(referrer, usdAmount, cumulative);
        _maybeSnapshotStake(referrer, cumulative);
    }

    function claimBuyTier(uint8 tierId) external nonReentrant whenNotPaused {
        address user = msg.sender;
        require(tierId < tiers.length, "ms: bad tier");
        require(!buyClaimed[user][tierId], "ms: claimed");
        uint256 payout = buySnapshot[user][tierId];
        require(payout > 0, "ms: not unlocked");
        buyClaimed[user][tierId] = true;
        rewardToken.safeTransfer(user, payout);
        emit BuyTierClaimed(user, tierId, payout);
    }

    function claimStakeTier(uint8 tierId) external nonReentrant whenNotPaused {
        address user = msg.sender;
        require(tierId < tiers.length, "ms: bad tier");
        require(!stakeClaimed[user][tierId], "ms: claimed");
        uint256 payout = stakeSnapshot[user][tierId];
        require(payout > 0, "ms: not unlocked");
        stakeClaimed[user][tierId] = true;
        rewardToken.safeTransfer(user, payout);
        emit StakeTierClaimed(user, tierId, payout);
    }

    function _maybeSnapshotBuy(address user, uint256 cumulative) private {
        uint256 n = tiers.length;
        for (uint8 i = 0; i < n; i++) {
            if (buySnapshot[user][i] == 0 && cumulative >= tiers[i].thresholdUsd) {
                uint256 payout = (cumulative * tiers[i].bps) / 10_000;
                buySnapshot[user][i] = payout;
                emit BuySnapshotTaken(user, i, cumulative, payout);
            }
        }
    }

    function _maybeSnapshotStake(address user, uint256 cumulative) private {
        uint256 n = tiers.length;
        for (uint8 i = 0; i < n; i++) {
            if (stakeSnapshot[user][i] == 0 && cumulative >= tiers[i].thresholdUsd) {
                uint256 payout = (cumulative * tiers[i].bps) / 10_000;
                stakeSnapshot[user][i] = payout;
                emit StakeSnapshotTaken(user, i, cumulative, payout);
            }
        }
    }
}
