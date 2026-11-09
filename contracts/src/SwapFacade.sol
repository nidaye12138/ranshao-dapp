// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMintableERC20} from "./interfaces/IMintableERC20.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IReferralTree} from "./interfaces/IReferralTree.sol";
import {Constants} from "./Constants.sol";

/// @title Swap facade — buy/sell project token with 0.5%/0.5% instant rewards (UI IA C1/C2).
/// @dev Q10: no-referrer 0.5% → Treasury. Q11: rewards in payment token. Q12: Ownable+Pausable.
///      Mainnet: mintMode=false + inventory of external UMplan. Sell needs USDT liquidity.
contract SwapFacade is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IERC20 public immutable usdt;
    IPriceOracle public oracle;
    IReferralTree public tree;
    address payable public treasury;

    bool public immutable mintMode;
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
    event Sold(
        address indexed seller,
        address indexed paymentToken,
        uint256 tokenAmount,
        uint256 paymentQuoted,
        uint256 paymentDelivered,
        uint256 usdAmount,
        uint256 sellerReward,
        uint256 referrerReward
    );
    event ConfigUpdated(address oracle, address tree, address treasury);
    event InventoryDeposited(address indexed from, uint256 amount);
    event UsdtLiquidityDeposited(address indexed from, uint256 amount);
    event MaxTransferTaxUpdated(uint16 bps);

    constructor(
        address admin,
        address token_,
        address usdt_,
        uint8 usdtDecimals_,
        address oracle_,
        address tree_,
        address payable treasury_,
        bool mintMode_,
        uint16 maxTransferTaxBps_
    ) Ownable(admin) {
        require(
            token_ != address(0) && usdt_ != address(0) && oracle_ != address(0) && tree_ != address(0)
                && treasury_ != address(0),
            "swap: zero"
        );
        require(maxTransferTaxBps_ <= 2_000, "swap: tax too high");
        token = IERC20(token_);
        usdt = IERC20(usdt_);
        usdtDecimals = usdtDecimals_;
        oracle = IPriceOracle(oracle_);
        tree = IReferralTree(tree_);
        treasury = treasury_;
        mintMode = mintMode_;
        maxTransferTaxBps = maxTransferTaxBps_;
    }

    function setConfig(address oracle_, address tree_, address payable treasury_) external onlyOwner {
        if (oracle_ != address(0)) oracle = IPriceOracle(oracle_);
        if (tree_ != address(0)) tree = IReferralTree(tree_);
        if (treasury_ != address(0)) treasury = treasury_;
        emit ConfigUpdated(address(oracle), address(tree), treasury);
    }

    function setMaxTransferTaxBps(uint16 bps) external onlyOwner {
        require(bps <= 2_000, "swap: tax too high");
        maxTransferTaxBps = bps;
        emit MaxTransferTaxUpdated(bps);
    }

    function depositInventory(uint256 amount) external onlyOwner {
        require(!mintMode, "swap: mint mode");
        require(amount > 0, "swap: zero");
        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - beforeBal;
        require(received > 0, "swap: fot zero");
        emit InventoryDeposited(msg.sender, received);
    }

    /// @notice Fund USDT liquidity for in-app sells.
    function depositUsdtLiquidity(uint256 amount) external onlyOwner {
        require(amount > 0, "swap: zero");
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        emit UsdtLiquidityDeposited(msg.sender, amount);
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

    /// @notice Quote sell: tokens → USDT (gross before 0.5%+0.5% rewards taken from proceeds).
    function quoteSellUsdt(uint256 tokenAmount) public view returns (uint256 usdtOut, uint256 usdAmount) {
        usdAmount = _usdForTokens(tokenAmount);
        usdtOut = _usdToUsdt(usdAmount);
    }

    function buyWithUSDT(uint256 usdtAmount) external nonReentrant whenNotPaused {
        require(usdtAmount > 0, "swap: zero");
        address buyer = msg.sender;
        (uint256 tokenOut, uint256 usdAmount) = quoteUsdt(usdtAmount);
        require(tokenOut > 0, "swap: zero tokens");

        uint256 reward = (usdtAmount * Constants.INSTANT_REWARD_BPS) / Constants.BPS_DENOM;
        address referrer = tree.referrerOf(buyer);

        usdt.safeTransferFrom(buyer, address(this), usdtAmount);

        uint256 delivered = _deliverTokens(buyer, tokenOut);
        usdt.safeTransfer(buyer, reward);

        uint256 paidToRef = 0;
        if (referrer != address(0)) {
            usdt.safeTransfer(referrer, reward);
            paidToRef = reward;
        } else {
            // Q10: no-referrer 0.5% → Treasury
            usdt.safeTransfer(treasury, reward);
        }

        uint256 remainder = usdt.balanceOf(address(this));
        if (remainder > 0) usdt.safeTransfer(treasury, remainder);

        emit Bought(buyer, address(usdt), usdtAmount, usdAmount, tokenOut, delivered, reward, paidToRef);
    }

    function buyWithBNB() external payable nonReentrant whenNotPaused {
        uint256 bnbAmount = msg.value;
        require(bnbAmount > 0, "swap: zero");
        address buyer = msg.sender;
        (uint256 tokenOut, uint256 usdAmount) = quoteBnb(bnbAmount);
        require(tokenOut > 0, "swap: zero tokens");

        uint256 reward = (bnbAmount * Constants.INSTANT_REWARD_BPS) / Constants.BPS_DENOM;
        address referrer = tree.referrerOf(buyer);

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

    /// @notice In-app sell (UI IA C1): tokens → USDT; seller 99.5% + referrer/treasury 0.5%.
    function sellForUSDT(uint256 tokenAmount) external nonReentrant whenNotPaused {
        require(tokenAmount > 0, "swap: zero");
        address seller = msg.sender;
        (uint256 usdtOut, uint256 usdAmount) = quoteSellUsdt(tokenAmount);
        require(usdtOut > 0, "swap: zero out");

        uint256 reward = (usdtOut * Constants.INSTANT_REWARD_BPS) / Constants.BPS_DENOM;
        require(usdtOut >= reward * 2, "swap: dust");
        address referrer = tree.referrerOf(seller);

        uint256 beforeTok = token.balanceOf(address(this));
        token.safeTransferFrom(seller, address(this), tokenAmount);
        uint256 received = token.balanceOf(address(this)) - beforeTok;
        require(
            received * Constants.BPS_DENOM >= tokenAmount * (Constants.BPS_DENOM - maxTransferTaxBps),
            "swap: fot too high"
        );

        if (received != tokenAmount) {
            (usdtOut, usdAmount) = quoteSellUsdt(received);
            reward = (usdtOut * Constants.INSTANT_REWARD_BPS) / Constants.BPS_DENOM;
            require(usdtOut >= reward * 2, "swap: dust");
        }

        require(usdt.balanceOf(address(this)) >= usdtOut, "swap: no usdt liq");

        uint256 sellerPrincipal = usdtOut - (reward * 2);
        uint256 sellerTotal = sellerPrincipal + reward;
        usdt.safeTransfer(seller, sellerTotal);

        uint256 paidToRef = 0;
        if (referrer != address(0)) {
            usdt.safeTransfer(referrer, reward);
            paidToRef = reward;
        } else {
            usdt.safeTransfer(treasury, reward);
        }

        emit Sold(seller, address(usdt), received, usdtOut, sellerTotal, usdAmount, reward, paidToRef);
    }

    function _deliverTokens(address to, uint256 amount) private returns (uint256 delivered) {
        if (mintMode) {
            IMintableERC20(address(token)).mint(to, amount);
            return amount;
        }
        uint256 beforeBal = token.balanceOf(to);
        token.safeTransfer(to, amount);
        delivered = token.balanceOf(to) - beforeBal;
        require(
            delivered * Constants.BPS_DENOM >= amount * (Constants.BPS_DENOM - maxTransferTaxBps), "swap: fot too high"
        );
    }

    function _tokensForUsd(uint256 usdAmount) private view returns (uint256) {
        uint256 price = oracle.tokenUsd();
        require(price > 0, "swap: bad price");
        return (usdAmount * 1e18) / price;
    }

    function _usdForTokens(uint256 tokenAmount) private view returns (uint256) {
        uint256 price = oracle.tokenUsd();
        require(price > 0, "swap: bad price");
        return (tokenAmount * price) / 1e18;
    }

    function _usdtToUsd(uint256 usdtAmount) private view returns (uint256) {
        if (usdtDecimals == 18) return usdtAmount;
        if (usdtDecimals < 18) return usdtAmount * (10 ** (18 - usdtDecimals));
        return usdtAmount / (10 ** (usdtDecimals - 18));
    }

    function _usdToUsdt(uint256 usdAmount) private view returns (uint256) {
        if (usdtDecimals == 18) return usdAmount;
        if (usdtDecimals < 18) return usdAmount / (10 ** (18 - usdtDecimals));
        return usdAmount * (10 ** (usdtDecimals - 18));
    }

    function _sendBnb(address payable to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "swap: bnb xfer");
    }
}
