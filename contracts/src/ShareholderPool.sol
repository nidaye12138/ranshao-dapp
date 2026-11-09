// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IShareholderPool} from "./interfaces/IShareholderPool.sol";
import {Constants} from "./Constants.sol";

/// @title Shareholder pool — 10% of burns, equal claim; seats cap 453 (Q7b admin whitelist).
contract ShareholderPool is IShareholderPool, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public burnRouter;

    address[] public shareholders;
    mapping(address => bool) public isShareholder;
    mapping(address => uint256) public seatIndex; // 1-based
    mapping(address => uint256) public claimable;
    uint256 public undistributed;

    event SeatAdded(address indexed user, uint256 seat);
    event SeatRemoved(address indexed user);
    event BurnShareReceived(uint256 amount, uint256 perSeat, uint256 seats);
    event Claimed(address indexed user, uint256 amount);
    event BurnRouterUpdated(address burnRouter);

    modifier onlyBurnRouter() {
        require(msg.sender == burnRouter, "sh: not router");
        _;
    }

    constructor(address admin, address token_) Ownable(admin) {
        require(token_ != address(0), "sh: zero");
        token = IERC20(token_);
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

    function seatCount() external view returns (uint256) {
        return shareholders.length;
    }

    /// @notice Q7b: admin whitelist seats up to 453.
    function addShareholder(address user) external onlyOwner {
        require(user != address(0), "sh: zero");
        require(!isShareholder[user], "sh: already");
        require(shareholders.length < Constants.MAX_SHAREHOLDER_SEATS, "sh: full");
        shareholders.push(user);
        isShareholder[user] = true;
        seatIndex[user] = shareholders.length;
        emit SeatAdded(user, shareholders.length);
    }

    function removeShareholder(address user) external onlyOwner {
        require(isShareholder[user], "sh: not");
        uint256 idx = seatIndex[user] - 1;
        address last = shareholders[shareholders.length - 1];
        shareholders[idx] = last;
        seatIndex[last] = idx + 1;
        shareholders.pop();
        isShareholder[user] = false;
        seatIndex[user] = 0;
        emit SeatRemoved(user);
    }

    /// @inheritdoc IShareholderPool
    /// @dev Pulls `amount` from BurnRouter via transferFrom.
    function receiveBurnShare(uint256 amount) external onlyBurnRouter nonReentrant {
        require(amount > 0, "sh: zero");
        token.safeTransferFrom(msg.sender, address(this), amount);

        uint256 seats = shareholders.length;
        uint256 pool = amount + undistributed;
        if (seats == 0) {
            undistributed = pool;
            emit BurnShareReceived(amount, 0, 0);
            return;
        }
        uint256 each = pool / seats;
        undistributed = pool - each * seats;
        if (each > 0) {
            for (uint256 i = 0; i < seats; i++) {
                claimable[shareholders[i]] += each;
            }
        }
        emit BurnShareReceived(amount, each, seats);
    }

    function claim() external nonReentrant whenNotPaused {
        require(isShareholder[msg.sender], "sh: not shareholder");
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "sh: zero");
        claimable[msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }
}
