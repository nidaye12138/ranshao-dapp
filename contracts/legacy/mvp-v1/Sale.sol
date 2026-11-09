// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMintableERC20} from "./interfaces/IMintableERC20.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IReferralRegistry} from "./interfaces/IReferralRegistry.sol";
import {IMilestoneRewards} from "./interfaces/IMilestoneRewards.sol";

/// @title BNB / USDT sale with 0.5% buyer + 0.5% referrer instant rewards
/// @dev Mainnet: use mintMode=false with pre-funded inventory of external IERC20 (e.g. UMplan).
///      Testnet: mintMode=true with RanshaoToken (Sale is minter).
contract Sale is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant INSTANT_REWARD_BPS = 50; // 0.5%
    uint16 public constant BPS_DENOM = 10_000;

    IERC20 public immutable token;
    IERC20 public immutable usdt;
    IPriceOracle public oracle;
    IReferralRegistry public registry;
    IMilestoneRewards public milestones;
    address payable public treasury;

    /// @notice If true, deliver via IMintableERC20.mint; if false, transfer from Sale inventory.
    bool public immutable mintMode;
    /// @notice Max tolerated shortfall on token delivery / pulls for fee-on-transfer tokens (e.g. 300 = 3%).
    uint16 public maxTransferTaxBps;
    uint8 public usdtDecimals;

    event Bought(
        address indexed buyer,
        address indexed paymentToken,
        uint256 paymentAmount,
        uint256 usdAmount,
        uint256 tokenAmountQuoted,
        uint256 tokenAmountDelivered,
        uint256 buyerReward,
        uint256 referrerReward
    );
    event ConfigUpdated(address oracle, address registry, address milestones, address treasury);
    event InventoryDeposited(address indexed from, uint256 amount);
    event MaxTransferTaxUpdated(uint16 bps);

    constructor(
        address admin,
        address token_,
        address usdt_,
        uint8 usdtDecimals_,
        address oracle_,
        address registry_,
        address milestones_,
        address payable treasury_,
        bool mintMode_,
        uint16 maxTransferTaxBps_
    ) Ownable(admin) {
        require(
            token_ != address(0) && usdt_ != address(0) && oracle_ != address(0) && registry_ != address(0)
                && milestones_ != address(0) && treasury_ != address(0),
            "sale: zero"
        );
        require(maxTransferTaxBps_ <= 2_000, "sale: tax too high");
        token = IERC20(token_);
        usdt = IERC20(usdt_);
        usdtDecimals = usdtDecimals_;
        oracle = IPriceOracle(oracle_);
        registry = IReferralRegistry(registry_);
        milestones = IMilestoneRewards(milestones_);
        treasury = treasury_;
        mintMode = mintMode_;
        maxTransferTaxBps = maxTransferTaxBps_;
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

    function setMaxTransferTaxBps(uint16 bps) external onlyOwner {
        require(bps <= 2_000, "sale: tax too high");
        maxTransferTaxBps = bps;
        emit MaxTransferTaxUpdated(bps);
    }

    /// @notice Fund inventory for external-token (non-mint) sales. Prefer transferring from a tax-exempt pair/wallet.
    function depositInventory(uint256 amount) external onlyOwner {
        require(!mintMode, "sale: mint mode");
        require(amount > 0, "sale: zero");
        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - beforeBal;
        require(received > 0, "sale: fot zero");
        emit InventoryDeposited(msg.sender, received);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function quoteUsdt(uint256 usdtAmount) public view returns (uint256 tokenOut, uint256 usdAmount) {
        usdAmount = _usdtToUsd(usdtAmount);
        tokenOut = _tokensForUsd(usdAmount);
    }

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

        uint256 delivered = _deliverTokens(buyer, tokenOut);
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

        emit Bought(buyer, address(usdt), usdtAmount, usdAmount, tokenOut, delivered, reward, paidToRef);
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

        uint256 delivered = _deliverTokens(buyer, tokenOut);
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

        emit Bought(buyer, address(0), bnbAmount, usdAmount, tokenOut, delivered, reward, paidToRef);
    }

    function _deliverTokens(address to, uint256 amount) private returns (uint256 delivered) {
        if (mintMode) {
            IMintableERC20(address(token)).mint(to, amount);
            return amount;
        }
        uint256 beforeBal = token.balanceOf(to);
        token.safeTransfer(to, amount);
        delivered = token.balanceOf(to) - beforeBal;
        _requireWithinTax(amount, delivered);
    }

    function _requireWithinTax(uint256 expected, uint256 actual) private view {
        // actual >= expected * (1 - maxTransferTaxBps / 10000)
        require(actual * BPS_DENOM >= expected * (BPS_DENOM - maxTransferTaxBps), "sale: fot too high");
    }

    function _tokensForUsd(uint256 usdAmount) private view returns (uint256) {
        uint256 price = oracle.tokenUsd();
        require(price > 0, "sale: bad price");
        return (usdAmount * 1e18) / price;
    }

    function _usdtToUsd(uint256 usdtAmount) private view returns (uint256) {
        if (usdtDecimals == 18) return usdtAmount;
        if (usdtDecimals < 18) return usdtAmount * (10 ** (18 - usdtDecimals));
        return usdtAmount / (10 ** (usdtDecimals - 18));
    }

    function _sendBnb(address payable to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "sale: bnb xfer");
    }
}
