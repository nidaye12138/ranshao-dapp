// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDividendPools} from "./interfaces/IDividendPools.sol";
import {IEliteStakeDaily} from "./interfaces/IEliteStakeDaily.sol";
import {Constants} from "./Constants.sol";

/// @title T4 stake desk — UMplan principal; daily precip×5% auto-pushed to wallets (Owner cron).
/// @dev Unlock gate: DividendPools.tierOf == 4. Min lock / extend: 24h.
contract EliteStake is IEliteStakeDaily, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;
    /// @notice Dividend token — product default UMplan (same as stakingToken).
    IERC20 public immutable rewardToken;
    IDividendPools public dividends;
    address public precip;

    uint256 public totalStaked;
    mapping(address => uint256) public stakedOf;

    // Legacy accumulator path (optional owner notifyRelease) — daily push is primary.
    uint256 public accRewardPerToken;
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public pending;

    mapping(address => uint256) public unlockAt;

    address[] private _stakers;
    mapping(address => uint256) private _stakerIndex; // 1-based

    /// @dev In-flight daily push (batching).
    uint256 public pushRemaining;
    uint256 public pushCursor;
    uint256 public pushSnapTotal;
    uint256 public pushRoundAmount;

    event Staked(address indexed user, uint256 amount, uint256 unlockAt);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event ClaimExtended(address indexed user, uint256 newUnlockAt);
    event Redeemed(address indexed user, uint256 principal, uint256 reward);
    event ReleaseNotified(uint256 totalRelease, uint256 rewardAmount);
    event DailyPushed(address indexed user, uint256 amount, uint256 newUnlockAt);
    event DailyPushStarted(uint256 amount, uint256 stakers, uint256 snapTotal);
    event DailyPushFinished(uint256 roundAmount, uint256 paid);
    event DividendsUpdated(address dividends);
    event PrecipUpdated(address precip);

    modifier onlyPrecip() {
        require(msg.sender == precip, "elite: not precip");
        _;
    }

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

    function setPrecip(address precip_) external onlyOwner {
        require(precip_ != address(0), "elite: zero");
        precip = precip_;
        emit PrecipUpdated(precip_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function stakerCount() external view returns (uint256) {
        return _stakers.length;
    }

    function stakerAt(uint256 index) external view returns (address) {
        return _stakers[index];
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

    function _addStaker(address user) private {
        if (_stakerIndex[user] != 0) return;
        _stakers.push(user);
        _stakerIndex[user] = _stakers.length;
    }

    function _removeStaker(address user) private {
        uint256 idx = _stakerIndex[user];
        if (idx == 0) return;
        uint256 i = idx - 1;
        address last = _stakers[_stakers.length - 1];
        _stakers[i] = last;
        _stakerIndex[last] = i + 1;
        _stakers.pop();
        _stakerIndex[user] = 0;
    }

    function _extendUnlock(address user) private {
        uint256 base = unlockAt[user];
        if (base < block.timestamp) base = block.timestamp;
        uint256 neu = base + Constants.CLAIM_COOLDOWN;
        unlockAt[user] = neu;
        emit ClaimExtended(user, neu);
    }

    function isUnlocked(address user) public view returns (bool) {
        uint256 u = unlockAt[user];
        return u != 0 && block.timestamp >= u;
    }

    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "elite: zero");
        require(_isElite(msg.sender), "elite: not t4");
        require(pushRemaining == 0, "elite: push inflight");
        _harvest(msg.sender);

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        stakedOf[msg.sender] += amount;
        totalStaked += amount;
        rewardDebt[msg.sender] = (stakedOf[msg.sender] * accRewardPerToken) / 1e18;
        _addStaker(msg.sender);

        uint256 unlock = block.timestamp + Constants.CLAIM_COOLDOWN;
        unlockAt[msg.sender] = unlock;
        emit Staked(msg.sender, amount, unlock);
    }

    function unstake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0 && amount <= stakedOf[msg.sender], "elite: amount");
        require(isUnlocked(msg.sender), "elite: locked");
        require(pushRemaining == 0, "elite: push inflight");
        _harvest(msg.sender);
        stakedOf[msg.sender] -= amount;
        totalStaked -= amount;
        rewardDebt[msg.sender] = (stakedOf[msg.sender] * accRewardPerToken) / 1e18;
        if (stakedOf[msg.sender] == 0) {
            unlockAt[msg.sender] = 0;
            _removeStaker(msg.sender);
        }
        stakingToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claim() external nonReentrant whenNotPaused {
        require(stakedOf[msg.sender] > 0, "elite: no stake");
        require(isUnlocked(msg.sender), "elite: locked");
        _harvest(msg.sender);
        rewardDebt[msg.sender] = (stakedOf[msg.sender] * accRewardPerToken) / 1e18;
        uint256 amount = pending[msg.sender];
        require(amount > 0, "elite: zero");
        pending[msg.sender] = 0;
        rewardToken.safeTransfer(msg.sender, amount);
        _extendUnlock(msg.sender);
        emit Claimed(msg.sender, amount);
    }

    function redeem() external nonReentrant whenNotPaused {
        require(stakedOf[msg.sender] > 0, "elite: no stake");
        require(isUnlocked(msg.sender), "elite: locked");
        require(pushRemaining == 0, "elite: push inflight");
        _harvest(msg.sender);

        uint256 principal = stakedOf[msg.sender];
        uint256 reward = pending[msg.sender];
        stakedOf[msg.sender] = 0;
        totalStaked -= principal;
        pending[msg.sender] = 0;
        rewardDebt[msg.sender] = 0;
        unlockAt[msg.sender] = 0;
        _removeStaker(msg.sender);

        stakingToken.safeTransfer(msg.sender, principal);
        if (reward > 0) {
            rewardToken.safeTransfer(msg.sender, reward);
        }
        emit Redeemed(msg.sender, principal, reward);
        emit Unstaked(msg.sender, principal);
        if (reward > 0) emit Claimed(msg.sender, reward);
    }

    /// @notice Legacy: owner notifies an external release; 5% of that amount to stakers (pull model).
    function notifyRelease(uint256 totalRelease) external onlyOwner nonReentrant {
        require(totalRelease > 0, "elite: zero");
        require(totalStaked > 0, "elite: no stake");
        uint256 rewardAmount = (totalRelease * Constants.ELITE_RELEASE_BPS) / Constants.BPS_DENOM;
        rewardToken.safeTransferFrom(msg.sender, address(this), rewardAmount);
        accRewardPerToken += (rewardAmount * 1e18) / totalStaked;
        emit ReleaseNotified(totalRelease, rewardAmount);
    }

    /// @inheritdoc IEliteStakeDaily
    /// @dev Tokens must already be on this contract (transferred by PrecipitationPool).
    ///      When rewardToken == stakingToken, principal is reserved: balance ≥ totalStaked + amount.
    function pushDailyRelease(uint256 amount) external onlyPrecip nonReentrant {
        require(amount > 0, "elite: zero");
        require(totalStaked > 0, "elite: no stake");
        require(pushRemaining == 0, "elite: push inflight");
        require(rewardToken.balanceOf(address(this)) >= totalStaked + amount, "elite: funds");

        pushRoundAmount = amount;
        pushRemaining = amount;
        pushCursor = 0;
        pushSnapTotal = totalStaked;
        emit DailyPushStarted(amount, _stakers.length, pushSnapTotal);

        _continuePush(type(uint256).max);
    }

    /// @notice Owner continues a batched daily push if the first call hit gas limits.
    function continuePush(uint256 limit) external onlyOwner nonReentrant {
        require(pushRemaining > 0, "elite: no push");
        _continuePush(limit);
    }

    function _continuePush(uint256 limit) private {
        uint256 n = _stakers.length;
        uint256 paid;
        uint256 processed;
        while (pushCursor < n && processed < limit) {
            address u = _stakers[pushCursor];
            pushCursor++;
            processed++;
            uint256 stake_ = stakedOf[u];
            if (stake_ == 0) continue;
            uint256 share = (pushRoundAmount * stake_) / pushSnapTotal;
            if (share == 0) continue;
            if (share > pushRemaining) share = pushRemaining;
            pushRemaining -= share;
            rewardToken.safeTransfer(u, share);
            _extendUnlock(u);
            paid += share;
            emit DailyPushed(u, share, unlockAt[u]);
            if (pushRemaining == 0) break;
        }

        if (pushCursor >= n || pushRemaining == 0) {
            // Dust (rounding) stays on EliteStake for next rounds / owner sweep.
            uint256 round = pushRoundAmount;
            pushRemaining = 0;
            pushCursor = 0;
            pushRoundAmount = 0;
            pushSnapTotal = 0;
            emit DailyPushFinished(round, paid);
        }
    }

    function pendingRewards(address user) external view returns (uint256) {
        uint256 stake_ = stakedOf[user];
        uint256 accumulated = (stake_ * accRewardPerToken) / 1e18;
        uint256 extra = accumulated > rewardDebt[user] ? accumulated - rewardDebt[user] : 0;
        return pending[user] + extra;
    }
}
