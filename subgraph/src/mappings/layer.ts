import { LayerPaid } from "../../generated/LayerRewards/LayerRewards";
import { LayerReward } from "../../generated/schema";
import { eventId, getOrCreateAccount } from "../helpers";

export function handleLayerPaid(event: LayerPaid): void {
  const burner = getOrCreateAccount(event.params.burner);
  const recipient = getOrCreateAccount(event.params.recipient);

  const row = new LayerReward(eventId(event.transaction.hash, event.logIndex));
  row.burner = burner.id;
  row.recipient = recipient.id;
  row.layer = event.params.layer;
  row.amount = event.params.amount;
  row.blockNumber = event.block.number;
  row.timestamp = event.block.timestamp;
  row.txHash = event.transaction.hash;
  row.save();
}
