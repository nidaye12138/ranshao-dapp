import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Bought, Sold } from "../../generated/SwapFacade/SwapFacade";
import { Account, SwapReward } from "../../generated/schema";
import { eventId, getOrCreateAccount } from "../helpers";

export function handleBought(event: Bought): void {
  const buyer = getOrCreateAccount(event.params.buyer);
  buyer.buyVolumeUsd = buyer.buyVolumeUsd.plus(event.params.usdAmount);
  buyer.save();
  bumpUmbrella(buyer.referrer, event.params.usdAmount, 9);

  saveSwapReward(
    eventId(event.transaction.hash, event.logIndex, "self"),
    "BUY",
    buyer,
    buyer,
    "self",
    event.params.paymentToken,
    event.params.paymentAmount,
    event.params.usdAmount,
    event.params.buyerReward,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );

  if (event.params.referrerReward.gt(BigInt.zero()) && buyer.referrer != null) {
    const ref = Account.load(buyer.referrer as string);
    if (ref != null) {
      saveSwapReward(
        eventId(event.transaction.hash, event.logIndex, "ref"),
        "BUY",
        buyer,
        ref as Account,
        "referrer",
        event.params.paymentToken,
        event.params.paymentAmount,
        event.params.usdAmount,
        event.params.referrerReward,
        event.block.number,
        event.block.timestamp,
        event.transaction.hash
      );
    }
  }
}

export function handleSold(event: Sold): void {
  const seller = getOrCreateAccount(event.params.seller);

  saveSwapReward(
    eventId(event.transaction.hash, event.logIndex, "self"),
    "SELL",
    seller,
    seller,
    "self",
    event.params.paymentToken,
    event.params.paymentDelivered,
    event.params.usdAmount,
    event.params.sellerReward,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );

  if (event.params.referrerReward.gt(BigInt.zero()) && seller.referrer != null) {
    const ref = Account.load(seller.referrer as string);
    if (ref != null) {
      saveSwapReward(
        eventId(event.transaction.hash, event.logIndex, "ref"),
        "SELL",
        seller,
        ref as Account,
        "referrer",
        event.params.paymentToken,
        event.params.paymentDelivered,
        event.params.usdAmount,
        event.params.referrerReward,
        event.block.number,
        event.block.timestamp,
        event.transaction.hash
      );
    }
  }
}

function bumpUmbrella(startId: string | null, usd: BigInt, maxHops: i32): void {
  let currentId = startId;
  let hops = 0;
  while (currentId != null && hops < maxHops) {
    const a = Account.load(currentId as string);
    if (a == null) break;
    a.umbrellaVolumeUsd = a.umbrellaVolumeUsd.plus(usd);
    a.save();
    currentId = a.referrer;
    hops += 1;
  }
}

function saveSwapReward(
  id: string,
  side: string,
  trader: Account,
  recipient: Account,
  role: string,
  paymentToken: Address,
  paymentAmount: BigInt,
  usdAmount: BigInt,
  rewardAmount: BigInt,
  blockNumber: BigInt,
  timestamp: BigInt,
  txHash: Bytes
): void {
  const row = new SwapReward(id);
  row.side = side;
  row.trader = trader.id;
  row.recipient = recipient.id;
  row.role = role;
  row.paymentToken = paymentToken;
  row.paymentAmount = paymentAmount;
  row.usdAmount = usdAmount;
  row.rewardAmount = rewardAmount;
  row.blockNumber = blockNumber;
  row.timestamp = timestamp;
  row.txHash = txHash;
  row.save();
}
