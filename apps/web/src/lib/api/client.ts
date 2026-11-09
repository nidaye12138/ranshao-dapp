"use client";

import { useEffect, useState } from "react";
import type {
  AnnouncementsResponse,
  EarningsResponse,
  LeaderboardResponse,
  StatsResponse,
  TeamResponse,
} from "@/lib/api/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useApiGet<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getJson<T>(url)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data, error, loading };
}

export function useLeaderboard() {
  return useApiGet<LeaderboardResponse>("/api/leaderboard");
}

export function useAnnouncements() {
  return useApiGet<AnnouncementsResponse>("/api/announcements");
}

export function useStats() {
  return useApiGet<StatsResponse>("/api/stats");
}

export function useTeam(address?: string) {
  const url = address ? `/api/team?address=${address}` : null;
  return useApiGet<TeamResponse>(url);
}

export function useEarnings(address?: string) {
  const url = address ? `/api/earnings?address=${address}` : null;
  return useApiGet<EarningsResponse>(url);
}
