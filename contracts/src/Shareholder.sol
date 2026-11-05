// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IReferralRegistry} from "./interfaces/IReferralRegistry.sol";
import {IStakeView} from "./interfaces/IStakeView.sol";

/// @title Limited shareholder seats with qualify check + simple dividend round stub
contract Shareholder is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_SEATS = 300;
    uint256 public minSelfBalance = 500_000e18;
    uint256 public minDirectsBalance = 5_000_000e18;

    IERC20 public immutable token;
    IReferralRegistry public registry;
    IStakeView public stake;

    address[] public shareholders;
    mapping(address => bool) public isShareholder;
    mapping(address => uint256) public seatIndex; // 1-based; 0 = none

    struct DividendRound {
        IERC20 rewardToken;
        uint256 amountPerSeat;
        uint256 totalSeatsSnapshot;
        uint256 claimedCount;
        bool active;
    }

    DividendRound[] public rounds;
    mapping(uint256 => mapping(address => bool)) public roundClaimed;

    event Registered(address indexed user, uint256 seat);
    event RoundPublished(uint256 indexed roundId, address rewardToken, uint256 amountPerSeat, uint256 seats);
    event RoundClaimed(uint256 indexed roundId, address indexed user, uint256 amount);
    event ConfigUpdated(address registry, address stake);

    constructor(address admin, address token_, address registry_, address stake_) Ownable(admin) {
        require(token_ != address(0) && registry_ != address(0), "sh: zero");
        token = IERC20(token_);
        registry = IReferralRegistry(registry_);
        stake = IStakeView(stake_);
    }

    function setConfig(address registry_, address stake_) external onlyOwner {
        if (registry_ != address(0)) registry = IReferralRegistry(registry_);
        if (stake_ != address(0)) stake = IStakeView(stake_);
        emit ConfigUpdated(address(registry), address(stake));
    }

    function setThresholds(uint256 selfBal, uint256 directsBal) external onlyOwner {
        minSelfBalance = selfBal;
        minDirectsBalance = directsBal;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function seatCount() external view returns (uint256) {
        return shareholders.length;
    }

    /// @notice Direct holdings = wallet balance + currently staked amount.
    function holdingsOf(address user) public view returns (uint256) {
        uint256 bal = token.balanceOf(user);
        uint256 staked = address(stake) == address(0) ? 0 : stake.stakedBalance(user);
        return bal + staked;
    }

    function directsHoldings(address user) public view returns (uint256 total) {
        address[] memory refs = registry.getDirectRefs(user);
        for (uint256 i = 0; i < refs.length; i++) {
            total += holdingsOf(refs[i]);
        }
    }

    function qualifies(address user) public view returns (bool) {
        return holdingsOf(user) >= minSelfBalance && directsHoldings(user) >= minDirectsBalance;
    }

    function register() external nonReentrant whenNotPaused {
        address user = msg.sender;
        require(!isShareholder[user], "sh: already");
        require(shareholders.length < MAX_SEATS, "sh: full");
        require(qualifies(user), "sh: not qualified");

        shareholders.push(user);
        isShareholder[user] = true;
        seatIndex[user] = shareholders.length; // 1-based
        emit Registered(user, shareholders.length);
    }

    /// @notice Admin publishes an equal-per-seat claim round (MVP stub).
    function publishRound(address rewardToken, uint256 amountPerSeat) external onlyOwner {
        require(rewardToken != address(0) && amountPerSeat > 0, "sh: bad round");
        uint256 seats = shareholders.length;
        require(seats > 0, "sh: no seats");
        uint256 total = amountPerSeat * seats;
        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), total);
        rounds.push(
            DividendRound({
                rewardToken: IERC20(rewardToken),
                amountPerSeat: amountPerSeat,
                totalSeatsSnapshot: seats,
                claimedCount: 0,
                active: true
            })
        );
        emit RoundPublished(rounds.length - 1, rewardToken, amountPerSeat, seats);
    }

    function claimRound(uint256 roundId) external nonReentrant whenNotPaused {
        require(isShareholder[msg.sender], "sh: not shareholder");
        DividendRound storage r = rounds[roundId];
        require(r.active, "sh: inactive");
        require(!roundClaimed[roundId][msg.sender], "sh: claimed");
        // Re-check qualification at claim time (simple MVP policy).
        require(qualifies(msg.sender), "sh: disqualified");

        roundClaimed[roundId][msg.sender] = true;
        r.claimedCount += 1;
        r.rewardToken.safeTransfer(msg.sender, r.amountPerSeat);
        emit RoundClaimed(roundId, msg.sender, r.amountPerSeat);
    }

    function roundCount() external view returns (uint256) {
        return rounds.length;
    }
}
