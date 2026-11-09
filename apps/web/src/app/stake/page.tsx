import { redirect } from "next/navigation";

/** Initial-design 15d/30d stake yield is deprecated; redirect to Elite 1500U stake. */
export default function StakeRedirect() {
  redirect("/elite");
}
