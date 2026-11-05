// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Operational treasury + global pause hub
contract Treasury is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    mapping(bytes32 => address) public modules;

    event ModuleSet(bytes32 indexed key, address module);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event NativeWithdrawn(address indexed to, uint256 amount);

    constructor(address admin) Ownable(admin) {}

    receive() external payable {}

    function setModule(bytes32 key, address module) external onlyOwner {
        modules[key] = module;
        emit ModuleSet(key, module);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdrawERC20(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "treasury: zero");
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    function withdrawNative(address payable to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "treasury: zero");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "treasury: bnb xfer");
        emit NativeWithdrawn(to, amount);
    }

    function fundModule(address token, address module, uint256 amount) external onlyOwner nonReentrant {
        require(module != address(0), "treasury: zero module");
        IERC20(token).safeTransfer(module, amount);
        emit Withdrawn(token, module, amount);
    }
}
