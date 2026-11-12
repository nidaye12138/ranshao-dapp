// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IReferralTree} from "./interfaces/IReferralTree.sol";
import {ILayerRewards} from "./interfaces/ILayerRewards.sol";
import {IPrecipitationPool} from "./interfaces/IPrecipitationPool.sol";
import {Constants} from "./Constants.sol";

/// @title 9-layer burn rewards — L1 20% of market bucket, L2–L9 10% each; missing → precip.
/// @dev `distribute` pulls `budget` (50% of B) from BurnRouter via allowance/balance.
///      share_i = budget * layerBps(i) / LAYER_BPS (relative bucket shares unchanged).
contract LayerRewards is ILayerRewards, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IReferralTree public tree;
    IPrecipitationPool public precip;
    address public burnRouter;

    event Distributed(address indexed burner, uint256 budget, uint256 paid, uint256 toPrecip);
    /// @notice Per-layer payout for ledger indexing. `layer` is 1..9 (直推/间推/市场N).
    event LayerPaid(address indexed burner, address indexed recipient, uint8 indexed layer, uint256 amount);
    event LayerMissing(address indexed burner, uint8 indexed layer, uint256 amount);
    event ConfigUpdated(address tree, address precip, address burnRouter);

    modifier onlyBurnRouter() {
        require(msg.sender == burnRouter, "layer: not router");
        _;
    }

    constructor(address admin, address token_, address tree_, address precip_) Ownable(admin) {
        require(token_ != address(0) && tree_ != address(0) && precip_ != address(0), "layer: zero");
        token = IERC20(token_);
        tree = IReferralTree(tree_);
        precip = IPrecipitationPool(precip_);
    }

    function setConfig(address tree_, address precip_, address burnRouter_) external onlyOwner {
        if (tree_ != address(0)) tree = IReferralTree(tree_);
        if (precip_ != address(0)) precip = IPrecipitationPool(precip_);
        if (burnRouter_ != address(0)) burnRouter = burnRouter_;
        emit ConfigUpdated(address(tree), address(precip), burnRouter);
    }

    /// @inheritdoc ILayerRewards
    function distribute(address burner, uint256 budget) external onlyBurnRouter nonReentrant {
        require(budget > 0, "layer: zero");
        // Pull budget from BurnRouter
        token.safeTransferFrom(msg.sender, address(this), budget);

        address[] memory ancestors = tree.walk(burner, Constants.LAYER_COUNT);
        uint256 paid;
        uint256 toPrecip;

        for (uint256 i = 0; i < Constants.LAYER_COUNT; i++) {
            uint256 share = (budget * Constants.layerBps(i)) / Constants.LAYER_BPS;
            if (share == 0) continue;
            uint8 layer = uint8(i + 1); // 1..9
            address recipient = ancestors[i];
            if (recipient != address(0)) {
                token.safeTransfer(recipient, share);
                paid += share;
                emit LayerPaid(burner, recipient, layer, share);
            } else {
                token.safeTransfer(address(precip), share);
                precip.receiveMissingLayer(share);
                toPrecip += share;
                emit LayerMissing(burner, layer, share);
            }
        }

        // Dust from integer division stays in this contract; owner can sweep later via transfer if needed.
        emit Distributed(burner, budget, paid, toPrecip);
    }

    function sweep(address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}
