import { BigInt } from "@graphprotocol/graph-ts";
import { ReferrerBound } from "../../generated/ReferralTree/ReferralTree";
import { Account, ReferralBind } from "../../generated/schema";
import { eventId, getOrCreateAccount, getStats } from "../helpers";

export function handleReferrerBound(event: ReferrerBound): void {
  const user = getOrCreateAccount(event.params.user);
  const referrer = getOrCreateAccount(event.params.referrer);

  user.referrer = referrer.id;
  user.save();

  referrer.directCount = referrer.directCount.plus(BigInt.fromI32(1));
  referrer.save();

  // Ancestors (L2+) get +1 indirect for team metrics.
  bumpIndirects(referrer.referrer, 8);

  const bind = new ReferralBind(eventId(event.transaction.hash, event.logIndex));
  bind.user = user.id;
  bind.referrer = referrer.id;
  bind.blockNumber = event.block.number;
  bind.timestamp = event.block.timestamp;
  bind.txHash = event.transaction.hash;
  bind.save();

  const stats = getStats();
  stats.bindCount = stats.bindCount.plus(BigInt.fromI32(1));
  stats.save();
}

function bumpIndirects(startId: string | null, maxHops: i32): void {
  let currentId = startId;
  let hops = 0;
  while (currentId != null && hops < maxHops) {
    const a = Account.load(currentId as string);
    if (a == null) break;
    a.indirectCount = a.indirectCount.plus(BigInt.fromI32(1));
    a.save();
    currentId = a.referrer;
    hops += 1;
  }
}
