// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDividendPools} from "./interfaces/IDividendPools.sol";
import {Constants} from "./Constants.sol";

/// @title Optional 1500U-tier stake — reward = (totalRelease × 5%) / totalStaked (Q6 admin notify).
/// @dev Stakes project token; rewards paid in `rewardToken` (MVP default: SPCXB).
contract EliteStake is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken;
    IDividendPools public dividends;

    uint256 public totalStaked;
    mapping(address => uint256) public stakedOf;

    // Scaled accumulator (1e18)
    uint256 public accRewardPerToken;
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public pending;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event ReleaseNotified(uint256 totalRelease, uint256 rewardAmount);
    event DividendsUpdated(address dividends);

    constructor(address admin, address stakingToken_, address rewardToken_, address dividends_) Ownable(admin) {
        require(stakingToken_ != address(0) && rewardToken_ != address(0) && dividends_ != address(0), "elite: zero");
        stakingToken = IERC20(stakingToken_);
        rewardToken = IERC20(rewardToken_);
        dividends = IDividendPools(dividends_);
    }

    function setDividends(address dividends_) external onlyOwner {
        require(dividends_ != address(0), "elite: zero");
        dividends = IDividendPools(dividends_);
        emit DividendsUpdated(dividends_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _isElite(address user) private view returns (bool) {
        return dividends.tierOf(user) == 4;
    }

    function _harvest(address user) private {
        uint256 stake_ = stakedOf[user];
        if (stake_ > 0) {
            uint256 accumulated = (stake_ * accRewardPerToken) / 1e18;
            if (accumulated > rewardDebt[user]) {
                pending[user] += accumulated - rewardDebt[user];
            }
        }
    }

    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "elite: zero");
        require(_isElite(msg.sender), "elite: not t4");
        _harvest(msg.sender);

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        stakedOf[msg.sender] += amount;
        totalStaked += amount;
        rewardDebt[msg.sender] = (stakedOf[msg.sender] * accRewardPerToken) / 1e18;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0 && amount <= stakedOf[msg.sender], "elite: amount");
        _harvest(msg.sender);
        stakedOf[msg.sender] -= amount;
        totalStaked -= amount;
        rewardDebt[msg.sender] = (stakedOf[msg.sender] * accRewardPerToken) / 1e18;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claim() external nonReentrant whenNotPaused {
        _harvest(msg.sender);
        rewardDebt[msg.sender] = (stakedOf[msg.sender] * accRewardPerToken) / 1e18;
        uint256 amount = pending[msg.sender];
        require(amount > 0, "elite: zero");
        pending[msg.sender] = 0;
        rewardToken.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    /// @notice Q6: admin notifies a release; 5% of that amount is distributed to current stakers.
    /// @dev Pulls `totalRelease * 5%` of rewardToken from admin.
    function notifyRelease(uint256 totalRelease) external onlyOwner nonReentrant {
        require(totalRelease > 0, "elite: zero");
        require(totalStaked > 0, "elite: no stake");
        uint256 rewardAmount = (totalRelease * Constants.ELITE_RELEASE_BPS) / Constants.BPS_DENOM;
        rewardToken.safeTransferFrom(msg.sender, address(this), rewardAmount);
        accRewardPerToken += (rewardAmount * 1e18) / totalStaked;
        emit ReleaseNotified(totalRelease, rewardAmount);
    }

    function pendingRewards(address user) external view returns (uint256) {
        uint256 stake_ = stakedOf[user];
        uint256 accumulated = (stake_ * accRewardPerToken) / 1e18;
        uint256 extra = accumulated > rewardDebt[user] ? accumulated - rewardDebt[user] : 0;
        return pending[user] + extra;
    }
}
