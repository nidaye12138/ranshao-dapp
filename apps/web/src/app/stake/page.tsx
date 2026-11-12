import { redirect } from "next/navigation";

/** Stake desk lives on Weight (`/promo`); keep legacy /stake route. */
export default function StakeRedirect() {
  redirect("/promo");
}
