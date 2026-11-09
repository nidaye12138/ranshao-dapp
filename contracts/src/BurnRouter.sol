// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {ILayerRewards} from "./interfaces/ILayerRewards.sol";
import {IShareholderPool} from "./interfaces/IShareholderPool.sol";
import {IDividendPools} from "./interfaces/IDividendPools.sol";
import {Constants} from "./Constants.sol";

/// @title Burn entry — gold-peg U tiering + 70/20/10 split.
contract BurnRouter is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IPriceOracle public oracle;
    ILayerRewards public layerRewards;
    IShareholderPool public shareholderPool;
    IDividendPools public dividendPools;
    address public burnSink;

    mapping(address => uint256) public burnedToken;
    mapping(address => uint256) public burnedUsd;
    uint16 public maxTransferTaxBps;

    event Burned(
        address indexed user,
        uint256 amountRequested,
        uint256 amountReceived,
        uint256 usdValue,
        uint256 toSink,
        uint256 toLayers,
        uint256 toShareholders,
        uint8 tier
    );
    event ConfigUpdated(address oracle, address layers, address shareholders, address dividends, address sink);

    constructor(
        address admin,
        address token_,
        address oracle_,
        address layerRewards_,
        address shareholderPool_,
        address dividendPools_,
        address burnSink_,
        uint16 maxTransferTaxBps_
    ) Ownable(admin) {
        require(
            token_ != address(0) && oracle_ != address(0) && layerRewards_ != address(0)
                && shareholderPool_ != address(0) && dividendPools_ != address(0) && burnSink_ != address(0),
            "burn: zero"
        );
        token = IERC20(token_);
        oracle = IPriceOracle(oracle_);
        layerRewards = ILayerRewards(layerRewards_);
        shareholderPool = IShareholderPool(shareholderPool_);
        dividendPools = IDividendPools(dividendPools_);
        burnSink = burnSink_;
        maxTransferTaxBps = maxTransferTaxBps_;
    }

    function setConfig(
        address oracle_,
        address layerRewards_,
        address shareholderPool_,
        address dividendPools_,
        address burnSink_
    ) external onlyOwner {
        if (oracle_ != address(0)) oracle = IPriceOracle(oracle_);
        if (layerRewards_ != address(0)) layerRewards = ILayerRewards(layerRewards_);
        if (shareholderPool_ != address(0)) shareholderPool = IShareholderPool(shareholderPool_);
        if (dividendPools_ != address(0)) dividendPools = IDividendPools(dividendPools_);
        if (burnSink_ != address(0)) burnSink = burnSink_;
        emit ConfigUpdated(
            address(oracle), address(layerRewards), address(shareholderPool), address(dividendPools), burnSink
        );
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function quoteBurnUsd(uint256 tokenAmount) public view returns (uint256) {
        uint256 price = oracle.tokenUsd();
        require(price > 0, "burn: bad price");
        return (tokenAmount * price) / 1e18;
    }

    function burn(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "burn: zero");
        address user = msg.sender;

        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransferFrom(user, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - beforeBal;
        require(
            received * Constants.BPS_DENOM >= amount * (Constants.BPS_DENOM - maxTransferTaxBps), "burn: fot too high"
        );
        require(received > 0, "burn: zero recv");

        uint256 usdValue = quoteBurnUsd(received);
        burnedToken[user] += received;
        burnedUsd[user] += usdValue;

        uint256 toSink = (received * Constants.BURN_BPS) / Constants.BPS_DENOM;
        uint256 toLayers = (received * Constants.LAYER_BPS) / Constants.BPS_DENOM;
        uint256 toShareholders = (received * Constants.SHAREHOLDER_BPS) / Constants.BPS_DENOM;
        // dust (if any) stays in router

        if (toSink > 0) token.safeTransfer(burnSink, toSink);

        if (toLayers > 0) {
            token.forceApprove(address(layerRewards), toLayers);
            layerRewards.distribute(user, toLayers);
        }

        if (toShareholders > 0) {
            token.forceApprove(address(shareholderPool), toShareholders);
            shareholderPool.receiveBurnShare(toShareholders);
        }

        dividendPools.updateTier(user, burnedUsd[user]);
        uint8 tier = dividendPools.tierOf(user);

        emit Burned(user, amount, received, usdValue, toSink, toLayers, toShareholders, tier);
    }
}
