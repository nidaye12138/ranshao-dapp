// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IReferralRegistry} from "./interfaces/IReferralRegistry.sol";
import {IMilestoneRewards} from "./interfaces/IMilestoneRewards.sol";
import {IStakeView} from "./interfaces/IStakeView.sol";

/// @title Project-token staking with 15d/30d yields and principal-only auto-renew
contract Stake is IStakeView, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_STAKE_USD = 100e18;
    uint64 public constant DAY = 1 days;
    uint16 public constant RATE_15D_BPS = 200; // 2%
    uint16 public constant RATE_30D_BPS = 500; // 5%
    uint16 public constant BPS_DENOM = 10_000;

    struct Position {
        uint128 amount;
        uint64 start;
        uint64 lastRenew;
        bool active;
    }

    IERC20 public immutable token;
    IPriceOracle public oracle;
    IReferralRegistry public registry;
    IMilestoneRewards public milestones;

    mapping(address => Position[]) private _positions;
    mapping(address => uint256) public stakedBalance;
    uint256 public rewardReserve;
    bool public reportStakeMilestones; // Phase 2 flag; default false for MVP

    event Staked(address indexed user, uint256 indexed posId, uint256 amount, uint256 usdAmount);
    event Withdrawn(address indexed user, uint256 indexed posId, uint256 principal, uint256 interest);
    event AutoRenewed(address indexed user, uint256 indexed posId, uint256 principal, uint256 interestPaid);
    event RewardFunded(uint256 amount);
    event ConfigUpdated(address oracle, address registry, address milestones);

    constructor(
        address admin,
        address token_,
        address oracle_,
        address registry_,
        address milestones_
    ) Ownable(admin) {
        require(token_ != address(0) && oracle_ != address(0), "stake: zero");
        token = IERC20(token_);
        oracle = IPriceOracle(oracle_);
        registry = IReferralRegistry(registry_);
        milestones = IMilestoneRewards(milestones_);
    }

    function setConfig(address oracle_, address registry_, address milestones_) external onlyOwner {
        if (oracle_ != address(0)) oracle = IPriceOracle(oracle_);
        if (registry_ != address(0)) registry = IReferralRegistry(registry_);
        if (milestones_ != address(0)) milestones = IMilestoneRewards(milestones_);
        emit ConfigUpdated(address(oracle), address(registry), address(milestones));
    }

    function setReportStakeMilestones(bool enabled) external onlyOwner {
        reportStakeMilestones = enabled;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function fundRewards(uint256 amount) external onlyOwner {
        token.safeTransferFrom(msg.sender, address(this), amount);
        rewardReserve += amount;
        emit RewardFunded(amount);
    }

    function positionCount(address user) external view returns (uint256) {
        return _positions[user].length;
    }

    function getPosition(address user, uint256 posId)
        external
        view
        returns (uint128 amount, uint64 start, uint64 lastRenew, bool active)
    {
        Position storage p = _positions[user][posId];
        return (p.amount, p.start, p.lastRenew, p.active);
    }

    function previewInterest(address user, uint256 posId) public view returns (uint256) {
        Position storage p = _positions[user][posId];
        if (!p.active) return 0;
        uint64 elapsed = uint64(block.timestamp) - p.start;
        if (elapsed >= 30 * DAY) {
            return (uint256(p.amount) * RATE_30D_BPS) / BPS_DENOM;
        }
        if (elapsed >= 15 * DAY) {
            return (uint256(p.amount) * RATE_15D_BPS) / BPS_DENOM;
        }
        return 0;
    }

    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "stake: zero");
        uint256 price = oracle.tokenUsd();
        require(price > 0, "stake: bad price");
        uint256 usd = (amount * price) / 1e18;
        require(usd >= MIN_STAKE_USD, "stake: min 100 USD");

        address user = msg.sender;
        token.safeTransferFrom(user, address(this), amount);

        stakedBalance[user] += amount;
        _positions[user].push(
            Position({amount: uint128(amount), start: uint64(block.timestamp), lastRenew: uint64(block.timestamp), active: true})
        );
        uint256 posId = _positions[user].length - 1;

        if (reportStakeMilestones && address(registry) != address(0) && address(milestones) != address(0)) {
            address referrer = registry.referrerOf(user);
            if (referrer != address(0)) {
                milestones.addStakeVolume(referrer, usd);
            }
        }

        emit Staked(user, posId, amount, usd);
    }

    /// @notice Withdraw principal (+ interest if eligible). Closes the position.
    function withdraw(uint256 posId) external nonReentrant whenNotPaused {
        address user = msg.sender;
        Position storage p = _positions[user][posId];
        require(p.active, "stake: inactive");

        uint256 principal = p.amount;
        uint256 interest = previewInterest(user, posId);
        p.active = false;
        stakedBalance[user] -= principal;

        if (interest > 0) {
            require(rewardReserve >= interest, "stake: no rewards");
            rewardReserve -= interest;
        }

        token.safeTransfer(user, principal + interest);
        emit Withdrawn(user, posId, principal, interest);
    }

    /// @notice After ≥30d, pay out interest and roll principal into a new 30d window (no compound).
    function autoRenew(uint256 posId) external nonReentrant whenNotPaused {
        address user = msg.sender;
        Position storage p = _positions[user][posId];
        require(p.active, "stake: inactive");
        uint64 elapsed = uint64(block.timestamp) - p.start;
        require(elapsed >= 30 * DAY, "stake: not mature");

        uint256 interest = (uint256(p.amount) * RATE_30D_BPS) / BPS_DENOM;
        require(rewardReserve >= interest, "stake: no rewards");
        rewardReserve -= interest;

        p.start = uint64(block.timestamp);
        p.lastRenew = uint64(block.timestamp);
        // principal unchanged — interest not compounded

        if (interest > 0) {
            token.safeTransfer(user, interest);
        }
        emit AutoRenewed(user, posId, p.amount, interest);
    }
}
