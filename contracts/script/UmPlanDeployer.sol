// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RanshaoToken} from "../src/RanshaoToken.sol";
import {ReferralTree} from "../src/ReferralTree.sol";
import {Treasury} from "../src/Treasury.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {SwapFacade} from "../src/SwapFacade.sol";
import {BurnRouter} from "../src/BurnRouter.sol";
import {LayerRewards} from "../src/LayerRewards.sol";
import {PrecipitationPool} from "../src/PrecipitationPool.sol";
import {DividendPools} from "../src/DividendPools.sol";
import {ShareholderPool} from "../src/ShareholderPool.sol";
import {EliteStake} from "../src/EliteStake.sol";
import {BrokerMarket} from "../src/BrokerMarket.sol";

/// @dev Shared deploy helper — keeps script stack shallow under via_ir.
abstract contract UmPlanDeployer {
    struct Addresses {
        address token;
        address usdt;
        address spcxb;
        address tree;
        address treasury;
        address oracle;
        address dividends;
        address precip;
        address layers;
        address shareholders;
        address burnRouter;
        address swap;
        address elite;
        address broker;
    }

    struct Params {
        address admin;
        address token; // address(0) => deploy RanshaoToken
        address usdt;
        address spcxb;
        uint8 usdtDecimals;
        uint256 bnbUsd;
        uint256 tokenUsd;
        bool mintMode;
        uint16 maxTaxBps;
        address burnSink;
    }

    function _deployUmPlan(Params memory p) internal returns (Addresses memory a) {
        a.token = p.token == address(0) ? address(new RanshaoToken(p.admin)) : p.token;
        a.usdt = p.usdt;
        a.spcxb = p.spcxb;
        a.tree = address(new ReferralTree(p.admin));
        a.treasury = address(new Treasury(p.admin));
        a.oracle = address(new MockPriceOracle(p.bnbUsd, p.tokenUsd));

        a.dividends = address(new DividendPools(p.admin, a.spcxb));
        a.precip = address(new PrecipitationPool(p.admin, a.token, a.dividends));
        a.layers = address(new LayerRewards(p.admin, a.token, a.tree, a.precip));
        a.shareholders = address(new ShareholderPool(p.admin, a.token));

        a.burnRouter = address(
            new BurnRouter(
                p.admin, a.token, a.oracle, a.layers, a.shareholders, a.dividends, p.burnSink, p.maxTaxBps
            )
        );

        // Wire precip (5% 变异沉淀池) + reverse links after BurnRouter exists.
        BurnRouter(a.burnRouter).setConfig(address(0), address(0), address(0), address(0), a.precip, address(0));
        LayerRewards(a.layers).setConfig(a.tree, a.precip, a.burnRouter);
        PrecipitationPool(a.precip).setConfig(a.dividends, a.layers, a.burnRouter);
        ShareholderPool(a.shareholders).setBurnRouter(a.burnRouter);
        DividendPools(a.dividends).setBurnRouter(a.burnRouter);

        a.swap = address(
            new SwapFacade(
                p.admin,
                a.token,
                a.usdt,
                p.usdtDecimals,
                a.oracle,
                a.tree,
                payable(a.treasury),
                p.mintMode,
                p.maxTaxBps
            )
        );

        if (p.mintMode) {
            RanshaoToken(a.token).setMinter(a.swap, true);
            RanshaoToken(a.token).setMinter(p.admin, true);
        }

        a.elite = address(new EliteStake(p.admin, a.token, a.spcxb, a.dividends));
        a.broker = address(new BrokerMarket(p.admin, a.treasury));

        Treasury(payable(a.treasury)).setModule(keccak256("SWAP"), a.swap);
        Treasury(payable(a.treasury)).setModule(keccak256("BURN"), a.burnRouter);
        Treasury(payable(a.treasury)).setModule(keccak256("DIVIDENDS"), a.dividends);
        Treasury(payable(a.treasury)).setModule(keccak256("SHAREHOLDER"), a.shareholders);
        Treasury(payable(a.treasury)).setModule(keccak256("PRECIP"), a.precip);
        Treasury(payable(a.treasury)).setModule(keccak256("ELITE"), a.elite);
        Treasury(payable(a.treasury)).setModule(keccak256("BROKER"), a.broker);
    }
}
