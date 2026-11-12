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
import {IPancakeRouter02} from "./interfaces/IPancakeRouter02.sol";
import {Constants} from "./Constants.sol";

/// @title Swap facade — buy/sell project token with 0.5%/0.5% instant rewards (UI IA C1/C2).
/// @dev Q10: no-referrer 0.5% → Treasury. Q11: rewards in payment token. Q12: Ownable+Pausable.
///      Inventory mode (`pancakeRouter == 0`): mintMode or depositInventory; sell needs payment liquidity.
///      DEX mode (`pancakeRouter != 0`): buy/sell fill via Pancake V2 router (e.g. UMplan/SPCXB).
///      Mainnet payment token is SPCXB (deep UMplan/SPCXB pool); ABI keeps historical `usdt`/`*USDT` names.
contract SwapFacade is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    /// @notice Payment / quote token (mainnet DEX: SPCXB; inventory tests: mock USDT).
    IERC20 public immutable usdt;
    IPriceOracle public oracle;
    IReferralTree public tree;
    address payable public treasury;

    bool public immutable mintMode;
    uint16 public maxTransferTaxBps;
    uint8 public usdtDecimals;

    /// @notice Pancake V2 router; address(0) = inventory mode.
    IPancakeRouter02 public pancakeRouter;
    /// @notice Min out bps vs router quote (e.g. 9700 = 3% slippage). Owner-settable.
    uint16 public swapSlippageBps = 9_700;

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
    event PancakeRouterUpdated(address router);
    event SwapSlippageUpdated(uint16 bps);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    constructor(
        address admin,
        address token_,
        address usdt_,
        uint8 usdtDecimals_,
        address oracle_,
        address tree_,
        address payable treasury_,
        bool mintMode_,
        uint16 maxTransferTaxBps_,
        address pancakeRouter_
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
        pancakeRouter = IPancakeRouter02(pancakeRouter_);
    }

    function dexMode() public view returns (bool) {
        return address(pancakeRouter) != address(0);
    }

    function setConfig(address oracle_, address tree_, address payable treasury_) external onlyOwner {
        if (oracle_ != address(0)) oracle = IPriceOracle(oracle_);
        if (tree_ != address(0)) tree = IReferralTree(tree_);
        if (treasury_ != address(0)) treasury = treasury_;
        emit ConfigUpdated(address(oracle), address(tree), treasury);
    }

    function setPancakeRouter(address router_) external onlyOwner {
        pancakeRouter = IPancakeRouter02(router_);
        emit PancakeRouterUpdated(router_);
    }

    function setSwapSlippageBps(uint16 bps) external onlyOwner {
        require(bps <= Constants.BPS_DENOM, "swap: slip");
        swapSlippageBps = bps;
        emit SwapSlippageUpdated(bps);
    }

    function setMaxTransferTaxBps(uint16 bps) external onlyOwner {
        require(bps <= 2_000, "swap: tax too high");
        maxTransferTaxBps = bps;
        emit MaxTransferTaxUpdated(bps);
    }

    function depositInventory(uint256 amount) external onlyOwner {
        require(!mintMode, "swap: mint mode");
        require(!dexMode(), "swap: dex mode");
        require(amount > 0, "swap: zero");
        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - beforeBal;
        require(received > 0, "swap: fot zero");
        emit InventoryDeposited(msg.sender, received);
    }

    /// @notice Fund payment-token liquidity for inventory-mode sells.
    function depositUsdtLiquidity(uint256 amount) external onlyOwner {
        require(!dexMode(), "swap: dex mode");
        require(amount > 0, "swap: zero");
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        emit UsdtLiquidityDeposited(msg.sender, amount);
    }

    /// @notice Rescue stuck tokens (e.g. migrate off old inventory Swap).
    function rescueToken(address token_, address to, uint256 amount) external onlyOwner {
        require(to != address(0) && amount > 0, "swap: zero");
        IERC20(token_).safeTransfer(to, amount);
        emit Rescued(token_, to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function quoteUsdt(uint256 usdtAmount) public view returns (uint256 tokenOut, uint256 usdAmount) {
        if (dexMode()) {
            usdAmount = _paymentToUsd(usdtAmount);
            tokenOut = _routerAmountOut(usdtAmount, _buyPath());
            return (tokenOut, usdAmount);
        }
        usdAmount = _paymentToUsd(usdtAmount);
        tokenOut = _tokensForUsd(usdAmount);
    }

    function quoteBnb(uint256 bnbAmount) public view returns (uint256 tokenOut, uint256 usdAmount) {
        require(!dexMode(), "swap: dex no bnb");
        usdAmount = (bnbAmount * oracle.bnbUsd()) / 1e18;
        tokenOut = _tokensForUsd(usdAmount);
    }

    /// @notice Quote sell: tokens → payment token (gross before 0.5%+0.5% rewards).
    function quoteSellUsdt(uint256 tokenAmount) public view returns (uint256 usdtOut, uint256 usdAmount) {
        if (dexMode()) {
            usdtOut = _routerAmountOut(tokenAmount, _sellPath());
            usdAmount = _paymentToUsd(usdtOut);
            return (usdtOut, usdAmount);
        }
        usdAmount = _usdForTokens(tokenAmount);
        usdtOut = _usdToPayment(usdAmount);
    }

    function buyWithUSDT(uint256 usdtAmount) external nonReentrant whenNotPaused {
        require(usdtAmount > 0, "swap: zero");
        address buyer = msg.sender;
        (uint256 tokenOut, uint256 usdAmount) = quoteUsdt(usdtAmount);
        require(tokenOut > 0, "swap: zero tokens");

        uint256 reward = (usdtAmount * Constants.INSTANT_REWARD_BPS) / Constants.BPS_DENOM;
        address referrer = tree.referrerOf(buyer);

        usdt.safeTransferFrom(buyer, address(this), usdtAmount);

        uint256 paidToRef = 0;
        usdt.safeTransfer(buyer, reward);
        if (referrer != address(0)) {
            usdt.safeTransfer(referrer, reward);
            paidToRef = reward;
        } else {
            usdt.safeTransfer(treasury, reward);
        }

        uint256 delivered;
        if (dexMode()) {
            uint256 swapIn = usdt.balanceOf(address(this));
            require(swapIn > 0, "swap: nothing to swap");
            uint256 minOut = (tokenOut * swapSlippageBps) / Constants.BPS_DENOM;
            delivered = _swapPaymentForToken(swapIn, minOut, buyer);
        } else {
            delivered = _deliverTokens(buyer, tokenOut);
            uint256 remainder = usdt.balanceOf(address(this));
            if (remainder > 0) usdt.safeTransfer(treasury, remainder);
        }

        emit Bought(buyer, address(usdt), usdtAmount, usdAmount, tokenOut, delivered, reward, paidToRef);
    }

    function buyWithBNB() external payable nonReentrant whenNotPaused {
        require(!dexMode(), "swap: dex no bnb");
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

    /// @notice In-app sell (UI IA C1): tokens → payment; seller 99.5% + referrer/treasury 0.5%.
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

        uint256 paymentGross;
        if (dexMode()) {
            if (received != tokenAmount) {
                usdtOut = _routerAmountOut(received, _sellPath());
                usdAmount = _paymentToUsd(usdtOut);
                reward = (usdtOut * Constants.INSTANT_REWARD_BPS) / Constants.BPS_DENOM;
                require(usdtOut >= reward * 2, "swap: dust");
            }
            uint256 minOut = (usdtOut * swapSlippageBps) / Constants.BPS_DENOM;
            paymentGross = _swapTokenForPayment(received, minOut);
            // Recompute rewards from actual proceeds (FOT / pool impact).
            reward = (paymentGross * Constants.INSTANT_REWARD_BPS) / Constants.BPS_DENOM;
            require(paymentGross >= reward * 2, "swap: dust");
            usdtOut = paymentGross;
        } else {
            if (received != tokenAmount) {
                (usdtOut, usdAmount) = quoteSellUsdt(received);
                reward = (usdtOut * Constants.INSTANT_REWARD_BPS) / Constants.BPS_DENOM;
                require(usdtOut >= reward * 2, "swap: dust");
            }
            require(usdt.balanceOf(address(this)) >= usdtOut, "swap: no usdt liq");
            paymentGross = usdtOut;
        }

        uint256 sellerPrincipal = paymentGross - (reward * 2);
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

    function _buyPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(usdt);
        path[1] = address(token);
    }

    function _sellPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(token);
        path[1] = address(usdt);
    }

    function _routerAmountOut(uint256 amountIn, address[] memory path) private view returns (uint256) {
        uint256[] memory amounts = pancakeRouter.getAmountsOut(amountIn, path);
        return amounts[amounts.length - 1];
    }

    function _swapPaymentForToken(uint256 amountIn, uint256 minOut, address to) private returns (uint256 delivered) {
        uint256 beforeBal = token.balanceOf(to);
        usdt.forceApprove(address(pancakeRouter), amountIn);
        pancakeRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn, minOut, _buyPath(), to, block.timestamp
        );
        usdt.forceApprove(address(pancakeRouter), 0);
        delivered = token.balanceOf(to) - beforeBal;
        require(
            delivered * Constants.BPS_DENOM >= minOut * (Constants.BPS_DENOM - maxTransferTaxBps), "swap: fot too high"
        );
    }

    function _swapTokenForPayment(uint256 amountIn, uint256 minOut) private returns (uint256 receivedPay) {
        uint256 beforeBal = usdt.balanceOf(address(this));
        token.forceApprove(address(pancakeRouter), amountIn);
        pancakeRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn, minOut, _sellPath(), address(this), block.timestamp
        );
        token.forceApprove(address(pancakeRouter), 0);
        receivedPay = usdt.balanceOf(address(this)) - beforeBal;
        require(receivedPay >= minOut, "swap: slip");
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

    function _paymentToUsd(uint256 paymentAmount) private view returns (uint256) {
        if (usdtDecimals == 18) return paymentAmount;
        if (usdtDecimals < 18) return paymentAmount * (10 ** (18 - usdtDecimals));
        return paymentAmount / (10 ** (usdtDecimals - 18));
    }

    function _usdToPayment(uint256 usdAmount) private view returns (uint256) {
        if (usdtDecimals == 18) return usdAmount;
        if (usdtDecimals < 18) return usdAmount / (10 ** (18 - usdtDecimals));
        return usdAmount * (10 ** (usdtDecimals - 18));
    }

    function _sendBnb(address payable to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "swap: bnb xfer");
    }
}
