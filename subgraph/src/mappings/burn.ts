import { BigInt } from "@graphprotocol/graph-ts";
import { Burned } from "../../generated/BurnRouter/BurnRouter";
import { Burn } from "../../generated/schema";
import { eventId, getOrCreateAccount, getStats } from "../helpers";

export function handleBurned(event: Burned): void {
  const user = getOrCreateAccount(event.params.user);

  const burn = new Burn(eventId(event.transaction.hash, event.logIndex));
  burn.user = user.id;
  burn.amountRequested = event.params.amountRequested;
  burn.amountReceived = event.params.amountReceived;
  burn.usdValue = event.params.usdValue;
  burn.toSink = event.params.toSink;
  burn.toLayers = event.params.toLayers;
  burn.toShareholders = event.params.toShareholders;
  burn.toPrecip = event.params.toPrecip;
  burn.tier = event.params.tier;
  burn.blockNumber = event.block.number;
  burn.timestamp = event.block.timestamp;
  burn.txHash = event.transaction.hash;
  burn.save();

  const stats = getStats();
  stats.totalBurnedToken = stats.totalBurnedToken.plus(event.params.amountReceived);
  stats.totalBurnedUsd = stats.totalBurnedUsd.plus(event.params.usdValue);
  stats.burnCount = stats.burnCount.plus(BigInt.fromI32(1));
  stats.save();
}
