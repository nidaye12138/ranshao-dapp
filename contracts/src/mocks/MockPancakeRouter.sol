// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Test double: 1:1 quote along a 2-hop path; pulls `amountIn` and pays `amountIn` of path[last].
contract MockPancakeRouter {
    using SafeERC20 for IERC20;

    address public factory = address(0xfac);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        pure
        returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "path");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 1; i < path.length; i++) {
            amounts[i] = amountIn; // 1:1 for tests
        }
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external {
        require(path.length >= 2, "path");
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 out = amountIn;
        require(out >= amountOutMin, "slip");
        IERC20(path[path.length - 1]).safeTransfer(to, out);
    }
}
