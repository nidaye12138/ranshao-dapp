import { redirect } from "next/navigation";

/** Elite stake desk lives on Weight (`/promo`); keep legacy /elite route. */
export default function EliteRedirect() {
  redirect("/promo");
}
