import { redirect } from "next/navigation";

/** Stake desk lives on Swap (+ 权重); keep legacy /stake route. */
export default function StakeRedirect() {
  redirect("/swap");
}
