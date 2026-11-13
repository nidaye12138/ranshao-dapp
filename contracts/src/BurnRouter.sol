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
import {IPrecipitationPool} from "./interfaces/IPrecipitationPool.sol";
import {Constants} from "./Constants.sol";

/// @title Burn entry — gold-peg U tiering + 30/50/15/5 split.
/// @dev Tier / activate / 1500U stake unlock only via `burnTier` (preset buttons).
///      Each wallet may purchase each tier at most once and only as a strict upgrade
///      (same or lower tier reverts). Buying a higher tier voids lower-pool membership
///      via DividendPools highest-tier-only (Q2). Free-amount `burn` still splits funds
///      but does NOT grant tier benefits.
contract BurnRouter is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IPriceOracle public oracle;
    ILayerRewards public layerRewards;
    IShareholderPool public shareholderPool;
    IDividendPools public dividendPools;
    IPrecipitationPool public precipPool;
    address public burnSink;

    mapping(address => uint256) public burnedToken;
    mapping(address => uint256) public burnedUsd;
    /// @notice Highest preset tier button completed by user on this router (0..4).
    mapping(address => uint8) public buttonTierOf;
    uint256 public totalBurnedToken;
    uint256 public totalBurnedUsd;
    uint16 public maxTransferTaxBps;

    event Burned(
        address indexed user,
        uint256 amountRequested,
        uint256 amountReceived,
        uint256 usdValue,
        uint256 toSink,
        uint256 toLayers,
        uint256 toShareholders,
        uint256 toPrecip,
        uint8 tier
    );
    event TierButtonBurned(address indexed user, uint8 tierId, uint256 usdValue, uint8 buttonTier);
    event ConfigUpdated(
        address oracle, address layers, address shareholders, address dividends, address precip, address sink
    );

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
        address precipPool_,
        address burnSink_
    ) external onlyOwner {
        if (oracle_ != address(0)) oracle = IPriceOracle(oracle_);
        if (layerRewards_ != address(0)) layerRewards = ILayerRewards(layerRewards_);
        if (shareholderPool_ != address(0)) shareholderPool = IShareholderPool(shareholderPool_);
        if (dividendPools_ != address(0)) dividendPools = IDividendPools(dividendPools_);
        if (precipPool_ != address(0)) precipPool = IPrecipitationPool(precipPool_);
        if (burnSink_ != address(0)) burnSink = burnSink_;
        emit ConfigUpdated(
            address(oracle),
            address(layerRewards),
            address(shareholderPool),
            address(dividendPools),
            address(precipPool),
            burnSink
        );
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function tierUsd(uint8 tierId) public pure returns (uint256) {
        if (tierId == 1) return Constants.TIER1_USD;
        if (tierId == 2) return Constants.TIER2_USD;
        if (tierId == 3) return Constants.TIER3_USD;
        if (tierId == 4) return Constants.TIER4_USD;
        return 0;
    }

    /// @notice Effective highest tier already held: max(buttonTier, DividendPools.tierOf).
    /// @dev Uses dividend membership so cutover from a prior cumulative BurnRouter still
    ///      blocks re-buying the same or a lower tier.
    function effectiveButtonTier(address user) public view returns (uint8) {
        uint8 button = buttonTierOf[user];
        uint8 divTier = dividendPools.tierOf(user);
        return button > divTier ? button : divTier;
    }

    function quoteBurnUsd(uint256 tokenAmount) public view returns (uint256) {
        uint256 price = oracle.tokenUsd();
        require(price > 0, "burn: bad price");
        return (tokenAmount * price) / 1e18;
    }

    /// @notice Tokens needed (ceil) to hit a preset tier's gold-peg USD at current oracle price.
    function quoteTokensForTier(uint8 tierId) public view returns (uint256) {
        uint256 targetUsd = tierUsd(tierId);
        require(targetUsd > 0, "burn: tier");
        uint256 price = oracle.tokenUsd();
        require(price > 0, "burn: bad price");
        return (targetUsd * 1e18 + price - 1) / price;
    }

    /// @notice Free-amount burn: 30/50/15/5 split only. Does NOT grant tier / activate / stake unlock.
    function burn(uint256 amount) external nonReentrant whenNotPaused {
        _burnAmount(msg.sender, amount, 0);
    }

    /// @notice Preset tier button. Same wallet may buy each tier once; must be a strict upgrade.
    function burnTier(uint8 tierId) external nonReentrant whenNotPaused {
        require(tierId >= 1 && tierId <= 4, "burn: tier");
        require(tierId > effectiveButtonTier(msg.sender), "burn: tier used");
        uint256 amount = quoteTokensForTier(tierId);
        _burnAmount(msg.sender, amount, tierId);
    }

    function _burnAmount(address user, uint256 amount, uint8 tierId) private {
        require(amount > 0, "burn: zero");
        require(address(precipPool) != address(0), "burn: no precip");

        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransferFrom(user, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - beforeBal;
        require(
            received * Constants.BPS_DENOM >= amount * (Constants.BPS_DENOM - maxTransferTaxBps), "burn: fot too high"
        );
        require(received > 0, "burn: zero recv");

        uint256 usdValue = quoteBurnUsd(received);
        if (tierId != 0) {
            uint256 targetUsd = tierUsd(tierId);
            // After FOT, received USD must still clear the preset threshold within tax tolerance.
            require(
                usdValue * Constants.BPS_DENOM >= targetUsd * (Constants.BPS_DENOM - maxTransferTaxBps),
                "burn: usd short"
            );
        }

        burnedToken[user] += received;
        burnedUsd[user] += usdValue;
        totalBurnedToken += received;
        totalBurnedUsd += usdValue;

        uint256 toSink = (received * Constants.BURN_BPS) / Constants.BPS_DENOM;
        uint256 toLayers = (received * Constants.LAYER_BPS) / Constants.BPS_DENOM;
        uint256 toShareholders = (received * Constants.SHAREHOLDER_BPS) / Constants.BPS_DENOM;
        uint256 toPrecip = (received * Constants.PRECIP_BURN_BPS) / Constants.BPS_DENOM;
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

        if (toPrecip > 0) {
            token.forceApprove(address(precipPool), toPrecip);
            precipPool.receiveBurnSedimentation(toPrecip);
        }

        if (tierId != 0) {
            // Re-check after payment path: still must be a strict upgrade (once per tier forever).
            require(tierId > effectiveButtonTier(user), "burn: tier used");
            buttonTierOf[user] = tierId;
            // Pass this button's threshold USD — highest-tier-only membership (voids lower pools).
            dividendPools.updateTier(user, tierUsd(tierId));
            emit TierButtonBurned(user, tierId, usdValue, tierId);
        }

        uint8 tier = dividendPools.tierOf(user);
        emit Burned(user, amount, received, usdValue, toSink, toLayers, toShareholders, toPrecip, tier);
    }
}
