"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Header } from "@/components/Header";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const home = pathname === "/";
  return (
    <div className={home ? "shell shell-home" : "shell"}>
      <Header />
      <main>{children}</main>
    </div>
  );
}
