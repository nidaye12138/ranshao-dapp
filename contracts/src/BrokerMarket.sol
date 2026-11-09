// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Broker card market — Phase 2 stub (Q8).
/// @dev Accepts fee deposits into a market dividend sink; full trading is out of MVP scope.
contract BrokerMarket is Ownable {
    using SafeERC20 for IERC20;

    address public feeSink;
    uint256 public totalFeesReceived;

    event FeeReceived(address indexed token, address indexed from, uint256 amount);
    event FeeSinkUpdated(address sink);

    constructor(address admin, address feeSink_) Ownable(admin) {
        feeSink = feeSink_;
    }

    function setFeeSink(address sink) external onlyOwner {
        feeSink = sink;
        emit FeeSinkUpdated(sink);
    }

    /// @notice Placeholder fee intake for Phase 2 broker-card trades.
    function receiveFee(address token, uint256 amount) external {
        require(feeSink != address(0), "broker: no sink");
        require(amount > 0, "broker: zero");
        IERC20(token).safeTransferFrom(msg.sender, feeSink, amount);
        totalFeesReceived += amount;
        emit FeeReceived(token, msg.sender, amount);
    }
}
