// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {RanshaoToken} from "./RanshaoToken.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IReferralRegistry} from "./interfaces/IReferralRegistry.sol";
import {IMilestoneRewards} from "./interfaces/IMilestoneRewards.sol";

/// @title BNB / USDT sale with 0.5% buyer + 0.5% referrer instant rewards
contract Sale is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant INSTANT_REWARD_BPS = 50; // 0.5%
    uint16 public constant BPS_DENOM = 10_000;

    RanshaoToken public immutable token;
    IERC20 public immutable usdt;
    IPriceOracle public oracle;
    IReferralRegistry public registry;
    IMilestoneRewards public milestones;
    address payable public treasury;

    /// @notice Fallback fixed token USD price (1e18) if oracle.tokenUsd() is used via oracle.
    /// Sale always reads oracle.tokenUsd() / oracle.bnbUsd().
    uint8 public usdtDecimals;

    event Bought(
        address indexed buyer,
        address indexed paymentToken,
        uint256 paymentAmount,
        uint256 usdAmount,
        uint256 tokenAmount,
        uint256 buyerReward,
        uint256 referrerReward
    );
    event ConfigUpdated(address oracle, address registry, address milestones, address treasury);

    constructor(
        address admin,
        address token_,
        address usdt_,
        uint8 usdtDecimals_,
        address oracle_,
        address registry_,
        address milestones_,
        address payable treasury_
    ) Ownable(admin) {
        require(
            token_ != address(0) && usdt_ != address(0) && oracle_ != address(0) && registry_ != address(0)
                && milestones_ != address(0) && treasury_ != address(0),
            "sale: zero"
        );
        token = RanshaoToken(token_);
        usdt = IERC20(usdt_);
        usdtDecimals = usdtDecimals_;
        oracle = IPriceOracle(oracle_);
        registry = IReferralRegistry(registry_);
        milestones = IMilestoneRewards(milestones_);
        treasury = treasury_;
    }

    function setConfig(address oracle_, address registry_, address milestones_, address payable treasury_)
        external
        onlyOwner
    {
        if (oracle_ != address(0)) oracle = IPriceOracle(oracle_);
        if (registry_ != address(0)) registry = IReferralRegistry(registry_);
        if (milestones_ != address(0)) milestones = IMilestoneRewards(milestones_);
        if (treasury_ != address(0)) treasury = treasury_;
        emit ConfigUpdated(address(oracle), address(registry), address(milestones), treasury);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Preview tokens out for a USDT payment amount.
    function quoteUsdt(uint256 usdtAmount) public view returns (uint256 tokenOut, uint256 usdAmount) {
        usdAmount = _usdtToUsd(usdtAmount);
        tokenOut = _tokensForUsd(usdAmount);
    }

    /// @notice Preview tokens out for a BNB payment amount (wei).
    function quoteBnb(uint256 bnbAmount) public view returns (uint256 tokenOut, uint256 usdAmount) {
        usdAmount = (bnbAmount * oracle.bnbUsd()) / 1e18;
        tokenOut = _tokensForUsd(usdAmount);
    }

    function buyWithUSDT(uint256 usdtAmount) external nonReentrant whenNotPaused {
        require(usdtAmount > 0, "sale: zero");
        address buyer = msg.sender;
        (uint256 tokenOut, uint256 usdAmount) = quoteUsdt(usdtAmount);
        require(tokenOut > 0, "sale: zero tokens");

        uint256 reward = (usdtAmount * INSTANT_REWARD_BPS) / BPS_DENOM;
        address referrer = registry.referrerOf(buyer);

        usdt.safeTransferFrom(buyer, address(this), usdtAmount);

        registry.recordPurchase(buyer, usdAmount);
        if (referrer != address(0)) {
            milestones.addBuyVolume(referrer, usdAmount);
        }

        token.mint(buyer, tokenOut);
        usdt.safeTransfer(buyer, reward);

        uint256 paidToRef = 0;
        if (referrer != address(0)) {
            usdt.safeTransfer(referrer, reward);
            paidToRef = reward;
        } else {
            usdt.safeTransfer(treasury, reward);
        }

        uint256 remainder = usdt.balanceOf(address(this));
        if (remainder > 0) usdt.safeTransfer(treasury, remainder);

        emit Bought(buyer, address(usdt), usdtAmount, usdAmount, tokenOut, reward, paidToRef);
    }

    function buyWithBNB() external payable nonReentrant whenNotPaused {
        uint256 bnbAmount = msg.value;
        require(bnbAmount > 0, "sale: zero");
        address buyer = msg.sender;
        (uint256 tokenOut, uint256 usdAmount) = quoteBnb(bnbAmount);
        require(tokenOut > 0, "sale: zero tokens");

        uint256 reward = (bnbAmount * INSTANT_REWARD_BPS) / BPS_DENOM;
        address referrer = registry.referrerOf(buyer);

        registry.recordPurchase(buyer, usdAmount);
        if (referrer != address(0)) {
            milestones.addBuyVolume(referrer, usdAmount);
        }

        token.mint(buyer, tokenOut);
        _sendBnb(payable(buyer), reward);

        uint256 paidToRef = 0;
        if (referrer != address(0)) {
            _sendBnb(payable(referrer), reward);
            paidToRef = reward;
        } else {
            _sendBnb(treasury, reward);
        }

        uint256 remainder = address(this).balance;
        if (remainder > 0) _sendBnb(treasury, remainder);

        emit Bought(buyer, address(0), bnbAmount, usdAmount, tokenOut, reward, paidToRef);
    }

    function _tokensForUsd(uint256 usdAmount) private view returns (uint256) {
        uint256 price = oracle.tokenUsd();
        require(price > 0, "sale: bad price");
        return (usdAmount * 1e18) / price;
    }

    function _usdtToUsd(uint256 usdtAmount) private view returns (uint256) {
        // Treat USDT ≈ $1. Normalize to 1e18 USD.
        if (usdtDecimals == 18) return usdtAmount;
        if (usdtDecimals < 18) return usdtAmount * (10 ** (18 - usdtDecimals));
        return usdtAmount / (10 ** (usdtDecimals - 18));
    }

    function _sendBnb(address payable to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "sale: bnb xfer");
    }
}
