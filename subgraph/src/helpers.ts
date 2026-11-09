import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Account, ProtocolStats } from "../generated/schema";

export function accountId(addr: Address): string {
  return addr.toHexString().toLowerCase();
}

export function getOrCreateAccount(addr: Address): Account {
  const id = accountId(addr);
  let a = Account.load(id);
  if (a == null) {
    a = new Account(id);
    a.directCount = BigInt.zero();
    a.indirectCount = BigInt.zero();
    a.buyVolumeUsd = BigInt.zero();
    a.umbrellaVolumeUsd = BigInt.zero();
    a.save();
  }
  return a as Account;
}

export function getStats(): ProtocolStats {
  let s = ProtocolStats.load("global");
  if (s == null) {
    s = new ProtocolStats("global");
    s.totalBurnedToken = BigInt.zero();
    s.totalBurnedUsd = BigInt.zero();
    s.bindCount = BigInt.zero();
    s.burnCount = BigInt.zero();
    s.save();
  }
  return s as ProtocolStats;
}

export function eventId(txHash: Bytes, logIndex: BigInt, suffix: string = ""): string {
  const base = txHash.toHexString() + "-" + logIndex.toString();
  return suffix.length > 0 ? base + "-" + suffix : base;
}
