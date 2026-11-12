"use client";

import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import { OnboardingProvider } from "@/components/OnboardingProvider";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OnboardingProvider>
      <div className="shell shell-tabs">
        <Header />
        <main className="tab-main">{children}</main>
        <TabBar />
      </div>
    </OnboardingProvider>
  );
}
