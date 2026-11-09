import { Claimed } from "../../generated/DividendPools/DividendPools";
import { DividendClaim } from "../../generated/schema";
import { eventId, getOrCreateAccount } from "../helpers";

export function handleClaimed(event: Claimed): void {
  const user = getOrCreateAccount(event.params.user);

  const row = new DividendClaim(eventId(event.transaction.hash, event.logIndex));
  row.user = user.id;
  row.amount = event.params.amount;
  row.nextClaimAt = event.params.nextClaimAt;
  row.blockNumber = event.block.number;
  row.timestamp = event.block.timestamp;
  row.txHash = event.transaction.hash;
  row.save();
}
