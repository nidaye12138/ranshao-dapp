// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal PancakeSwap V2 router surface used by SwapFacade DEX mode.
interface IPancakeRouter02 {
    function factory() external view returns (address);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}
