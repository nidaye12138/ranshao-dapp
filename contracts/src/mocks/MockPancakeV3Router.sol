// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPancakeV3SwapRouter} from "../interfaces/IPancakeV3SwapRouter.sol";
import {IPancakeV3QuoterV2} from "../interfaces/IPancakeV3QuoterV2.sol";

/// @dev 1:1 V3 swap + quote test double.
contract MockPancakeV3Router is IPancakeV3SwapRouter, IPancakeV3QuoterV2 {
    using SafeERC20 for IERC20;

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        amountOut = params.amountIn;
        require(amountOut >= params.amountOutMinimum, "v3 slip");
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        pure
        returns (uint256 amountOut, uint160, uint32, uint256)
    {
        return (params.amountIn, 0, 0, 0);
    }
}
