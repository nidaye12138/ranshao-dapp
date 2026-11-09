import { NextResponse } from "next/server";
import cms from "@/data/announcements.json";
import type { AnnouncementsResponse } from "@/lib/api/types";

export const dynamic = "force-static";

export async function GET() {
  const body: AnnouncementsResponse = {
    source: "static",
    banners: cms.banners,
    announcements: cms.announcements,
    tokenIntro: cms.tokenIntro,
    dappRules: cms.dappRules,
  };
  return NextResponse.json(body);
}
