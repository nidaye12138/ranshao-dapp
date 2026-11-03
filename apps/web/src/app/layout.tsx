import type { Metadata } from "next";
import { Syne, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { AppShell } from "@/components/AppShell";

const displayFont = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display-face",
  display: "swap",
});

const bodyFont = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "燃烧 · Ranshao DApp",
  description: "BNB Chain 购买、直推奖励、存币生息与股东登记",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: wallet/browser extensions often inject nodes (e.g. #minidam-root)
    // before React hydrates, which would otherwise surface as recoverable hydration mismatches.
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${displayFont.variable} ${bodyFont.variable}`} suppressHydrationWarning>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
