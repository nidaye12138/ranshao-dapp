// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPrecipitationPool} from "./interfaces/IPrecipitationPool.sol";
import {IDividendPools} from "./interfaces/IDividendPools.sol";
import {Constants} from "./Constants.sol";

/// @title UMplan 变异沉淀池 — missing-layer residue + 5% burn sedimentation.
/// @dev Q4: equal among 1500U (tier 4) burners for 5% of lifetime deposits.
///      Q5: remaining 95% stays here; admin may withdraw later.
contract PrecipitationPool is IPrecipitationPool, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IDividendPools public dividends;
    address public layerRewards;
    address public burnRouter;

    uint256 public totalDeposited;
    uint256 public allocatedTo1500;
    mapping(address => uint256) public claimable;

    event MissingLayerReceived(uint256 amount, uint256 totalDeposited);
    event BurnSedimentationReceived(uint256 amount, uint256 totalDeposited);
    event Allocated1500(uint256 amount, uint256 perUser, uint256 members);
    event Claimed(address indexed user, uint256 amount);
    event AdminWithdraw(address indexed to, uint256 amount);
    event ConfigUpdated(address dividends, address layerRewards, address burnRouter);

    modifier onlyLayerRewards() {
        require(msg.sender == layerRewards, "precip: not layer");
        _;
    }

    modifier onlyBurnRouter() {
        require(msg.sender == burnRouter, "precip: not router");
        _;
    }

    constructor(address admin, address token_, address dividends_) Ownable(admin) {
        require(token_ != address(0), "precip: zero");
        token = IERC20(token_);
        dividends = IDividendPools(dividends_);
    }

    function setConfig(address dividends_, address layerRewards_, address burnRouter_) external onlyOwner {
        if (dividends_ != address(0)) dividends = IDividendPools(dividends_);
        if (layerRewards_ != address(0)) layerRewards = layerRewards_;
        if (burnRouter_ != address(0)) burnRouter = burnRouter_;
        emit ConfigUpdated(address(dividends), layerRewards, burnRouter);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @inheritdoc IPrecipitationPool
    /// @dev Tokens must already have been transferred to this contract.
    function receiveMissingLayer(uint256 amount) external onlyLayerRewards {
        require(amount > 0, "precip: zero");
        totalDeposited += amount;
        emit MissingLayerReceived(amount, totalDeposited);
    }

    /// @inheritdoc IPrecipitationPool
    /// @dev Pulls `amount` from BurnRouter via transferFrom (5% 变异沉淀池 burn leg).
    function receiveBurnSedimentation(uint256 amount) external onlyBurnRouter nonReentrant {
        require(amount > 0, "precip: zero");
        token.safeTransferFrom(msg.sender, address(this), amount);
        totalDeposited += amount;
        emit BurnSedimentationReceived(amount, totalDeposited);
    }

    /// @notice Allocate remaining room under the 5%-of-lifetime cap equally to current T4 members.
    function allocate1500Share() external nonReentrant whenNotPaused {
        require(address(dividends) != address(0), "precip: no dividends");
        uint256 cap = (totalDeposited * Constants.PRECIP_1500_BPS) / Constants.BPS_DENOM;
        uint256 remaining = cap - allocatedTo1500;
        require(remaining > 0, "precip: nothing");

        uint256 members = dividends.tierMemberCount(4);
        require(members > 0, "precip: no t4");

        uint256 perUser = remaining / members;
        require(perUser > 0, "precip: dust");
        uint256 used = perUser * members;

        // Credit each T4 member — iterate via DividendPools helper
        address[] memory list = IDividendPoolsView(address(dividends)).tierMembers(4);
        require(list.length == members, "precip: len");
        for (uint256 i = 0; i < list.length; i++) {
            claimable[list[i]] += perUser;
        }

        allocatedTo1500 += used;
        emit Allocated1500(used, perUser, members);
    }

    function claim() external nonReentrant whenNotPaused {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "precip: zero claim");
        claimable[msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    /// @notice Q5: admin withdraw of the reserved 95% (and any unallocated dust).
    function adminWithdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "precip: zero");
        // Ensure we leave enough to cover outstanding claimable + remaining 1500 allocation room
        uint256 reservedClaimable = _totalClaimableRough();
        uint256 cap1500 = (totalDeposited * Constants.PRECIP_1500_BPS) / Constants.BPS_DENOM;
        uint256 stillFor1500 = cap1500 > allocatedTo1500 ? cap1500 - allocatedTo1500 : 0;
        uint256 bal = token.balanceOf(address(this));
        require(bal >= amount + reservedClaimable + stillFor1500, "precip: reserve");
        token.safeTransfer(to, amount);
        emit AdminWithdraw(to, amount);
    }

    function _totalClaimableRough() private view returns (uint256) {
        // Exact sum would need iteration; enforce via balance check against allocated-claimed accounting.
        // Use allocatedTo1500 as upper bound of credits ever issued; claims reduce token balance.
        // Safer bound: allocatedTo1500 (max ever credited). Over-reserves slightly after claims — OK for MVP.
        return allocatedTo1500;
    }
}

/// @dev Local view extension used by PrecipitationPool (implemented by DividendPools).
interface IDividendPoolsView {
    function tierMembers(uint8 tier) external view returns (address[] memory);
}
