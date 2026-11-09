"use client";

import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell shell-tabs">
      <Header />
      <main className="tab-main">{children}</main>
      <TabBar />
    </div>
  );
}
