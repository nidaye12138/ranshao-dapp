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
/// @dev Stakes project token (UMplan). Rewards paid in `rewardToken` (deploy default: SPCXB —
///      copy wants UMplan; do not silently retarget economics without redeploy/admin plan).
///      Unlock: DividendPools.tierOf == 4 (via burnTier button only after BurnRouter change).
///      Min stake / redeem extend: 24 hours.
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

    /// @notice Earliest timestamp when principal may be withdrawn (24h min / extend).
    mapping(address => uint256) public unlockAt;

    event Staked(address indexed user, uint256 amount, uint256 unlockAt);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event ClaimExtended(address indexed user, uint256 newUnlockAt);
    event Redeemed(address indexed user, uint256 principal, uint256 reward);
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

    function isUnlocked(address user) public view returns (bool) {
        uint256 u = unlockAt[user];
        return u != 0 && block.timestamp >= u;
    }

    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "elite: zero");
        require(_isElite(msg.sender), "elite: not t4");
        _harvest(msg.sender);

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        stakedOf[msg.sender] += amount;
        totalStaked += amount;
        rewardDebt[msg.sender] = (stakedOf[msg.sender] * accRewardPerToken) / 1e18;

        // New or top-up stake: restart 24h min lock from now.
        uint256 unlock = block.timestamp + Constants.CLAIM_COOLDOWN;
        unlockAt[msg.sender] = unlock;
        emit Staked(msg.sender, amount, unlock);
    }

    /// @notice Withdraw principal after 24h lock. Does not pay rewards (use claim / redeem).
    function unstake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0 && amount <= stakedOf[msg.sender], "elite: amount");
        require(isUnlocked(msg.sender), "elite: locked");
        _harvest(msg.sender);
        stakedOf[msg.sender] -= amount;
        totalStaked -= amount;
        rewardDebt[msg.sender] = (stakedOf[msg.sender] * accRewardPerToken) / 1e18;
        if (stakedOf[msg.sender] == 0) {
            unlockAt[msg.sender] = 0;
        }
        stakingToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Claim pending rewards only; extend lock +24h from previous unlock (or now if overdue).
    function claim() external nonReentrant whenNotPaused {
        require(stakedOf[msg.sender] > 0, "elite: no stake");
        require(isUnlocked(msg.sender), "elite: locked");
        _harvest(msg.sender);
        rewardDebt[msg.sender] = (stakedOf[msg.sender] * accRewardPerToken) / 1e18;
        uint256 amount = pending[msg.sender];
        require(amount > 0, "elite: zero");
        pending[msg.sender] = 0;
        rewardToken.safeTransfer(msg.sender, amount);

        uint256 base = unlockAt[msg.sender];
        if (base < block.timestamp) base = block.timestamp;
        uint256 newUnlock = base + Constants.CLAIM_COOLDOWN;
        unlockAt[msg.sender] = newUnlock;
        emit Claimed(msg.sender, amount);
        emit ClaimExtended(msg.sender, newUnlock);
    }

    /// @notice Redeem all principal + pending rewards after unlock (clears position).
    function redeem() external nonReentrant whenNotPaused {
        require(stakedOf[msg.sender] > 0, "elite: no stake");
        require(isUnlocked(msg.sender), "elite: locked");
        _harvest(msg.sender);

        uint256 principal = stakedOf[msg.sender];
        uint256 reward = pending[msg.sender];
        stakedOf[msg.sender] = 0;
        totalStaked -= principal;
        pending[msg.sender] = 0;
        rewardDebt[msg.sender] = 0;
        unlockAt[msg.sender] = 0;

        stakingToken.safeTransfer(msg.sender, principal);
        if (reward > 0) {
            rewardToken.safeTransfer(msg.sender, reward);
        }
        emit Redeemed(msg.sender, principal, reward);
        emit Unstaked(msg.sender, principal);
        if (reward > 0) emit Claimed(msg.sender, reward);
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
