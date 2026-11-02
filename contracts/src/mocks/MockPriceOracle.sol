// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

/// @notice Admin-set prices for tests / MVP. Production: wrap Chainlink feeds.
contract MockPriceOracle is IPriceOracle, Ownable {
    uint256 private _bnbUsd;
    uint256 private _tokenUsd;

    event PriceUpdated(uint256 bnbUsd, uint256 tokenUsd);

    constructor(uint256 bnbUsd_, uint256 tokenUsd_) Ownable(msg.sender) {
        _bnbUsd = bnbUsd_;
        _tokenUsd = tokenUsd_;
    }

    function bnbUsd() external view returns (uint256) {
        return _bnbUsd;
    }

    function tokenUsd() external view returns (uint256) {
        return _tokenUsd;
    }

    function setPrices(uint256 bnbUsd_, uint256 tokenUsd_) external onlyOwner {
        require(bnbUsd_ > 0 && tokenUsd_ > 0, "oracle: zero");
        _bnbUsd = bnbUsd_;
        _tokenUsd = tokenUsd_;
        emit PriceUpdated(bnbUsd_, tokenUsd_);
    }
}
