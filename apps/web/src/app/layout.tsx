import type { Metadata } from "next";
import { Sora, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { AppShell } from "@/components/AppShell";

const brandFont = Sora({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-brand-face",
  display: "swap",
});

const displayFont = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
  title: "Umidor · BNB Chain DApp",
  description: "Umidor — 首页 / Swap / 推广 / 我的 · 买卖即时奖 · 四档燃烧 · SPCXB 分红",
  icons: {
    icon: "/umidor-logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. minidam-root / theme-light) inject DOM
    // before React hydrates; wallet UI is also gated client-side via useMounted().
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${brandFont.variable} ${displayFont.variable} ${bodyFont.variable}`} suppressHydrationWarning>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
